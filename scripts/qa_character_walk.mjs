// Isolated in-game walk QA; an optional GLB path intercepts ana_clasica for candidate-only testing.
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:4180/';
const candidatePath = process.argv[3] ? resolve(process.argv[3]) : null;
const artifactDir = process.env.WALK_QA_OUTPUT_DIR ? resolve(process.env.WALK_QA_OUTPUT_DIR) : process.cwd();
if (process.env.WALK_QA_OUTPUT_DIR) mkdirSync(artifactDir, { recursive: true });
const artifact = (name) => join(artifactDir, name);
if (candidatePath && !statSync(candidatePath).isFile()) throw new Error(`candidato GLB inválido: ${candidatePath}`);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const logs = [];
let candidateServed = false;
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
if (candidatePath) {
  await page.route('**/models/ana_clasica.glb*', async (route) => {
    candidateServed = true;
    await route.fulfill({ path: candidatePath, contentType: 'model/gltf-binary', headers: { 'cache-control': 'no-store' } });
  });
}
const qaUrl = new globalThis.URL(URL);
qaUrl.searchParams.set('qaFootContact', '1');
await page.goto(qaUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000, polling: 200 });
await page.evaluate(() => document.getElementById('capa-iniciar').click());
await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 120000, polling: 300 });
await page.waitForFunction(() => typeof window.__farmacheck?.game?.avatar?.walk === 'function', null, { timeout: 120000, polling: 300 });
if (candidatePath && !candidateServed) throw new Error('o runtime não solicitou a rota do GLB candidato');
await page.evaluate(() => {
  const av = window.__farmacheck.game.avatar;
  window.__walkTrace = [];
  const walk = av.walk;
  av.walk = function (from, to, dur, faceEnd) {
    const record = { from: from.toArray(), to: to.toArray(), dur, faceEnd, positions: [], completed: false };
    window.__walkTrace.push(record);
    const p = walk.call(this, from, to, dur, faceEnd);
    Promise.resolve(p).finally(() => {
      record.completed = true;
      record.endPosition = this.root.position.toArray();
    });
    return p;
  };
  const update = av.update;
  window.__rawAvatarUpdate = update;
  window.__manualAvatarDrive = false;
  av.update = function (dt, t) {
    if (window.__manualAvatarDrive) return;
    update.call(this, dt, t);
    const record = window.__walkTrace.at(-1);
    if (record && !record.completed) record.positions.push(this.root.position.toArray());
  };
});
// Keep the fixture on Ana's shared boot route when testing a candidate in isolation.
// Case→model mapping has a separate integration gate.
await page.evaluate(() => {
  const g = window.__farmacheck.game;
  g.nextPatient = () => g.startCase(g.cases.find(c => c.id === 'ana_coriza'));
});
await page.click('#btn-iniciar');
try {
  await page.waitForFunction(() => (window.__walkTrace?.[0]?.positions?.length || 0) > 10, null, { timeout: 15000, polling: 100 });
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    capa: document.documentElement.dataset.capaPronta,
    jogo: document.documentElement.dataset.jogoPronto,
    state: window.__farmacheck?.game?.state,
    avatarVisible: window.__farmacheck?.game?.avatar?.root?.visible,
    walkTrace: window.__walkTrace?.map(({ from, to, completed, positions }) => ({ from, to, completed, samples: positions.length })),
  }));
  console.error(JSON.stringify({ startupDiagnostic: diagnostic, logs }, null, 2));
  throw error;
}
await page.waitForTimeout(500);
await page.screenshot({ path: artifact('ntr_entry_walk.png') });
await page.locator('canvas').first().screenshot({ path: artifact('ntr_entry_walk_canvas.png') });
// Chromium headless can throttle RAF enough to make a 5.8 m arrival exceed
// several minutes. Advance the same avatar update path at fixed 60 Hz; the
// wrapper above records every simulated root sample for the trajectory gate.
await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  const avatar = game.avatar;
  for (let i = 0; i < 1200 && game.state === 'CHEGADA'; i++) {
    avatar.update(1 / 60, (i + 1) / 60);
    await Promise.resolve();
  }
});
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 300000, polling: 500 });
await page.screenshot({ path: artifact('ntr_idle.png') });
const data = await page.evaluate(async () => {
  const g = window.__farmacheck.game; const av = g.avatar; const V = av.root.position.constructor;
  const bones = {}; av.getModel().traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const names = Object.keys(bones);
  const pick = (re) => names.find((n) => re.test(n));
  const Hips = bones[pick(/hips/i)], Head = bones[pick(/head$/i)];
  const FL = bones[pick(/leftfoot$/i)], FR = bones[pick(/rightfoot$/i)];
  const read = (b) => { const v = new V(); b.getWorldPosition(v); return [v.x, v.y, v.z]; };
  const readLocal = (b) => { const v = new V(); b.getWorldPosition(v); av.root.updateMatrixWorld(true); av.root.worldToLocal(v); return [v.x, v.y, v.z]; };
  const kneeReading = side => {
    const h = new V().fromArray(readLocal(bones[pick(new RegExp(side + 'upleg$', 'i'))]));
    const k = new V().fromArray(readLocal(bones[pick(new RegExp(side + 'leg$', 'i'))]));
    const a = new V().fromArray(readLocal(bones[pick(new RegExp(side + 'foot$', 'i'))]));
    const axis = a.clone().sub(h).normalize(), bend = k.clone().sub(h); bend.addScaledVector(axis, -bend.dot(axis));
    return { forwardBend: bend.z, flexDegrees: k.clone().sub(h).angleTo(a.clone().sub(k)) * 180 / Math.PI };
  };
  const DT = 1/60; const idle = [];
  for (let i = 0; i < 240; i++) { av.update(DT, (i + 1) * DT); if (i % 8 === 0) idle.push({ h: read(Hips), hd: read(Head) }); }
  const range = (k, j) => Math.max(...idle.map((s) => s[k][j])) - Math.min(...idle.map((s) => s[k][j]));
  const idleHips = [range('h',0), range('h',1), range('h',2)].map((x) => +x.toFixed(4));
  const idleHeadY = +(range('hd',1)).toFixed(4);
  const W = [];
  const start = new V(-1.7, 0, 0.55), target = new V(1.7, 0, 0.55);
  const p = av.walk(start, target);
  window.__manualAvatarDrive = true;
  for (let i = 0; i < 900; i++) {
    window.__rawAvatarUpdate.call(av, DT, (240 + i + 1) * DT);
    const activeRecord = window.__walkTrace.at(-1);
    if (activeRecord && !activeRecord.completed) activeRecord.positions.push(av.root.position.toArray());
    if (i % 3 === 0) {
      const grounding = av.getWalkFootGroundingDiagnostics();
      W.push({ t:(i+1)*DT, fl: readLocal(FL), fr: readLocal(FR), pelvis: readLocal(Hips),
        knees: { left: kneeReading('left'), right: kneeReading('right') }, sole: grounding?.last || null, corrections: grounding?.corrections ?? 0 });
    }
    if (i > 10 && av.root.position.distanceTo(target) < 0.005) break;
  }
  window.__manualAvatarDrive = false;
  await p.catch(() => {});
  const fRange = (f, j) => +(Math.max(...W.map((s) => s[f][j])) - Math.min(...W.map((s) => s[f][j]))).toFixed(3);
  const stride = +Math.max(...W.map((s) => Math.abs(s.fl[2] - s.fr[2]))).toFixed(3);
  const rootEnd = av.root.position.distanceTo(target);
  const r = window.__walkTrace?.[0];
  const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  const startPoint = r?.positions[0] || r?.from;
  const endPoint = r?.endPosition || r?.positions.at(-1);
  const delta = r ? r.to.map((v, i) => v - r.from[i]) : [0, 0, 0];
  const lengthSq = delta.reduce((sum, v) => sum + v * v, 0) || 1;
  const progress = r ? r.positions.map((p) => p.reduce((sum, v, i) => sum + (v - r.from[i]) * delta[i], 0) / lengthSq) : [];
  const crossTrack = r ? r.positions.map((p, j) => dist(p, r.from.map((v, i) => v + delta[i] * progress[j]))) : [];
  const entry = r ? { from:r.from, to:r.to, faceEnd:r.faceEnd, completed:r.completed,
    samples:r.positions.length, distance:Math.sqrt(lengthSq), startError:dist(startPoint,r.from),
    endError:endPoint ? dist(endPoint,r.to) : null,
    progressStart:+Math.min(...progress).toFixed(3), progressEnd:+Math.max(...progress).toFixed(3),
    crossTrackMax:+Math.max(0,...crossTrack).toFixed(4),
    monotonic:progress.every((v,i)=>i===0||v>=progress[i-1]-0.01) } : null;
  const soleSamples = W.map((sample) => sample.sole).filter(Boolean);
  const maxSupportGap = soleSamples.length ? Math.max(...soleSamples.map((s) => Math.min(s.leftMinY, s.rightMinY))) : null;
  const deepestSolePenetration = soleSamples.length
    ? Math.max(0, -Math.min(...soleSamples.flatMap((s) => [s.leftMinY, s.rightMinY])))
    : null;
  const bothFeetElevatedPercent = soleSamples.length
    ? +(100 * soleSamples.filter((s) => s.leftMinY > 0.025 && s.rightMinY > 0.025).length / soleSamples.length).toFixed(1)
    : null;
  const maxIKReachError = soleSamples.length
    ? Math.max(0, ...soleSamples.flatMap((s) => s.corrections || []).map((c) => c.targetReachErrorMeters || 0))
    : null;
  const maxHorizontalProjection = soleSamples.length
    ? Math.max(0, ...soleSamples.flatMap((s) => s.corrections || []).map((c) => c.horizontalCorrectionMeters || 0))
    : null;
  const clampedIKSamples = soleSamples.reduce((sum, s) => sum + (s.corrections || []).filter((c) => c.targetClamped).length, 0);
  const groundingFrames = W.filter((sample) => sample.sole).length;
  const totalIKCorrections = Math.max(0, ...W.map((sample) => sample.corrections));
  const supportDrift = Object.fromEntries(['left', 'right'].map((side) => {
    const groups = [];
    let active = [];
    for (const sample of soleSamples) {
      const point = sample[`${side}AnchorPoint`] || sample[`${side}Point`];
      if ((sample.supportSides || []).includes(side) && point) {
        active.push({ t: sample.phase, p: point });
      } else if (active.length) {
        if (active.length > 1) groups.push(active);
        active = [];
      }
    }
    if (active.length > 1) groups.push(active);
    const spans = groups.map((group) => {
      const xs = group.map(({ p }) => p[0]);
      const zs = group.map(({ p }) => p[2]);
      const dx = Math.max(...xs) - Math.min(...xs);
      const dz = Math.max(...zs) - Math.min(...zs);
      return { samples: group.length, phaseStart: group[0].t, phaseEnd: group.at(-1).t, horizontalSpanMeters: Math.hypot(dx, dz) };
    });
    return [side, {
      stanceIntervals: spans.length,
      maxHorizontalSpanMeters: spans.length ? +Math.max(...spans.map((span) => span.horizontalSpanMeters)).toFixed(4) : null,
      worstInterval: spans.reduce((worst, span) => !worst || span.horizontalSpanMeters > worst.horizontalSpanMeters ? span : worst, null),
    }];
  }));
  const worstSupportSample = W.filter((sample) => sample.sole).reduce((worst, sample) => {
    const gap = Math.min(sample.sole.leftMinY, sample.sole.rightMinY);
    return !worst || gap > worst.gap ? { gap, sample } : worst;
  }, null);
  return { bones: names.length, idleHips, idleHeadY,
    entry, trace: W,
    walk: { footL_y: fRange('fl',1), footR_y: fRange('fr',1), footL_x: fRange('fl',0), footR_x: fRange('fr',0),
      kinematics: { ankleWidthMax: Math.max(...W.map(s => Math.abs(s.fl[0] - s.fr[0]))),
        pelvisYRange: [Math.min(...W.map(s => s.pelvis[1])), Math.max(...W.map(s => s.pelvis[1]))],
        knees: Object.fromEntries(['left', 'right'].map(side => [side, {
          backwardSamples: W.filter(s => s.knees[side].forwardBend < -.005).length,
          minForwardBend: Math.min(...W.map(s => s.knees[side].forwardBend)),
          maxFlexDegrees: Math.max(...W.map(s => s.knees[side].flexDegrees)) }])) },
      strideMax: stride, samples: W.length,
      footL_z: fRange('fl',2), footR_z: fRange('fr',2), rootEndError: +rootEnd.toFixed(4),
      footLminY: +Math.min(...W.map((s) => s.fl[1])).toFixed(3), footRminY: +Math.min(...W.map((s) => s.fr[1])).toFixed(3),
      soleSamples: soleSamples.length,
      leftSoleYRange: soleSamples.length ? [+Math.min(...soleSamples.map((s) => s.leftMinY)).toFixed(4), +Math.max(...soleSamples.map((s) => s.leftMinY)).toFixed(4)] : null,
      rightSoleYRange: soleSamples.length ? [+Math.min(...soleSamples.map((s) => s.rightMinY)).toFixed(4), +Math.max(...soleSamples.map((s) => s.rightMinY)).toFixed(4)] : null,
      maxSupportGap: maxSupportGap == null ? null : +maxSupportGap.toFixed(4),
      deepestSolePenetration: deepestSolePenetration == null ? null : +deepestSolePenetration.toFixed(4),
      bothFeetElevatedPercent,
      footContactAuditAvailable: !!soleSamples.length,
      supportPointDefinition: av.getWalkFootGroundingDiagnostics()?.driftPointDefinition ?? null,
      groundingFrames,
      totalIKCorrections,
      maxIKReachError,
      maxHorizontalProjection,
      supportDrift,
      clampedIKSamples,
      worstSupportSample: worstSupportSample ? {
        t: +worstSupportSample.sample.t.toFixed(3),
        leftMinY: worstSupportSample.sample.sole.leftMinY,
        rightMinY: worstSupportSample.sample.sole.rightMinY,
        corrections: worstSupportSample.sample.sole.corrections,
      } : null } };
});
if (process.env.WALK_QA_TRACE) writeFileSync(resolve(process.env.WALK_QA_TRACE), JSON.stringify(data.trace));
delete data.trace;
// walk em tempo real p/ screenshot no meio (via rAF do jogo)
await page.evaluate(() => { const V = window.__farmacheck.game.avatar.root.position.constructor; window.__farmacheck.game.avatar.walk(new V(1.7, 0, 0.55), new V(-1.7, 0, 0.55)); });
await page.waitForTimeout(1400);
await page.screenshot({ path: artifact('ntr_walk.png') });
await page.locator('canvas').first().screenshot({ path: artifact('ntr_walk_canvas.png') });
await page.waitForTimeout(6000);
await page.screenshot({ path: artifact('ntr_interacao.png') });
await browser.close();
console.log(JSON.stringify(data, null, 1));
console.log('--- logs ---');
console.log(logs.filter((l) => /\[patient\]|\[glbLoader\]|\[atendente\]|pageerror/i.test(l)).join('\n'));
const failures = [];
if (!Number.isFinite(data.idleHeadY) || data.idleHips.some(v => !Number.isFinite(v))) failures.push('Idle contém medição não finita');
if (!data.walk.footContactAuditAvailable || data.walk.soleSamples < 20) failures.push('auditoria obrigatória das solas não coletou amostras suficientes');
if (data.walk.footContactAuditAvailable && [data.walk.maxSupportGap, data.walk.deepestSolePenetration, data.walk.bothFeetElevatedPercent, ...Object.values(data.walk.supportDrift).map(s => s.maxHorizontalSpanMeters)].some(v => !Number.isFinite(v))) failures.push('auditoria das solas contém medição ausente/não finita');
if (logs.some(l => l.startsWith('[pageerror]'))) failures.push('erro JavaScript no runtime');
if (!data.walk.kinematics || Object.values(data.walk.kinematics.knees).some(k => !Number.isFinite(k.minForwardBend) || k.backwardSamples > 0)) failures.push('joelho invertido/hiperestendido para trás no ciclo');
if (!data.entry?.completed || data.entry.endError > 0.02) failures.push('entrada não concluiu no destino previsto');
if (!data.entry || data.entry.samples < 20 || data.entry.progressEnd < 0.98 || !data.entry.monotonic || data.entry.crossTrackMax > 0.04) failures.push('trajeto de entrada ausente, não monotônico ou fora do corredor');
if (data.walk.rootEndError > 0.02) failures.push('walk de teste não terminou no alvo');
if (data.walk.footL_z < 0.25 || data.walk.footR_z < 0.25 || data.walk.strideMax < 0.2) failures.push('pés sem passada alternada detectável');
if (data.idleHips.some((v) => v > 0.05)) failures.push('Idle move o Hips mais que 0,05 m no runtime');
if (data.walk.footContactAuditAvailable && data.walk.maxSupportGap > 0.015) failures.push('nenhuma sola fica a até 15 mm do chão em parte da caminhada');
if (data.walk.footContactAuditAvailable && data.walk.bothFeetElevatedPercent > 0) failures.push('há amostras com os dois pés acima de 25 mm');
if (data.walk.footContactAuditAvailable && Object.values(data.walk.supportDrift).some((side) => side.maxHorizontalSpanMeters > 0.05)) failures.push('sola desliza mais de 5 cm durante uma janela de contato');
if (data.walk.footContactAuditAvailable && data.walk.deepestSolePenetration > 0.015) failures.push('sola atravessa o chão por mais de 15 mm');
if (data.walk.footContactAuditAvailable && data.walk.maxHorizontalProjection > 0.05) failures.push('IK projeta o pé horizontalmente mais de 5 cm para alcançar o piso');
if (process.env.WALK_QA_REPORT_PATH) {
  const reportPath = resolve(process.env.WALK_QA_REPORT_PATH);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ result: failures.length ? 'FAIL' : 'PASS', failures, candidatePath, ...data }, null, 2)}\n`);
}
console.log(failures.length ? `\n❌ walk QA: ${failures.join('; ')}` : '\n✅ walk QA: entrada, destino, passada e Idle OK');
process.exitCode = failures.length ? 1 : 0;
