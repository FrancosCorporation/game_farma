import * as THREE from 'three';

const normalizeBoneName = (name) => name.replaceAll(':', '').toLowerCase();

export function rotateBoneToward(bone, currentEnd, targetEnd, model) {
  const start = bone.getWorldPosition(new THREE.Vector3());
  const currentDirection = currentEnd.clone().sub(start).normalize();
  const targetDirection = targetEnd.clone().sub(start).normalize();
  if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) return;

  const worldDelta = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const targetWorldRotation = worldDelta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentWorldRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parentWorldRotation.multiply(targetWorldRotation)).normalize();
  model.updateMatrixWorld(true);
}

export function solveLeg(leg, targetAnkle, model) {
  const { upper, lower, foot } = leg;
  const hip = upper.getWorldPosition(new THREE.Vector3());
  const knee = lower.getWorldPosition(new THREE.Vector3());
  const ankle = foot.getWorldPosition(new THREE.Vector3());
  const footWorldRotation = foot.getWorldQuaternion(new THREE.Quaternion());
  const upperLength = hip.distanceTo(knee);
  const lowerLength = knee.distanceTo(ankle);
  if (!(upperLength > 1e-4 && lowerLength > 1e-4)) return { solved: false, reason: 'segmento de perna degenerado' };

  const requestedAnkle = targetAnkle.clone();
  const maxDistance = upperLength + lowerLength - 1e-4;
  const verticalGap = targetAnkle.y - hip.y;
  let horizontalCorrection = 0;
  if (Math.abs(verticalGap) < maxDistance) {
    const horizontal = new THREE.Vector3(targetAnkle.x - hip.x, 0, targetAnkle.z - hip.z);
    const maxHorizontal = Math.sqrt(maxDistance ** 2 - verticalGap ** 2);
    if (horizontal.length() > maxHorizontal) {
      const oldLength = horizontal.length();
      horizontal.setLength(maxHorizontal);
      targetAnkle.x = hip.x + horizontal.x;
      targetAnkle.z = hip.z + horizontal.z;
      horizontalCorrection = oldLength - maxHorizontal;
    }
  }
  const toTarget = targetAnkle.clone().sub(hip);
  const distance = toTarget.length();
  const minDistance = Math.abs(upperLength - lowerLength) + 1e-4;
  const clampedDistance = THREE.MathUtils.clamp(distance, minDistance, maxDistance);
  const direction = toTarget.normalize();

  // A calibrated pole disambiguates nearly straight legs. Preserving the
  // source bend alone can bake an inverted knee when the source crosses zero.
  const bend = leg.poleDirectionWorld?.clone() || knee.clone().sub(hip);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
    if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
  }
  bend.normalize();

  const along = (upperLength ** 2 - lowerLength ** 2 + clampedDistance ** 2) / (2 * clampedDistance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const targetKnee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const reachableAnkle = hip.clone().addScaledVector(direction, clampedDistance);

  rotateBoneToward(upper, knee, targetKnee, model);
  const solvedKnee = lower.getWorldPosition(new THREE.Vector3());
  const solvedAnkle = foot.getWorldPosition(new THREE.Vector3());
  rotateBoneToward(lower, solvedAnkle, reachableAnkle, model);
  // Keep the animated shoe pitch while the thigh/calf solve moves the ankle.
  const footParentRotation = foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  foot.quaternion.copy(footParentRotation.multiply(footWorldRotation)).normalize();
  model.updateMatrixWorld(true);
  const finalAnkle = foot.getWorldPosition(new THREE.Vector3());

  return {
    solved: true,
    targetReachErrorMeters: Number(finalAnkle.distanceTo(targetAnkle).toFixed(4)),
    kneeMoveMeters: Number(solvedKnee.distanceTo(targetKnee).toFixed(4)),
    requestedChainLengthMeters: Number(requestedAnkle.distanceTo(hip).toFixed(4)),
    adjustedChainLengthMeters: Number(distance.toFixed(4)),
    maximumReachMeters: Number(maxDistance.toFixed(4)),
    horizontalCorrectionMeters: Number(horizontalCorrection.toFixed(4)),
    targetClamped: Math.abs(distance - clampedDistance) > 1e-4,
  };
}

/**
 * Adds a per-leg two-bone correction during a Mixamo-style Walk clip.
 * It keeps the currently lower sole near the floor with a two-bone solve,
 * without moving the character root or torso. This remains opt-in until both
 * sole height and horizontal drift pass runtime QA.
 */
