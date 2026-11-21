// Bake contact in the same normalized Three.js scene as the runtime preview.
// Geometry, inverse binds, arms and Idle are not changed by this module.
export function bakeWalkContact({ THREE, model, byName, soleVertices, setPose, solveLeg }, config) {
  const ranges = { advance:[.3,2.5], fade:[.01,.12], clearance:[0,.015], reachReserve:[0,.05], samples:[120,600] };
  for (const [key,[min,max]] of Object.entries(ranges)) if (!Number.isFinite(config[key]) || config[key]<min || config[key]>max) throw new Error('Invalid contact config: '+key);
  if (!Number.isInteger(config.samples)) throw new Error('samples must be an integer');
  for (const side of ['left','right']) for (const value of ['start','end']) if (!(config.windows?.[side]?.[value]>=0 && config.windows[side][value]<1)) throw new Error('Invalid support window');
    const clip = byName.get('walk');
    const hips = model.getObjectByName('mixamorigHips');
    if (!clip || !hips) throw new Error('Walk/Hips required');
    const legs = Object.fromEntries(['Left', 'Right'].map(side => [side.toLowerCase(), {
      upper: model.getObjectByName('mixamorig'+side+'UpLeg'), lower: model.getObjectByName('mixamorig'+side+'Leg'), foot: model.getObjectByName('mixamorig'+side+'Foot'), toe: model.getObjectByName('mixamorig'+side+'ToeBase'),
    }]));
    const inverseParent = () => hips.parent.matrixWorld.clone().invert();
    const point = new THREE.Vector3();
    const measure = side => {
      let minY = Infinity;
      for (const v of soleVertices[side]) { v.mesh.getVertexPosition(v.index, point); point.applyMatrix4(v.mesh.matrixWorld); minY = Math.min(minY, point.y); }
      return minY;
    };
    const contact = (side, phase) => {
      const w = config.windows[side];
      const length = (w.end-w.start+1)%1;
      const t = (phase-w.start+1)%1;
      if (t>length) return {weight:0,t,length};
      const edge = Math.min(t, length-t);
      const x = THREE.MathUtils.clamp(edge/config.fade,0,1);
      return {weight:x*x*(3-2*x),t,length};
    };
    setPose({animation:'Rest',phase:0});
    const restFoot = Object.fromEntries(Object.entries(legs).map(([side,l]) => [side,l.foot.getWorldQuaternion(new THREE.Quaternion())]));
    const restToe = Object.fromEntries(Object.entries(legs).map(([side,l]) => [side,l.toe.quaternion.clone()]));
    const anchors = {};
    for (const side of ['left','right']) {
      const phase = config.windows[side].start;
      setPose({animation:'Walk',phase});
      const ankle = legs[side].foot.getWorldPosition(new THREE.Vector3());
      anchors[side] = ankle.toArray();
    }
    const tracks = {}; const times=[]; const diagnostics=[];
    const sampleCount = config.samples || 240;
    for (let i=0;i<=sampleCount;i++) {
      const phase=i/sampleCount;
      setPose({animation:'Walk',phase});
      const c = {left:contact('left',phase),right:contact('right',phase)};
      const originalAnkles = Object.fromEntries(Object.entries(legs).map(([side,l]) => [side,l.foot.getWorldPosition(new THREE.Vector3())]));
      // Lower the pelvis first; extending a leg with a fixed high pelvis is unreachable.
      const low = Math.min(measure('left'),measure('right'));
      const deltaWorld = new THREE.Vector3(0, config.clearance-low-config.reachReserve*Math.max(c.left.weight,c.right.weight), 0);
      const before = hips.getWorldPosition(new THREE.Vector3());
      const after = before.clone().add(deltaWorld);
      hips.position.add(after.applyMatrix4(inverseParent()).sub(before.applyMatrix4(inverseParent())));
      model.updateMatrixWorld(true);
      const corrections=[];
      for (const side of ['left','right']) {
        const leg=legs[side];
        const originalRotation=leg.foot.getWorldQuaternion(new THREE.Quaternion());
        const footRotation=originalRotation.clone().slerp(restFoot[side],c[side].weight);
        leg.foot.quaternion.copy(leg.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footRotation));
        leg.toe.quaternion.slerp(restToe[side],c[side].weight);
        model.updateMatrixWorld(true);
        const ankle=leg.foot.getWorldPosition(new THREE.Vector3());
        const target=ankle.clone();
        const supportedY = target.y + config.clearance-measure(side);
        target.y = THREE.MathUtils.lerp(originalAnkles[side].y,supportedY,c[side].weight);
        target.x = THREE.MathUtils.lerp(ankle.x, anchors[side][0], c[side].weight);
        target.z = THREE.MathUtils.lerp(ankle.z, anchors[side][2]-c[side].t*config.advance, c[side].weight);
        corrections.push({side,...solveLeg(leg,target,model)});
      }
      // Remove any residual contact error without changing the floor or rest geometry.
      const gap=Math.min(measure('left'),measure('right'));
      const correction=new THREE.Vector3(0,config.clearance-gap,0);
      const p=hips.getWorldPosition(new THREE.Vector3());
      hips.position.add(p.clone().add(correction).applyMatrix4(inverseParent()).sub(p.applyMatrix4(inverseParent())));
      model.updateMatrixWorld(true);
      times.push(phase*clip.duration);
      for (const track of clip.tracks) {
        const [name,path]=track.name.split('.');
        if (!['quaternion','position'].includes(path)) continue;
        const bone=model.getObjectByName(name);
        if (!bone?.isBone) continue;
        (tracks[track.name] ||= []).push(...bone[path === 'quaternion'?'quaternion':'position'].toArray());
      }
      diagnostics.push({phase,leftMinY:measure('left'),rightMinY:measure('right'),corrections});
    }
    return {times,tracks,diagnostics,duration:clip.duration,config};
}
