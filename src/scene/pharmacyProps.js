import { createGLTFLoader } from './glbLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const loader = createGLTFLoader();
const templates = new Map();
const characterTemplates = new Map();
const collectionMaterials = new Map();

// Uma fonte por URL; cópias compartilham geometria/material das peças estáticas.
// Falhas saem do cache para permitir tentar novamente em uma próxima montagem.
export function loadPharmacyProp(url, prepare) {
  if (!templates.has(url)) {
    const promise = loader.loadAsync(url).then(({ scene }) => {
      // Preserve flags do loader: ativar sombras em todas as 315 peças das
      // gôndolas dobraria o trabalho de renderização, sobretudo em celular.
      prepare?.(scene);
      if (/candidates\/prop_\w+_v002\.glb/.test(url)) {
        scene.traverse((node) => {
          if (!node.isMesh || !node.material || Array.isArray(node.material)) return;
          const original = node.material;
          const key = original.name.replace(/\.\d+$/, '');
          if (!['FarmaPalette', 'FarmaLabels', 'SoftGlass'].includes(key)) return;
          if (collectionMaterials.has(key)) {
            const shared = collectionMaterials.get(key);
            node.material = shared;
            if (original !== shared) {
              if (original.map && original.map !== shared.map) original.map.dispose();
              original.dispose();
            }
          } else collectionMaterials.set(key, original);
          node.castShadow = key === 'FarmaPalette';
          node.receiveShadow = key !== 'SoftGlass';
        });
      }
      return scene;
    }).catch((error) => {
      templates.delete(url);
      throw error;
    });
    templates.set(url, promise);
  }
  return templates.get(url).then((scene) => scene.clone(true));
}

// Skinned background characters need a skeleton-safe clone and their clips;
// static pharmacy props continue through loadPharmacyProp above.
export function loadPharmacyCharacter(url) {
  if (!characterTemplates.has(url)) {
    const promise = loader.loadAsync(url).then(({ scene, animations }) => ({ scene, animations }))
      .catch((error) => {
        characterTemplates.delete(url);
        throw error;
      });
    characterTemplates.set(url, promise);
  }
  return characterTemplates.get(url).then(({ scene, animations }) => ({
    model: cloneSkinned(scene),
    animations,
  }));
}