function deriveSupportWindows(model, walkAction, mainMixer, restoreAction) {
  if (!walkAction || !mainMixer || !restoreAction) return null;
  const clip = walkAction.getClip();
  if (!(clip.duration > 0)) return null;
  const auditMixer = new THREE.AnimationMixer(model);
  const auditAction = auditMixer.clipAction(clip);
  auditAction.play();
  const minima = { left: [], right: [] };
  const vector = new THREE.Vector3();
  for (let index = 0; index < 120; index++) {
    const phase = index / 120;
    auditMixer.setTime(clip.duration * phase);
    model.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      let minY = Infinity;
      for (const { mesh, index: vertexIndex } of model.userData._walkFootSoleVertices?.[side] ?? []) {
        mesh.getVertexPosition(vertexIndex, vector);
        vector.applyMatrix4(mesh.matrixWorld);
        minY = Math.min(minY, vector.y);
      }
      minima[side].push(minY);
    }
  }
  auditMixer.stopAllAction();
  mainMixer.stopAllAction();
  restoreAction.reset().play();
  mainMixer.setTime(0);
  model.updateMatrixWorld(true);

  const center = Object.fromEntries(['left', 'right'].map((side) => {
    const index = minima[side].indexOf(Math.min(...minima[side]));
    return [side, index / minima[side].length];
  }));
  const leftAfterRight = ((center.left - center.right) % 1 + 1) % 1;
  if (leftAfterRight < 0.25 || leftAfterRight > 0.75) return null;
  const rightAfterLeft = 1 - leftAfterRight;
  const leftStart = (center.left - leftAfterRight / 2 + 1) % 1;
  const leftEnd = (center.left + rightAfterLeft / 2) % 1;
  const overlap = 0.025;
  return {
    left: { start: (leftStart - overlap + 1) % 1, end: (leftEnd + overlap) % 1 },
    right: { start: (leftEnd - overlap + 1) % 1, end: (leftStart + overlap) % 1 },
    contactCenters: center,
  };
}

