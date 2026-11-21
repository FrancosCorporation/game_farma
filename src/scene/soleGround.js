import * as THREE from 'three';

// Referência de solo do personagem.
//
// O osso do dedal (ToeBase) fica alguns milímetros ACIMA da sola: usá-lo
// como referência enterrava o tênis no piso. A sola é medida pelos vértices
// da malha que seguem os ossos do pé — o mesmo critério do preview
// (`public/char-preview.html`) e do `walkFootGrounding.js`.

const normalizeBoneName = (name) => String(name || '').replaceAll(':', '').toLowerCase();
const isFootBone = (name) => {
  const n = normalizeBoneName(name);
  if (n.includes('hand')) return false;
  return /foot$|toebase$|toe_base$/.test(n);
};

/**
 * Vértices da sola: os que seguem os ossos do pé/dedal, com peso suficiente
 * para mover a malha com o pé. Devolve uma lista de { mesh, index }.
 */
export function collectSoleVertices(model, { weightThreshold = 0.15 } = {}) {
  const found = [];
  model.traverse((object) => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const indices = object.geometry.getAttribute('skinIndex');
    const weights = object.geometry.getAttribute('skinWeight');
    if (!indices || !weights) return;
    const footJoints = new Set();
    object.skeleton.bones.forEach((bone, index) => { if (isFootBone(bone.name)) footJoints.add(index); });
    if (!footJoints.size) return;
    const count = object.geometry.getAttribute('position')?.count ?? 0;
    for (let index = 0; index < count; index++) {
      let weight = 0;
      for (let slot = 0; slot < 4; slot++) {
        const joint = indices.getComponent(index, slot);
        if (footJoints.has(joint)) weight += weights.getComponent(index, slot);
      }
      if (weight >= weightThreshold) found.push({ mesh: object, index });
    }
  });
  return found;
}

/** Y mínimo mundial de um conjunto de vértices (a sola). */
export function soleWorldMin(vertices, point = new THREE.Vector3()) {
  let minY = Infinity;
  for (const { mesh, index } of vertices) {
    mesh.getVertexPosition(index, point);
    point.applyMatrix4(mesh.matrixWorld);
    if (point.y < minY) minY = point.y;
  }
  return minY;
}

const applyVertex = (mesh, index, point) => {
  const fn = mesh.applyBoneTransform ? mesh.applyBoneTransform.bind(mesh) : mesh.boneTransform.bind(mesh);
  const pos = mesh.geometry.attributes.position;
  point.set(pos.getX(index), pos.getY(index), pos.getZ(index));
  fn(index, point);
  point.applyMatrix4(mesh.matrixWorld);
  return point.y;
};

/**
 * Mede a sola ao longo do ciclo (Idle + Walk) e devolve o deslocamento
 * vertical que assenta o personagem no piso com a folga pedida.
 *
 * Devolve null quando o rig não tem malha skinned com ossos de pé — nesse
 * caso quem decide a altura é a normalização por Box3.
 */
export function calibrateSoleGround({ model, mixer, clips, clearance = 0.005, idlePhases = 8, walkPhases = 48 }) {
  if (!model || !mixer || !clips) return { ok: false, reason: 'modelo, mixer ou clips ausentes' };
  const vertices = collectSoleVertices(model);
  if (!vertices.length) return { ok: false, reason: 'nenhum vértice segue os ossos do pé' };

  const point = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  const savedTime = mixer.time;
  const savedActions = mixer._actions?.map((action) => ({ action, time: action.time, weight: action.weight, enabled: action.enabled })) || [];

  const measure = () => {
    model.updateMatrixWorld(true);
    for (const { mesh, index } of vertices) {
      const y = applyVertex(mesh, index, point);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  try {
    mixer.stopAllAction();
    const sample = (clip, phases) => {
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.reset().play();
      const duration = clip.duration;
      if (!(duration > 0)) return;
      for (let i = 0; i <= phases; i++) {
        mixer.setTime(duration * (i / phases));
        measure();
      }
      action.stop();
    };
    sample(clips.idle?.getClip?.(), idlePhases);
    sample(clips.walk?.getClip?.(), walkPhases);
  } finally {
    mixer.stopAllAction();
    for (const { action, time, weight, enabled } of savedActions) {
      action.reset().play();
      action.time = time;
      action.weight = weight;
      action.enabled = enabled;
    }
    mixer.setTime(savedTime);
    model.updateMatrixWorld(true);
  }

  if (!Number.isFinite(minY)) return { ok: false, reason: 'nenhuma fase produziu medida de sola' };
  return {
    ok: true,
    minY,
    maxY,
    spread: maxY - minY,
    correction: clearance - minY,
    clearance,
    soleVertices: vertices.length,
  };
}
