// Localized head/neck weights. Preserve bind shape and all animation channels.
// Usage: node scripts/repair_character_head_weights.mjs input.glb separate-output.glb
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { access, rename, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [input,output,configPath]=process.argv.slice(2);
const maskConfig=configPath?JSON.parse(await readFile(configPath,'utf8')):{neckFade:[1.32,1.36],headBlend:[1.34,1.405],lateralFade:[.20,.25]};
for(const field of ['neckFade','headBlend','lateralFade']){
 const v=maskConfig[field];if(!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n))||v[0]>=v[1])throw Error('Invalid anatomical mask '+field);
}
if(!input||!output||resolve(input)===resolve(output))throw Error('Use separate input/output');
try{await access(output);throw Error('Output exists');}catch(e){if(e.code!=='ENOENT')throw e;}
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(input),root=doc.getRoot(),geometryDoc=await io.read(input);
for(const m of geometryDoc.getRoot().listMaterials())m.dispose();for(const t of geometryDoc.getRoot().listTextures())t.dispose();
const binary=await io.writeBinary(geometryDoc);
const gltf=await new Promise((res,rej)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'',res,rej));
const model=gltf.scene;let box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
if(size.z>size.y*1.5){model.rotation.x=-Math.PI/2;model.updateMatrixWorld(true);box.setFromObject(model);size=box.getSize(new THREE.Vector3());}
model.scale.setScalar(1.72/size.y);model.updateMatrixWorld(true);box.setFromObject(model);model.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);model.updateMatrixWorld(true);
const skins=root.listNodes().filter(n=>n.getSkin()&&n.getMesh()),meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
if(skins.length!==1||meshes.length!==1||skins[0].getMesh().listPrimitives().length!==1)throw Error('Expected single skinned primitive');
const primitive=skins[0].getMesh().listPrimitives()[0],joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0'),names=skins[0].getSkin().listJoints().map(j=>j.getName().replaceAll(':',''));
const head=names.indexOf('mixamorigHead'),neck=names.indexOf('mixamorigNeck');if(head<0||neck<0||primitive.getAttribute('JOINTS_1'))throw Error('Unsupported head skin');
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const signature=async d=>JSON.stringify({
 asset:d.getRoot().getAsset(),nodes:d.getRoot().listNodes().map(n=>[n.getName(),n.getTranslation(),n.getRotation(),n.getScale(),n.listChildren().map(c=>c.getName())]),
 skins:d.getRoot().listSkins().map(s=>[s.listJoints().map(j=>j.getName()),hash(s.getInverseBindMatrices().getArray())]),
 meshes:d.getRoot().listMeshes().map(m=>m.listPrimitives().map(p=>[hash(p.getIndices().getArray()),p.listSemantics().filter(k=>!['JOINTS_0','WEIGHTS_0'].includes(k)).map(k=>[k,hash(p.getAttribute(k).getArray())])])),
 materials:(await io.writeJSON(d)).json.materials,textures:d.getRoot().listTextures().map(t=>hash(t.getImage())),
 clips:d.getRoot().listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation(),hash(c.getSampler().getInput().getArray()),hash(c.getSampler().getOutput().getArray())])])});
const before=await signature(doc),js=joints.getArray().slice(),ws=weights.getArray().slice(),expectedJ=js.slice(),expectedW=ws.slice();
const max=ws instanceof Uint16Array?65535:ws instanceof Uint8Array?255:ws instanceof Float32Array?1:0;if(!max||max!==1&&!weights.getNormalized())throw Error('Unsupported weight encoding');
const smooth=(lo,hi,v)=>{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);},p=new THREE.Vector3(),edited=[];
let maxRestDisplacement=0;
for(let i=0;i<weights.getCount();i++){
 meshes[0].getVertexPosition(i,p);p.applyMatrix4(meshes[0].matrixWorld);
 const mask=smooth(...maskConfig.neckFade,p.y)*(1-smooth(...maskConfig.lateralFade,Math.abs(p.x)));
 if(mask<=0)continue;
 const headPart=smooth(...maskConfig.headBlend,p.y),map=new Map();
 for(let k=0;k<4;k++){const weight=ws[i*4+k]/max*(1-mask);if(weight>0)map.set(js[i*4+k],(map.get(js[i*4+k])??0)+weight);}
 map.set(head,(map.get(head)??0)+mask*headPart);map.set(neck,(map.get(neck)??0)+mask*(1-headPart));
 const list=[...map].filter(([,w])=>w>1e-10).sort((a,b)=>b[1]-a[1]).slice(0,4),total=list.reduce((s,[,w])=>s+w,0),exact=list.map(([,w])=>w/total*max),values=max===1?exact:exact.map(Math.floor);
 if(max!==1){const residual=max-values.reduce((s,v)=>s+v,0),order=exact.map((v,k)=>[k,v-values[k]]).sort((a,b)=>b[1]-a[1]);for(let k=0;k<residual;k++)values[order[k][0]]++;}
 for(let k=0;k<4;k++){expectedJ[i*4+k]=list[k]?.[0]??head;expectedW[i*4+k]=values[k]??0;}
 if(expectedJ.subarray(i*4,i*4+4).some((v,k)=>v!==js[i*4+k])||expectedW.subarray(i*4,i*4+4).some((v,k)=>v!==ws[i*4+k]))edited.push(i);
}
if(edited.length<1000)throw Error('Head repair selection too small');
const restWorld=edited.map(i=>{meshes[0].getVertexPosition(i,p);return p.clone().applyMatrix4(meshes[0].matrixWorld);});
meshes[0].geometry.setAttribute('skinIndex',new THREE.BufferAttribute(expectedJ,4));
meshes[0].geometry.setAttribute('skinWeight',new THREE.BufferAttribute(expectedW,4,weights.getNormalized()));
for(let k=0;k<edited.length;k++){meshes[0].getVertexPosition(edited[k],p);p.applyMatrix4(meshes[0].matrixWorld);maxRestDisplacement=Math.max(maxRestDisplacement,p.distanceTo(restWorld[k]));}
if(maxRestDisplacement>1e-5)throw Error('Weights would change the bind shape: '+maxRestDisplacement);
joints.setArray(expectedJ);weights.setArray(expectedW);
const staging=output+'.staging.glb';await io.write(staging,doc);const check=await io.read(staging);
if(await signature(check)!==before)throw Error('Unexpected geometry/bind/rig/material/animation change');
const outP=check.getRoot().listMeshes()[0].listPrimitives()[0];if(hash(outP.getAttribute('JOINTS_0').getArray())!==hash(expectedJ)||hash(outP.getAttribute('WEIGHTS_0').getArray())!==hash(expectedW))throw Error('Serialized weights mismatch');
await rename(staging,output);
const report={input,output,editedVertices:edited.length,maxRestDisplacement,normalizedMask:maskConfig,weightEncoding:ws.constructor.name,allAnimationChannelsExactlyPreserved:true,geometryBindRigMaterialsTexturesPreserved:true,editedVertexIndices:edited};
await writeFile(output+'.audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,editedVertexIndices:undefined}));
