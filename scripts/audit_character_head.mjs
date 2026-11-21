// Measure head shape in its own rigid frame, excluding apparent changes from yaw.
// Usage: node scripts/audit_character_head.mjs input.glb report.json
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { writeFile, readFile } from 'node:fs/promises';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: input.glb report.json');
const regionPath=process.argv.slice(4).find(a=>!a.startsWith('--'));
const region=regionPath?JSON.parse(await readFile(regionPath,'utf8')):{minY:1.38,upperY:1.44,maxAbsX:Infinity};
if(!Number.isFinite(region.minY)||!Number.isFinite(region.upperY)||region.minY>=region.upperY||!(region.maxAbsX>0))throw Error('Invalid head region');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
// Geometry-only copy in memory: Node needs no texture/image environment.
for (const material of doc.getRoot().listMaterials()) material.dispose();
for (const texture of doc.getRoot().listTextures()) texture.dispose();
const binary = await io.writeBinary(doc);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), '', resolve, reject));
const model = gltf.scene;
let box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
if (size.z > size.y * 1.5) { model.rotation.x = -Math.PI / 2; model.updateMatrixWorld(true); box.setFromObject(model); size = box.getSize(new THREE.Vector3()); }
model.scale.setScalar(1.72 / size.y); model.updateMatrixWorld(true); box.setFromObject(model);
model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);model.updateMatrixWorld(true);
const head = model.getObjectByName('mixamorigHead'), meshes = [], restBones = [];
model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); if (o.isBone) restBones.push({bone:o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}); });
if (!head || !meshes.length) throw Error('Missing head/skin');
const frozen = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;
for (const clip of gltf.animations) clip.tracks = clip.tracks.filter(t => !frozen.test(t.name.split('.')[0]));
const mixer = new THREE.AnimationMixer(model), p = new THREE.Vector3();
const reset = () => {mixer.stopAllAction();mixer.time=0;for(const r of restBones){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.s);}model.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();};
reset();
const restHeadP = head.getWorldPosition(new THREE.Vector3()), restHeadQ = head.getWorldQuaternion(new THREE.Quaternion()).invert(), vertices = [], weightBins = {};
for (const mesh of meshes) {
 const pos=mesh.geometry.getAttribute('position'),js=mesh.geometry.getAttribute('skinIndex'),ws=mesh.geometry.getAttribute('skinWeight');
 for(let i=0;i<pos.count;i++) {
  mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld);
  if(p.y<region.minY||Math.abs(p.x)>region.maxAbsX)continue;
  const influences=[];for(let k=0;k<4;k++){const weight=ws.getComponent(i,k);if(weight>0)influences.push({bone:mesh.skeleton.bones[js.getComponent(i,k)].name,weight});}
  const bin=(Math.floor(p.y*20)/20).toFixed(2);const b=weightBins[bin]??={vertices:0,mass:{}};b.vertices++;for(const w of influences)b.mass[w.bone]=(b.mass[w.bone]??0)+w.weight;
  vertices.push({mesh,index:i,restWorld:p.toArray(),restLocal:p.clone().sub(restHeadP).applyQuaternion(restHeadQ),influences,max:0});
 }
}
const clips={};
for(const name of ['Idle','Walk']) {
 reset();const clip=gltf.animations.find(c=>c.name===name);if(!clip)throw Error('Missing '+name);const action=mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();const samples=[];
 for(let i=0;i<=120;i++) {
  const phase=i/120;mixer.setTime(phase*clip.duration);model.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();const hp=head.getWorldPosition(new THREE.Vector3()),hq=head.getWorldQuaternion(new THREE.Quaternion()).invert();let max=0,maxUpper=0,minZ=Infinity,maxZ=-Infinity,sum=0;
  for(const v of vertices){v.mesh.getVertexPosition(v.index,p);p.applyMatrix4(v.mesh.matrixWorld);p.sub(hp).applyQuaternion(hq);const distance=p.distanceTo(v.restLocal);sum+=distance*distance;max=Math.max(max,distance);if(v.restWorld[1]>=region.upperY){maxUpper=Math.max(maxUpper,distance);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}if(distance>v.max){v.max=distance;v.worst={clip:name,phase,local:p.toArray()};}}
  samples.push({phase,maxDisplacement:max,maxUpperDisplacement:maxUpper,rms:Math.sqrt(sum/vertices.length),depth:maxZ-minZ,headWorldScale:head.getWorldScale(new THREE.Vector3()).toArray()});
 }
 clips[name]={duration:clip.duration,samples,maxUpperDisplacement:Math.max(...samples.map(s=>s.maxUpperDisplacement)),depthRange:[Math.min(...samples.map(s=>s.depth)),Math.max(...samples.map(s=>s.depth))]};
}
if(vertices.filter(v=>v.restWorld[1]>=region.upperY).length<100)throw Error('Insufficient head surface samples');
const describe=({mesh,restLocal,...v})=>({...v,mesh:mesh.name,restLocal:restLocal.toArray()});
const report={input,vertices:vertices.length,selection:region,weightBins,clips,worstVertices:vertices.sort((a,b)=>b.max-a.max).slice(0,60).map(describe),worstUpperVertices:vertices.filter(v=>v.restWorld[1]>=region.upperY).slice(0,60).map(describe)};
await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({input,output,vertices:vertices.length,clips:Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,{maxUpperDisplacement:c.maxUpperDisplacement,depthRange:c.depthRange}]))}));
if(process.argv.includes('--assert-rigid')&&Object.values(clips).some(c=>c.maxUpperDisplacement>.001||c.depthRange[1]-c.depthRange[0]>.001))throw Error('Upper head deforms by more than 1mm in its rigid frame');
