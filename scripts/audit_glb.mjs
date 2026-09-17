// Auditoria de GLBs do FarmaCheck: tris + texturas + peso.
// Parse direto do contêiner glTF binário (sem três.js): lê o chunk JSON,
// soma tris dos primitives (mode=4) e o tamanho dos bufferViews de imagem.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = process.argv[2] || 'public/models';

function audit(file) {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') return { error: 'not glb' };
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let tris = 0, worstMesh = '';
  const seen = new Set();
  for (const mesh of json.meshes || []) {
    let mTris = 0;
    for (const p of mesh.primitives || []) {
      if (p.indices == null) continue;
      const acc = json.accessors[p.indices];
      if (!acc) continue;
      const count = acc.count;
      if (!seen.has(p.indices)) { seen.add(p.indices); }
      mTris += Math.floor(count / 3);
    }
    tris += mTris;
    if (mTris > 0) worstMesh = `${mesh.name || '?'}:${mTris}`;
  }
  // texturas: měda das imagens embutidas
  let texBytes = 0, texCount = 0, maxTex = 0;
  const viewBytes = (bvIdx) => {
    if (bvIdx == null) return 0;
    const bv = json.bufferViews[bvIdx];
    if (!bv) return 0;
    if ('byteLength' in bv) return bv.byteLength;
    return 0;
  };
  for (const img of json.images || []) {
    if (img.bufferView != null) {
      texCount++;
      const b = viewBytes(img.bufferView);
      texBytes += b;
      if (b > maxTex) maxTex = b;
    } else if (img.uri) texCount++; // externo
  }
  return { tris, texCount, texMB: +(texBytes / 1048576).toFixed(2), maxTexMB: +(maxTex / 1048576).toFixed(2) };
}

const files = readdirSync(DIR).filter(f => f.endsWith('.glb')).sort();
console.log('| arquivo | bytes | tris | texturas | tex MB |');
for (const f of files) {
  const file = join(DIR, f);
  const size = statSync(file).size;
  const r = audit(file);
  if (r.error) { console.log(`| ${f} | ${size} | ERRO ${r.error} | - | - |`); continue; }
  console.log(`| ${f} | ${size} | ${r.tris} | ${r.texCount} | ${r.texMB} |`);
}