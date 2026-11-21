// Experimental world-space retarget: preserve the target's own skin/bind.
// Usage: target-skin.glb approved-source.glb output.glb. QA required before promotion.
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {writeFileSync} from 'node:fs';
import {decodeAccessor} from './util/normalizedAccessor.mjs';
const [targetPath,sourcePath,outputPath,mode='rest-delta']=process.argv.slice(2);
if(!['rest-delta','bone-axes'].includes(mode))throw new Error('Invalid mode');
if(!targetPath||!sourcePath||!outputPath||outputPath===targetPath||outputPath===sourcePath)throw new Error('Supply separate target, source and output paths.');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const [target,source]=await Promise.all([io.read(targetPath),io.read(sourcePath)]);
const normalize=n=>n.replaceAll(':','');
function hierarchy(doc){
 const root=doc.getRoot(),scene=new THREE.Group(),objects=new Map(),bones=new Map();
 for(const n of root.listNodes()){const o=new THREE.Object3D();o.name=normalize(n.getName());o.position.fromArray(n.getTranslation());o.quaternion.fromArray(n.getRotation());o.scale.fromArray(n.getScale());objects.set(n,o);}
 for(const n of root.listNodes())for(const c of n.listChildren())objects.get(n).add(objects.get(c));
 for(const n of (root.getDefaultScene()||root.listScenes()[0]).listChildren())scene.add(objects.get(n));
 const skin=root.listSkins()[0];if(!skin)throw new Error('A skin is required');
 for(const n of skin.listJoints()){const name=normalize(n.getName());if(bones.has(name))throw new Error('Duplicate joint');bones.set(name,{node:n,object:objects.get(n)});}
 scene.updateMatrixWorld(true);
 const up=bones.get('mixamorigHead').object.getWorldPosition(new THREE.Vector3()).sub(bones.get('mixamorigHips').object.getWorldPosition(new THREE.Vector3()));
 const axis=new THREE.Vector3();const components=up.toArray(),k=components.map(Math.abs).indexOf(Math.max(...components.map(Math.abs)));axis.setComponent(k,Math.sign(components[k]));
 scene.quaternion.setFromUnitVectors(axis,new THREE.Vector3(0,1,0));scene.updateMatrixWorld(true);
 const rest=new Map();for(const [name,{object}]of bones)rest.set(name,{q:object.getWorldQuaternion(new THREE.Quaternion()).normalize(),p:object.getWorldPosition(new THREE.Vector3())});
 const localRest=new Map([...objects.values()].map(o=>[o,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}]));
 const length=side=>rest.get(`mixamorig${side}UpLeg`).p.distanceTo(rest.get(`mixamorig${side}Leg`).p)+rest.get(`mixamorig${side}Leg`).p.distanceTo(rest.get(`mixamorig${side}Foot`).p);
 return{root,scene,objects,bones,rest,localRest,legLength:(length('Left')+length('Right'))/2};
}
const S=hierarchy(source),T=hierarchy(target);
const required=['Hips','Spine','Spine1','Spine2','Neck','Head',...['Left','Right'].flatMap(s=>['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'].map(n=>s+n))].map(n=>'mixamorig'+n);
for(const n of required)if(!S.bones.has(n)||!T.bones.has(n))throw new Error('Missing humanoid joint '+n);
const ratio=T.legLength/S.legLength;if(!(ratio>.5&&ratio<2))throw new Error('Implausible anatomical scale ratio');
const freeze=/(_End)$|^mixamorig(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;
const ordered=[...T.bones].filter(([n])=>S.bones.has(n)&&!freeze.test(n)).sort((a,b)=>depth(a[1].object)-depth(b[1].object));
function depth(o){let d=0;while(o.parent){d++;o=o.parent;}return d;}
const axisCorrections=new Map();
const primaryChild={mixamorigHips:'mixamorigSpine',mixamorigSpine:'mixamorigSpine1',mixamorigSpine1:'mixamorigSpine2',mixamorigSpine2:'mixamorigNeck',mixamorigNeck:'mixamorigHead',mixamorigHead:'mixamorigHeadTop_End'};
for(const side of ['Left','Right'])for(const [parent,child]of [['Shoulder','Arm'],['Arm','ForeArm'],['ForeArm','Hand'],['Hand','HandIndex1'],['UpLeg','Leg'],['Leg','Foot'],['Foot','ToeBase'],['ToeBase','Toe_End']])primaryChild['mixamorig'+side+parent]='mixamorig'+side+child;
for(const [name,entry] of ordered){
 const child=entry.node.listChildren().find(n=>normalize(n.getName())===primaryChild[name]&&S.bones.has(normalize(n.getName())));
 const sourceChild=child&&S.bones.get(normalize(child.getName())).node;
 if(child&&sourceChild)axisCorrections.set(name,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().fromArray(child.getTranslation()).normalize(),new THREE.Vector3().fromArray(sourceChild.getTranslation()).normalize()));
}
const report={mode,status:'experimental_clips_require_deformation_and_contact_QA',source:sourcePath,target:targetPath,method:'world-space rest rotation delta; anatomical Hips displacement; target bind preserved',sourceJoints:S.bones.size,targetJoints:T.bones.size,legRatio:ratio,unmappedTarget:[...T.bones.keys()].filter(n=>!S.bones.has(n)),clips:[]};
const buffer=T.root.listBuffers()[0]||target.createBuffer('retarget-data');
for(const a of [...T.root.listAnimations()])a.dispose();
for(const name of ['Walk','Idle']){
 for(const [o,rest] of S.localRest){o.position.copy(rest.p);o.quaternion.copy(rest.q);o.scale.copy(rest.s);}
 S.scene.updateMatrixWorld(true);
 const src=S.root.listAnimations().find(a=>a.getName().toLowerCase()===name.toLowerCase());if(!src)throw new Error('Missing clip '+name);
 const tracks=[];
 for(const c of src.listChannels()){
  const n=c.getTargetNode(),o=S.objects.get(n),sampler=c.getSampler(),input=decodeAccessor(sampler.getInput(),sampler.getInput().getArray()),values=decodeAccessor(sampler.getOutput(),sampler.getOutput().getArray()),path=c.getTargetPath();
  if(!o||freeze.test(o.name))continue;
  if(sampler.getInterpolation()==='CUBICSPLINE')throw new Error('Cubic source needs explicit cubic interpolation.');
  if(path==='scale'){if(values.some((v,i)=>Math.abs(v-n.getScale()[i%3])>1e-5))throw new Error('Animated scales need explicit handling');continue;}
  const Type=path==='rotation'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
  const property=path==='rotation'?'quaternion':'position';
  const tr=new Type(`${o.uuid}.${property}`,input,values);if(sampler.getInterpolation()==='STEP')tr.setInterpolation(THREE.InterpolateDiscrete);tracks.push(tr);
 }
 const clip=new THREE.AnimationClip(name,-1,tracks),mixer=new THREE.AnimationMixer(S.scene),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
 const frames=Math.ceil(clip.duration*60),times=[],rotations=new Map(ordered.map(([n])=>[n,[]])),hipValues=[];
 for(let i=0;i<=frames;i++){
  const t=clip.duration*i/frames;times.push(t);mixer.setTime(t);S.scene.updateMatrixWorld(true);
  for(const [n,{object}]of ordered){
   const animated=S.bones.get(n).object.getWorldQuaternion(new THREE.Quaternion()).normalize();
   const world=mode==='bone-axes'&&axisCorrections.has(n)?animated.multiply(axisCorrections.get(n)):animated.multiply(S.rest.get(n).q.clone().invert()).multiply(T.rest.get(n).q);
   object.quaternion.copy(object.parent.getWorldQuaternion(new THREE.Quaternion()).normalize().invert().multiply(world)).normalize();
   if(n==='mixamorigHips'){
    const pos=S.bones.get(n).object.getWorldPosition(new THREE.Vector3()).sub(S.rest.get(n).p).multiplyScalar(ratio).add(T.rest.get(n).p);
    object.position.copy(object.parent.worldToLocal(pos));hipValues.push(...object.position.toArray());
   }
   object.updateMatrixWorld(true);let q=object.quaternion.toArray(),arr=rotations.get(n);
   if(Math.abs(Math.hypot(...q)-1)>1e-6)throw new Error('Retarget quaternion is not unit length: '+n);
   if(arr.length&&q.reduce((sum,v,k)=>sum+v*arr[arr.length-4+k],0)<0)q=q.map(v=>-v);arr.push(...q);
  }
 }
 const anim=target.createAnimation(name);
 function channel(node,path,values,type){const input=target.createAccessor(name+'Time',buffer).setType('SCALAR').setArray(new Float32Array(times));const out=target.createAccessor(name+path,buffer).setType(type).setArray(new Float32Array(values));const sampler=target.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');anim.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));}
 for(const [n,{node}]of ordered)channel(node,'rotation',rotations.get(n),'VEC4');channel(T.bones.get('mixamorigHips').node,'translation',hipValues,'VEC3');
 report.clips.push({name,duration:clip.duration,channels:anim.listChannels().length,samples:times.length});mixer.stopAllAction();mixer.uncacheRoot(S.scene);
}
await io.write(outputPath,target);writeFileSync(outputPath.replace(/\.glb$/,'.retarget.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
