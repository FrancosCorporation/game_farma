// fix_ana_idle_seam.mjs (v3 — mutação viva) — mata o "tique nervoso": a
// última chave de vários canais está a até 180° da primeira (artefato do
// bake) → teleporta o membro a cada loop. v1 (dispose da animação) e v2
// (dispose de accessor COMPARTILHADO) quebraram referências. v3: muta o
// array VIVO de getArray() — nada é criado/descartado.
// Uso: node scripts/fix_ana_idle_seam.mjs [glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_seamfix3.glb';
const SEAM_TOL = 2;

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const q4 = (a, i) => ({ x: a[i], y: a[i + 1], z: a[i + 2], w: a[i + 3] });
const ANG = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))) * 180) / Math.PI;

const doc = await io.read(FILE);
const root = doc.getRoot();

for (const anim of root.listAnimations().slice()) {
  let fixados = 0, pior = 0;
  for (const c of anim.listChannels()) {
    const size = c.getTargetPath() === 'rotation' ? 4 : 3;
    const arr = c.getSampler().getOutput().getArray(); // VIVO — mutação direta
    const n = arr.length / size;
    if (c.getTargetPath() !== 'rotation') continue; // translação/escala: já constantes
    const seam = ANG(q4(arr, 0), q4(arr, n - 1));
    if (seam > SEAM_TOL) {
      for (let k = 0; k < size; k++) arr[(n - 1) * size + k] = arr[k]; // última = primeira
      // fallback: se o array não é vivo (getArray devolveu cópia), troca o
      // accessor SEM dispose (dispose de accessor COMPARTILHADO quebra o doc)
      const seamPos = ANG(q4(arr, 0), q4(arr, n - 1));
      if (seamPos > SEAM_TOL) {
        const vals = Float32Array.from(arr);
        for (let k = 0; k < size; k++) vals[(n - 1) * size + k] = vals[k];
        const { Accessor } = await import('@gltf-transform/core');
        const acc = doc.createAccessor().setType(size === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3).setArray(vals);
        c.getSampler().setOutput(acc);
      }
      fixados++;
    }
    pior = Math.max(pior, seam);
  }
  console.log(`[seam-fix] ${anim.getName()}: pior seam ${pior.toFixed(1)}° → ${fixados} canais corrigidos (última chave = primeira)`);
}

if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);

// verifica no ARQUIVO (leitura fresca)
const doc2 = await io.read(FILE);
for (const nm of ['Walk', 'Idle']) {
  const a = doc2.getRoot().listAnimations().find((x) => x.getName() === nm);
  let pior = 0, qual = '';
  for (const c of a.listChannels()) {
    if (c.getTargetPath() !== 'rotation') continue;
    const arr = c.getSampler().getOutput().getArray();
    const n = arr.length / 4;
    const s = ANG(q4(arr, 0), q4(arr, n - 1));
    if (s > pior) { pior = s; qual = c.getTargetNode()?.getName(); }
  }
  console.log(`[seam-fix] ARQUIVO ${nm}: pior seam ${pior.toFixed(2)}° ${pior > SEAM_TOL ? '⚠ ' + qual : '✓'}`);
}
