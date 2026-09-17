import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Loader GLTF compartilhado, com suporte a EXT_meshopt_compression (meshopt).
// Isso permite comprimir a geometria dos .glb (gltfpack/gltf-transform --compress meshopt)
// sem alterar o contrato de carregamento em patient.js / pharmacy.js.
// MeshoptDecoder é JS puro (sem .wasm) → empacotado pelo Vite, zero assets extras.
const shared = new GLTFLoader();
shared.setMeshoptDecoder(MeshoptDecoder);

export function createGLTFLoader() {
  return shared;
}