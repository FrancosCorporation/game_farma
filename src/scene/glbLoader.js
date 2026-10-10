import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Loader GLTF compartilhado, com suporte a EXT_meshopt_compression (meshopt).
// Isso permite comprimir a geometria dos .glb (gltfpack/gltf-transform --compress meshopt)
// sem alterar o contrato de carregamento em patient.js / pharmacy.js.
// MeshoptDecoder é JS puro (sem .wasm) → empacotado pelo Vite, zero assets extras.
// 29/09: Cache do three DESLIGADO — com ele ligado, o load do paciente e o das
// atendentes (mesma URL) colidiam no cache e as TEXTURAS viravam null → a
// personagem renderizava preta ("retângulo preto") no meio da cena escura.
const shared = new GLTFLoader();
shared.setMeshoptDecoder(MeshoptDecoder);

// FITAS (PO 29/09: "vem caminhando esticada, pela sombra até o teto; parada
// fica normal"): a malha tem vértices ponderados aos bones de PONTA (dedos,
// HeadTop_End, Toe_End) do retarget — no bind tudo cancela (por isso parada
// fica perfeita), mas QUALQUER animação dessas pontas arremessa os vértices
// em fitas finas (visíveis na sombra projetada). Congelar os bones de ponta
// nos clips mata as fitas sem tocar na malha: ficam parados no bind.
const FREEZE_BONES = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;
export function sanitizeClips(gltf) {
  let removed = 0;
  for (const clip of gltf.animations || []) {
    const before = clip.tracks.length;
    clip.tracks = clip.tracks.filter((t) => !FREEZE_BONES.test(t.name.split('.')[0]));
    removed += before - clip.tracks.length;
  }
  if (removed) console.log(`[glbLoader] ${removed} tracks de bones de ponta congelados (anti-fita)`);
  return gltf;
}

export function createGLTFLoader() {
  return shared;
}