// retarget_kimodo.mjs — SOMA30 (Kimodo.cpp) → mixamorig (Ana). Produz um GLB
// de PREVIEW (não toca no ana_coriza.glb): mesh da Ana + clip "Kimodo_<nome>"
// com os canais mapeados e o offset de rest pose aplicado por osso.
// Uso: node scripts/retarget_kimodo.mjs <kimodo_animation.glb> <saida.glb>
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const [srcAnim, outPath] = [process.argv[2], process.argv[3]];
const MAP = {
  Hips: 'mixamorig:Hips', Spine1: 'mixamorig:Spine', Spine2: 'mixamorig:Spine1',
  Chest: 'mixamorig:Spine2', Neck1: 'mixamorig:Neck', Neck2: 'mixamorig:Neck',
  Head: 'mixamorig:Head', LeftShoulder: 'mixamorig:LeftShoulder', LeftArm: 'mixamorig:LeftArm',
  LeftForeArm: 'mixamorig:LeftForeArm', LeftHand: 'mixamorig:LeftHand',
  RightShoulder: 'mixamorig:RightShoulder', RightArm: 'mixamorig:RightArm',
  RightForeArm: 'mixamorig:RightForeArm', RightHand: 'mixamorig:RightHand',
  LeftLeg: 'mixamorig:LeftUpLeg', LeftShin: 'mixamorig:LeftLeg',
  LeftFoot: 'mixamorig:LeftFoot', LeftToeBase: 'mixamorig:LeftToeBase',
  RightLeg: 'mixamorig:RightUpLeg', RightShin: 'mixamorig:RightLeg',
  RightFoot: 'mixamorig:RightFoot', RightToeBase: 'mixamorig:RightToeBase',
};
const SKIP = new Set(['Jaw', 'LeftEye', 'RightEye', 'LeftHandThumbEnd', 'LeftHandMiddleEnd', 'RightHandThumbEnd', 'RightHandMiddleEnd']);

const qn = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0]/l, q[1]/l, q[2]/l, q[3]/l]; };
const qmul = (a, b) => qn([
  a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
  a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
  a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
  a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
]);
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

const src = await io.read(srcAnim);
const sroot = src.getRoot();
const kanim = sroot.listAnimations()[0];
const dst = await io.read('public/models/ana_coriza.glb');
const droot = dst.getRoot();

// rest quats do mixamo (por osso)
const restQ = {};
for (const n of droot.listNodes()) restQ[n.getName()] = Array.from(n.getRotation());

const novo = droot.listAnimations().length ? dst.createAnimation('Kimodo') : null;
const nodeOf = new Map(droot.listNodes().map((n) => [n.getName(), n]));
const mkAcc = (arr, type) => dst.createAccessor().setType(type).setArray(Float32Array.from(arr));
let nCh = 0;
for (const c of kanim.listChannels()) {
  const somaName = c.getTargetNode()?.getName();
  const path = c.getTargetPath();
  const mixName = MAP[somaName];
  if (!mixName) continue;
  const node = nodeOf.get(mixName);
  if (!node) continue;
  const times = Array.from(c.getSampler().getInput().getArray());
  const vals = Array.from(c.getSampler().getOutput().getArray());
  if (path === 'translation') {
    // pin: o mesmo valor dos clips Walk/Idle do pub (o frame raw da Ana) —
    // sem isso o Hips fica no REST do node e o corpo explode pra fora do chão.
    if (somaName !== 'Hips') continue;
    const walkAnim = droot.listAnimations().find((a) => a.getName() === 'Walk');
    const wt = walkAnim.listChannels().find((x) => x.getTargetPath() === 'translation' && x.getTargetNode()?.getName() === 'mixamorig:Hips');
    const wv = Array.from(wt.getSampler().getOutput().getArray());
    const nT = times.length;
    const tv = [];
    for (let k = 0; k < nT; k++) for (let j = 0; j < 3; j++) tv.push(wv[j]);
    const inp2 = mkAcc(times, Accessor.Type.SCALAR);
    const out2 = mkAcc(tv, Accessor.Type.VEC3);
    const s2 = dst.createAnimationSampler('Kimodo.Hips.translation').setInput(inp2).setOutput(out2).setInterpolation('STEP');
    novo.addSampler(s2);
    novo.addChannel(dst.createAnimationChannel('Kimodo.Hips.translation').setTargetPath('translation').setTargetNode(node).setSampler(s2));
    continue;
  }

  const size = path === 'rotation' ? 4 : 3;
  const n = vals.length / size;
  if (path === 'rotation') {
    const off = restQ[mixName] || [0, 0, 0, 1];
    for (let k = 0; k < n; k++) {
      const q = [vals[k*4], vals[k*4+1], vals[k*4+2], vals[k*4+3]];
      const nq = qmul(off, q); // delta da animação aplicado NO frame do rest
      for (let j = 0; j < 4; j++) vals[k*4+j] = nq[j];
    }
  }
  const inp = mkAcc(times, Accessor.Type.SCALAR);
  const out = mkAcc(vals, size === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3);
  const sampler = dst.createAnimationSampler(mixName + '.' + path).setInput(inp).setOutput(out).setInterpolation(c.getSampler().getInterpolation());
  novo.addSampler(sampler);
  novo.addChannel(dst.createAnimationChannel(mixName + '.' + path).setTargetPath(path).setTargetNode(node).setSampler(sampler));
  nCh++;
}
console.log('[retarget] canais mapeados:', nCh);
await io.write(outPath, dst);
console.log('[retarget] OK:', outPath, '(Ana + clip Kimodo)');