export function createWalkFootGrounding(model, root, { floorY = 0, soleClearance = 0.005, weightThreshold = 0.15, maxSoleVertices = 512, mixer, walkAction, restoreAction } = {}) {
  const rigs = {};
  for (const side of ['Left', 'Right']) {
    const leg = {
      upper: null,
      lower: null,
      foot: null,
      vertices: [],
    };
    model.traverse((object) => {
      if (!object.isBone) return;
      const name = normalizeBoneName(object.name);
      if (name === normalizeBoneName(`mixamorig${side}UpLeg`)) leg.upper = object;
      if (name === normalizeBoneName(`mixamorig${side}Leg`)) leg.lower = object;
      if (name === normalizeBoneName(`mixamorig${side}Foot`)) leg.foot = object;
    });
    if (leg.upper && leg.lower && leg.foot) rigs[side.toLowerCase()] = leg;
  }
  if (!rigs.left || !rigs.right) return null;

  const skinnedMeshes = [];
  model.traverse((object) => { if (object.isSkinnedMesh && object.skeleton) skinnedMeshes.push(object); });
  for (const mesh of skinnedMeshes) {
    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    if (!indices || !weights) continue;
    const footJointIndices = { left: new Set(), right: new Set() };
    mesh.skeleton.bones.forEach((bone, index) => {
      const name = normalizeBoneName(bone.name);
      if (name === 'mixamorigleftfoot' || name === 'mixamoriglefttoebase') footJointIndices.left.add(index);
      if (name === 'mixamorigrightfoot' || name === 'mixamorigrighttoebase') footJointIndices.right.add(index);
    });
    const vertexCount = mesh.geometry.getAttribute('position')?.count ?? 0;
    for (let index = 0; index < vertexCount; index++) {
      let leftWeight = 0, rightWeight = 0;
      for (let slot = 0; slot < 4; slot++) {
        const joint = indices.getComponent(index, slot);
        const weight = weights.getComponent(index, slot);
        if (footJointIndices.left.has(joint)) leftWeight += weight;
        if (footJointIndices.right.has(joint)) rightWeight += weight;
      }
      if (leftWeight >= weightThreshold) rigs.left.vertices.push({ mesh, index });
      if (rightWeight >= weightThreshold) rigs.right.vertices.push({ mesh, index });
    }
  }
  if (!rigs.left.vertices.length || !rigs.right.vertices.length) return null;

  const point = new THREE.Vector3();
  model.userData._walkFootSoleVertices = {
    left: rigs.left.vertices,
    right: rigs.right.vertices,
  };
  const supportWindows = deriveSupportWindows(model, walkAction, mixer, restoreAction);
  delete model.userData._walkFootSoleVertices;
  // A baked clip may have flat contact plateaus without distinct minima.
  // Measuring soles must not depend on deriving windows for experimental IK.

  // The full influence scan is useful in QA. Experimental IK may request a
  // bounded list so iterating thousands of vertices does not stall the game.
  const candidateCounts = { left: rigs.left.vertices.length, right: rigs.right.vertices.length };
  model.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const ranked = rigs[side].vertices.map((vertex) => {
      vertex.mesh.getVertexPosition(vertex.index, point);
      point.applyMatrix4(vertex.mesh.matrixWorld);
      return { ...vertex, y: point.y };
    }).sort((a, b) => a.y - b.y);
    const landmarkPool = ranked.filter(v => v.y <= ranked[0].y + 0.004);
    const landmarkCount = Math.min(64, landmarkPool.length);
    rigs[side].contactVertices = Array.from({ length: landmarkCount }, (_, i) => landmarkPool[Math.floor(i * landmarkPool.length / landmarkCount)]);
    rigs[side].vertices = ranked.slice(0, Math.min(maxSoleVertices, ranked.length)).map(({ mesh, index }) => ({ mesh, index }));
  }

  const measureSole = (leg) => {
    let minY = Infinity;
    let minPoint = null;
    for (const { mesh, index } of leg.vertices) {
      mesh.getVertexPosition(index, point);
      point.applyMatrix4(mesh.matrixWorld);
      if (point.y < minY) {
        minY = point.y;
        minPoint = point.clone();
      }
    }
    const contactPoint = new THREE.Vector3();
    for (const { mesh, index } of leg.contactVertices) {
      mesh.getVertexPosition(index, point); point.applyMatrix4(mesh.matrixWorld); contactPoint.add(point);
    }
    contactPoint.multiplyScalar(1 / leg.contactVertices.length);
    return { minY, minPoint, contactPoint };
  };

  const diagnostics = {
    driftPointDefinition: 'centroid of fixed rest-sole vertices within 4 mm of the minimum; max 64',
    enabled: true, floorY, soleClearance, corrections: 0, last: null,
    leftVertices: rigs.left.vertices.length,
    rightVertices: rigs.right.vertices.length,
    leftCandidateVertices: candidateCounts.left,
    rightCandidateVertices: candidateCounts.right,
    supportWindows,
  };
  const apply = (phase) => {
    if (!Number.isFinite(phase)) return null;
    phase = ((phase % 1) + 1) % 1;
    root.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const readings = { left: measureSole(rigs.left), right: measureSole(rigs.right) };
    const targetSides = [readings.left.minY <= readings.right.minY ? 'left' : 'right'];
    const corrections = [];

    for (const side of targetSides) {
      const reading = readings[side];
      if (!reading.minPoint) continue;
      const leg = rigs[side];
      const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
      const targetAnkle = ankle.clone();
      targetAnkle.y += floorY + soleClearance - reading.minY;
      const result = solveLeg(leg, targetAnkle, model);
      if (result.solved) diagnostics.corrections++;
      corrections.push({ side, fromY: reading.minY, toY: floorY + soleClearance, ...result });
    }

    root.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const finalReadings = { left: measureSole(rigs.left), right: measureSole(rigs.right) };
    diagnostics.last = {
      phase: Number(phase.toFixed(3)),
      leftMinY: Number(finalReadings.left.minY.toFixed(4)),
      rightMinY: Number(finalReadings.right.minY.toFixed(4)),
      leftPoint: finalReadings.left.contactPoint?.toArray().map((value) => Number(value.toFixed(4))) ?? null,
      rightPoint: finalReadings.right.contactPoint?.toArray().map((value) => Number(value.toFixed(4))) ?? null,
      supportSides: targetSides,
      corrections: corrections.map(({ side, fromY, toY, targetReachErrorMeters, requestedChainLengthMeters, adjustedChainLengthMeters, maximumReachMeters, horizontalCorrectionMeters, targetClamped }) => ({
        side, fromY: Number(fromY.toFixed(4)), toY, targetReachErrorMeters, requestedChainLengthMeters, adjustedChainLengthMeters, maximumReachMeters, horizontalCorrectionMeters, targetClamped,
      })),
    };
    return diagnostics.last;
  };

  return {
    diagnostics,
    measure(phase) {
      if (!Number.isFinite(phase)) return null;
      phase = ((phase % 1) + 1) % 1;
      root.updateMatrixWorld(true);
      model.updateMatrixWorld(true);
      const left = measureSole(rigs.left);
      const right = measureSole(rigs.right);
      diagnostics.last = {
        phase: Number(phase.toFixed(3)),
        leftMinY: Number(left.minY.toFixed(4)),
        rightMinY: Number(right.minY.toFixed(4)),
        leftPoint: left.contactPoint?.toArray().map((value) => Number(value.toFixed(4))) ?? null,
        rightPoint: right.contactPoint?.toArray().map((value) => Number(value.toFixed(4))) ?? null,
        supportSides: ['left', 'right'].filter((side) => (side === 'left' ? left : right).minY <= floorY + 0.015),
        corrections: [],
      };
      return diagnostics.last;
    },
    apply,
    reset() {
      diagnostics.last = null;
    },
  };
}
