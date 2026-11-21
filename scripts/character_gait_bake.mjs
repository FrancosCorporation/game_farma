// Bake a compact, anatomically directed gait without changing bind or mesh.
export function bakeCharacterGait({ THREE, model, byName, soleVertices, setPose, solveLeg, rotateBoneToward }, config) {
  const walk = byName.get('walk'), hips = model.getObjectByName('mixamorigHips');
  const legs = Object.fromEntries(['Left', 'Right'].map(side => [side.toLowerCase(), {
    upper: model.getObjectByName('mixamorig' + side + 'UpLeg'),
    lower: model.getObjectByName('mixamorig' + side + 'Leg'),
    foot: model.getObjectByName('mixamorig' + side + 'Foot'),
    toe: model.getObjectByName('mixamorig' + side + 'ToeBase'),
    poleDirectionWorld: new THREE.Vector3(0, 0, 1),
  }]));
  const point = new THREE.Vector3();
  const measure = side => {
    let min = Infinity;
    for (const v of soleVertices[side]) { v.mesh.getVertexPosition(v.index, point); point.applyMatrix4(v.mesh.matrixWorld); min = Math.min(min, point.y); }
    return min;
  };
  const inspect = () => {
    const out = { pelvis: hips.getWorldPosition(new THREE.Vector3()).toArray() };
    for (const [side, leg] of Object.entries(legs)) {
      const h = leg.upper.getWorldPosition(new THREE.Vector3()), k = leg.lower.getWorldPosition(new THREE.Vector3()), a = leg.foot.getWorldPosition(new THREE.Vector3());
      const axis = a.clone().sub(h).normalize(), bend = k.clone().sub(h); bend.addScaledVector(axis, -bend.dot(axis));
      out[side] = { hip: h.toArray(), knee: k.toArray(), ankle: a.toArray(),
        forwardBend: bend.z, flexDegrees: 180 - THREE.MathUtils.radToDeg(k.clone().sub(h).angleTo(a.clone().sub(k).negate())), soleY: measure(side) };
    }
    out.ankleWidth = Math.abs(out.left.ankle[0] - out.right.ankle[0]);
    out.elbowFlex = {};
    out.armForward = {};
    for (const side of ['Left', 'Right']) {
      const h = model.getObjectByName('mixamorig' + side + 'Arm').getWorldPosition(new THREE.Vector3());
      const k = model.getObjectByName('mixamorig' + side + 'ForeArm').getWorldPosition(new THREE.Vector3());
      const a = model.getObjectByName('mixamorig' + side + 'Hand').getWorldPosition(new THREE.Vector3());
      out.elbowFlex[side.toLowerCase()] = THREE.MathUtils.radToDeg(k.clone().sub(h).angleTo(a.clone().sub(k)));
      out.armForward[side.toLowerCase()] = k.z - h.z;
    }
    return out;
  };
  const summarize = samples => Object.fromEntries(['left', 'right'].map(side => [side, {
    backwardSamples: samples.filter(s => s[side].forwardBend < -.002).length,
    minForwardBend: Math.min(...samples.map(s => s[side].forwardBend)),
    maxFlexDegrees: Math.max(...samples.map(s => s[side].flexDegrees)),
  }]));
  const baseline = [];
  for (let i = 0; i <= 240; i++) { setPose({ animation: config.auditAnimation || 'Walk', phase: i / 240 }); baseline.push({ phase: i / 240, ...inspect() }); }
  if (config.mode === 'audit') return { baseline, summary: summarize(baseline) };
  // Permit a wider support line when a rig's verified neutral stance is wider;
  // runtime foot-contact QA still gates the actual result.
  for (const [key, min, max] of [['advance', .5, 1.2], ['stance', .52, .65], ['halfWidth', .045, .14], ['lift', .035, .1], ['reachReserve', .001, .01], ['clearance', .002, .015]])
    if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) throw new Error('Invalid gait config: ' + key);
  setPose({ animation: 'Rest', phase: 0 });
  const restHip = hips.getWorldPosition(new THREE.Vector3()), rest = {};
  for (const [side, leg] of Object.entries(legs)) {
    const h = leg.upper.getWorldPosition(new THREE.Vector3()), k = leg.lower.getWorldPosition(new THREE.Vector3()), a = leg.foot.getWorldPosition(new THREE.Vector3());
    const low = measure(side), base = [];
    for (const v of soleVertices[side]) {
      v.mesh.getVertexPosition(v.index, point); point.applyMatrix4(v.mesh.matrixWorld);
      if (point.y < low + .004) base.push(point.clone());
    }
    const minZ = Math.min(...base.map(p => p.z)), heel = base.filter(p => p.z < minZ + .008);
    const heelCenter = heel.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(1 / heel.length);
    rest[side] = { ankle: a, foot: leg.foot.getWorldQuaternion(new THREE.Quaternion()), toe: leg.toe.quaternion.clone(), toeWorld: leg.toe.getWorldQuaternion(new THREE.Quaternion()),
      toeOffset: leg.toe.getWorldPosition(new THREE.Vector3()).sub(a), heelOffset: heelCenter.sub(a), length: h.distanceTo(k) + k.distanceTo(a) };
  }
  if (config.gaitProfile && !['walk_arc', 'walk_roll'].includes(config.gaitProfile)) throw new Error('Invalid gait profile');
  const rollingWalk = config.gaitProfile === 'walk_roll';
  const phaseOffset = config.phaseOffset ?? 0;
  if (!Number.isFinite(phaseOffset) || phaseOffset < -.5 || phaseOffset > .5) throw new Error('Invalid gait phaseOffset');
  const pelvisExcursion = config.pelvisExcursion ?? .018;
  if (rollingWalk && (!Number.isFinite(pelvisExcursion) || pelvisExcursion < .01 || pelvisExcursion > .03)) throw new Error('Invalid pelvis excursion');
  const duration = config.cycleDuration ?? walk.duration;
  if (!Number.isFinite(duration) || duration < .9 || duration > 1.6) throw new Error('Invalid gait cycle duration');
  const times = [], tracks = {}, diagnostics = [];
  const smooth = (v, a, b) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const prepareTargets = phase => {
    setPose({ animation: 'Walk', phase });
    const targets = {}, stance = {};
    for (const [side, leg] of Object.entries(legs)) {
      // Align contact windows with the avatar runtime's phase convention.
      // A positive offset shifts both feet later; negative aligns earlier.
      const start = ((side === 'left' ? .3 : .8) + phaseOffset + 1) % 1, t = (phase - start + 1) % 1;
      stance[side] = t < config.stance;
      const s = Math.max(0, Math.min(1, (t - config.stance) / (1 - config.stance)));
      const stride = config.advance * config.stance;
      // Endpoint velocity matches the planted foot (-advance in local space),
      // so the world foot starts and ends swing with zero horizontal velocity.
      // A walking arc has one rounded peak. The older contact plateau held
      // the shoe high through 40% of swing and looked like marching.
      const arcProfile = ['walk_arc', 'walk_roll'].includes(config.gaitProfile);
      const travel = arcProfile ? s * s * s * (10 - 15 * s + 6 * s * s) : s * s * (3 - 2 * s);
      const z = stance[side] ? config.advance * (config.stance / 2 - t) : -stride / 2 - config.advance * (1 - config.stance) * s + config.advance * travel;
      const liftShape = arcProfile
        ? Math.sin(Math.PI * s) * smooth(s, 0, .06) * (1 - smooth(s, .94, 1))
        : smooth(s, 0, .3) * (1 - smooth(s, .7, 1));
      const lift = stance[side] ? 0 : config.lift * liftShape;
      // Roll from heel contact to toe-off. Keeping a trailing shoe flat forces
      // a large pelvis drop just before swing and makes the stance leg squat.
      const heelPitch = rollingWalk ? 12 : 8, toePitch = rollingWalk ? 42 : 24;
      const pitchDegrees = stance[side]
        ? -heelPitch * (1 - smooth(t, 0, .07)) + toePitch * smooth(t, config.stance - .25, config.stance)
        : toePitch * (1 - smooth(s, 0, rollingWalk ? .65 : .45)) - heelPitch * smooth(s, .75, 1);
      const pitchRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(pitchDegrees));
      const footWorld = pitchRotation.clone().multiply(rest[side].foot);
      leg.foot.quaternion.copy(leg.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footWorld));
      leg.toe.quaternion.copy(rest[side].toe);
      model.updateMatrixWorld(true);
      if (pitchDegrees > 0) {
        leg.toe.quaternion.copy(leg.toe.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rest[side].toeWorld));
        model.updateMatrixWorld(true);
      }
      const a = leg.foot.getWorldPosition(new THREE.Vector3());
      const pivot = pitchDegrees > 0 ? rest[side].toeOffset : rest[side].heelOffset;
      const rollCompensation = pivot.z - pivot.clone().applyQuaternion(pitchRotation).z;
      targets[side] = new THREE.Vector3((side === 'left' ? 1 : -1) * config.halfWidth, a.y + config.clearance - measure(side) + lift, rest[side].ankle.z + z + rollCompensation);
    }
    return { targets, stance };
  };
  const pelvisWave = phase => pelvisExcursion * (.5 + .5 * Math.cos(4 * Math.PI * (phase - .05)));
  // Fit one smooth rise/fall per step under the planted-leg reach envelope.
  // A recovering foot must never pull the whole body down. Its ankle rises
  // instead, as the heel and calf recover after toe-off.
  let pelvisBase = Infinity;
  if (rollingWalk) for (let i = 0; i <= 240; i++) {
    const phase = i / 240, { targets, stance } = prepareTargets(phase);
    const hip = hips.getWorldPosition(new THREE.Vector3());
    for (const [side, leg] of Object.entries(legs)) if (stance[side]) {
      const h = leg.upper.getWorldPosition(new THREE.Vector3()), a = targets[side];
      const horizontal2 = (a.x - h.x) ** 2 + (a.z - h.z) ** 2;
      const reach = rest[side].length - config.reachReserve;
      if (horizontal2 >= reach ** 2) throw new Error('Planted foot outside leg reach');
      const ceiling = a.y + Math.sqrt(reach ** 2 - horizontal2) - (h.y - hip.y);
      pelvisBase = Math.min(pelvisBase, ceiling - pelvisWave(phase));
    }
  }
  for (let i = 0; i <= 240; i++) {
    const phase = i / 240, { targets, stance } = prepareTargets(phase);
    // Start from the neutral pelvis. Lower only as much as actual reach needs;
    // the previous contact bake lowered it twice and inherited backward poles.
    const currentHip = hips.getWorldPosition(new THREE.Vector3());
    let desiredY = rollingWalk ? pelvisBase + pelvisWave(phase) : restHip.y + config.clearance - .001;
    if (!rollingWalk) for (const side of ['left', 'right']) {
      const h = legs[side].upper.getWorldPosition(new THREE.Vector3()), a = targets[side];
      const horizontal2 = (a.x - h.x) ** 2 + (a.z - h.z) ** 2;
      const reach = rest[side].length - config.reachReserve;
      const maxUpperY = a.y + Math.sqrt(Math.max(0, reach ** 2 - horizontal2));
      desiredY = Math.min(desiredY, maxUpperY - (h.y - currentHip.y));
    }
    const parentInverse = hips.parent.matrixWorld.clone().invert();
    const worldTarget = new THREE.Vector3(currentHip.x, desiredY, currentHip.z);
    hips.position.add(worldTarget.applyMatrix4(parentInverse).sub(currentHip.clone().applyMatrix4(parentInverse)));
    model.updateMatrixWorld(true);
    if (rollingWalk) for (const [side, leg] of Object.entries(legs)) if (!stance[side]) {
      const h = leg.upper.getWorldPosition(new THREE.Vector3()), a = targets[side];
      const horizontal2 = (a.x - h.x) ** 2 + (a.z - h.z) ** 2;
      const reach = rest[side].length - config.reachReserve;
      if (horizontal2 >= reach ** 2) throw new Error('Swing foot outside leg reach');
      a.y = Math.max(a.y, h.y - Math.sqrt(reach ** 2 - horizontal2));
    }
    const corrections = [];
    for (const side of ['left', 'right']) corrections.push({ side, ...solveLeg(legs[side], targets[side].clone(), model) });
    if (config.elbowFlexDegrees !== undefined) {
      if (!(config.elbowFlexDegrees >= 10 && config.elbowFlexDegrees <= 30)) throw new Error('Invalid elbow flex');
      for (const side of ['Left', 'Right']) {
        const upper = model.getObjectByName('mixamorig' + side + 'Arm'), fore = model.getObjectByName('mixamorig' + side + 'ForeArm'), hand = model.getObjectByName('mixamorig' + side + 'Hand');
        const h = upper.getWorldPosition(new THREE.Vector3()), e = fore.getWorldPosition(new THREE.Vector3()), w = hand.getWorldPosition(new THREE.Vector3());
        const direction = e.clone().sub(h).normalize(), axis = direction.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
        const target = e.clone().add(direction.applyAxisAngle(axis, THREE.MathUtils.degToRad(config.elbowFlexDegrees)).multiplyScalar(e.distanceTo(w)));
        rotateBoneToward(fore, w, target, model);
      }
    }
    const sample = inspect();
    times.push(phase * duration);
    for (const name of ['mixamorigHips', ...['Left', 'Right'].flatMap(s => ['UpLeg', 'Leg', 'Foot', 'ToeBase', ...(config.elbowFlexDegrees !== undefined ? ['ForeArm'] : [])].map(b => 'mixamorig' + s + b))]) {
      const bone = model.getObjectByName(name), path = name === 'mixamorigHips' ? 'position' : 'quaternion';
      (tracks[name + '.' + path] ||= []).push(...bone[path].toArray());
    }
    diagnostics.push({ phase, stance, ...sample, corrections });
  }
  return { times, tracks, duration, sourceDuration: walk.duration, config, baselineSummary: summarize(baseline), summary: summarize(diagnostics), diagnostics };
}
