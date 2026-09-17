// Calibra os eixos de rotação dos bones do paciente_real.glb (Eric Rigged, Renderpeople).
// Estratégia: lê a hierarquia de nodes do GLB (TRS de repouso via @gltf-transform),
// aplica rotações euler em cada bone-chave e mede o deslocamento WORLD de um efetor
// (ponta da mão, ponta da cabeça, ponta do pé). Escolhe eixo/sinal/ângulo que leva
// o efetor à meta da pose (mão→peito, cabeça→baixo, perna→frente).
// Saída: src/data/rigParams.json consumido por src/scene/patient.js.
import { NodeIO } from '@gltf-transform/core';
import { promises as fs } from 'node:fs';

// ---------- math mínimo (quat + mat4 coluna-maior estilo three) ----------
const qMul = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
const qAxis = (axis, ang) => {
  const s = Math.sin(ang/2);
  return axis==='x' ? [s,0,0,Math.cos(ang/2)] : axis==='y' ? [0,s,0,Math.cos(ang/2)] : [0,0,s,Math.cos(ang/2)];
};
function matFromTRS(t, q, s) {
  const [x,y,z,w]=q, x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
  const [sx,sy,sz]=s;
  return [
    (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
    (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
    (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
const mMul = (a,b) => {
  const o = new Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++)
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
};
const mPoint = (m, p=[0,0,0]) => [
  m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
  m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
  m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],
];

// ---------- carregar hierarquia ----------
const io = new NodeIO();
const doc = await io.read('public/models/paciente_real.glb');
const nodes = doc.getRoot().listNodes();
const byName = new Map(nodes.map(n => [n.getName(), n]));
// escala de normalização do runtime (altura 1.72 já aplicada no loader; aqui medimos cru
// e escalamos as posições no fim só para metas em metros do jogo)
function worldMatrix(name, extra = {}) {
  // sobe a cadeia pai → filho, compõe TRS; extra: { boneName: [x,y,z] euler add }
  const chain = [];
  for (let n = byName.get(name); n; n = n.getParentNode ? n.getParentNode() : null)
    chain.unshift(n);
  let m = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  for (const n of chain) {
    let q = n.getRotation();
    const add = extra[n.getName()];
    if (add) {
      // aplica euler add como quats multiplicados (ordem X→Y→Z)
      for (const ax of ['x','y','z']) {
        const ang = {x:add[0], y:add[1], z:add[2]}[ax];
        if (ang) q = qMul(q, qAxis(ax, ang));
      }
    }
    m = mMul(m, matFromTRS(n.getTranslation(), q, n.getScale()));
  }
  return m;
}
const pos = (name, extra) => mPoint(worldMatrix(name, extra));
const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

// ---------- referências de repouso ----------
const rest = Object.fromEntries(['head_end_08','neck_06','spine_03_05','hand_r_051','hand_l_026','foot_end_l_078','foot_end_r_085']
  .map(n => [n, pos(n)]));
console.log('REST:', Object.fromEntries(Object.entries(rest).map(([k,v])=>[k, v.map(x=>+x.toFixed(3))])));

// meta "peito": ponto entre spine_03 e neck, ligeiramente à frente
const chest = [
  (rest.spine_03_05[0]+rest.neck_06[0])/2,
  (rest.spine_03_05[1]+rest.neck_06[1])/2 - 0.02,
  Math.max(rest.spine_03_05[2], rest.neck_06[2]) + 0.12,
];
console.log('chest target:', chest.map(x=>+x.toFixed(3)));

// ---------- busca gulosa: melhor euler por bone ----------
function tune(bone, eff, metric, angles=[0.2,0.4,0.6,0.9,1.2], extra0={}) {
  let best = { euler: [0,0,0], score: metric(pos(eff, extra0)) };
  for (let pass=0; pass<2; pass++) {
    let improved = false;
    for (let ax=0; ax<3; ax++) {
      for (const sign of [1,-1]) {
        for (const ang of angles) {
          const e = [...best.euler]; e[ax] = sign*ang;
          const sc = metric(pos(eff, { ...extra0, [bone]: e }));
          if (sc < best.score) { best = { euler: e, score: sc }; improved = true; }
        }
      }
    }
    if (!improved) break;
  }
  return { ...best, world: pos(eff, { ...extra0, [bone]: best.euler }) };
}

// 1) braço direito → mão no peito (upperarm primeiro, depois lowerarm)
const mHand = (p) => dist(p, chest);
const armUp = tune('upperarm_r_049', 'hand_r_051', mHand);
console.log('upperarm_r euler:', armUp.euler, 'dist', armUp.score.toFixed(3));
const armLo = tune('lowerarm_r_050', 'hand_r_051', mHand, [0.2,0.4,0.6,0.9,1.2,1.6], { upperarm_r_049: armUp.euler });
console.log('lowerarm_r euler:', armLo.euler, 'dist', armLo.score.toFixed(3));

// 2) cabeça baixa: maximizar Z (testa p/ frente) e minimizar Y do head_end
const mHeadDown = (p) => -(p[2]) + Math.abs(p[1]-rest.head_end_08[1])*0.5;
const neckT  = tune('neck_06',  'head_end_08', mHeadDown, [0.1,0.2,0.35,0.5]);
const headT  = tune('head_07',  'head_end_08', mHeadDown, [0.1,0.2,0.35,0.5], { neck_06: neckT.euler });
console.log('neck:', neckT.euler, 'head:', headT.euler);

// 3) curvado: spine leva head_end pra frente/baixo
const mBend = (p) => -p[2]*1.5 + (p[1]-rest.head_end_08[1])*0.0 + Math.abs(p[0])*0.5
  + Math.max(0, p[1]-rest.head_end_08[1])*2; // não deixar subir
const sp1 = tune('spine_01_03', 'head_end_08', mBend, [0.1,0.2,0.3,0.45]);
const sp2 = tune('spine_02_04', 'head_end_08', mBend, [0.1,0.2,0.3,0.45], { spine_01_03: sp1.euler });
console.log('spine_01:', sp1.euler, 'spine_02:', sp2.euler);

// 4) perna p/ frente (walk): upperleg leva o pé p/ +Z
const mStep = (p) => -p[2];
const legL = tune('upperleg_l_074', 'foot_end_l_078', mStep, [0.15,0.3,0.5,0.7]);
console.log('upperleg_l step:', legL.euler);
const shinL = tune('lowerleg_l_075', 'foot_end_l_078',
  (p)=> Math.abs(p[2]-(rest.foot_end_l_078[2]))*-1, [0.2,0.4,0.6,0.9],
  { upperleg_l_074: legL.euler });
console.log('lowerleg_l (dobrar joelho no passo):', shinL.euler);

// qual eixo gira a cabeça p/ olhar p/ esquerda (yaw)?
const mYaw = (p) => -p[0]; // testa p/ -X = esquerda do paciente?
const yawT = tune('head_07', 'head_end_08', mYaw, [0.2,0.4,0.6]);
console.log('head glance euler:', yawT.euler);

// pálpebra p/ baixo (piscar): eyelid deve descer → minimizar Y? medir eixo que mais muda Y
const blinkProbe = {};
for (const ax of ['x','y','z']) {
  const e = {x:[0.3,0,0], y:[0,0.3,0], z:[0,0,0.3]}[ax];
  const p1 = pos('eyelid_end_l_018', { eyelid_l_017: e });
  const p0 = pos('eyelid_end_l_018');
  blinkProbe[ax] = +(p1[1]-p0[1]).toFixed(4);
}
console.log('eyelid deltaY por eixo:', blinkProbe);

const params = {
  generated: new Date().toISOString(),
  model: 'paciente_real.glb (Eric Rigged, Renderpeople CC-BY)',
  mao_no_peito: { upperarm_r_049: armUp.euler, lowerarm_r_050: armLo.euler },
  cabeca_baixa: { neck_06: neckT.euler, head_07: headT.euler },
  curvado: { spine_01_03: sp1.euler, spine_02_04: sp2.euler, neck_06: neckT.euler.map(v=>v*0.4), head_07: headT.euler.map(v=>v*0.4) },
  walk: { upperleg_l_074: legL.euler, lowerleg_l_075: shinL.euler,
          upperleg_r_081: legL.euler.map(v=>-v), lowerleg_r_082: shinL.euler.map(v=>-v) },
  glance: { head_07: yawT.euler },
  blinkProbe,
};
await fs.mkdir('src/data', { recursive: true });
await fs.writeFile('src/data/rigParams.json', JSON.stringify(params, null, 2));
console.log('OK → src/data/rigParams.json');
