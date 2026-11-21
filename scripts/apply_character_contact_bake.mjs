// Apply measured browser contact corrections to a separate GLB, then compress.
// Usage: node scripts/apply_character_contact_bake.mjs input.glb output.glb contact.json
import { readFile, access, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const [input,output,bakePath]=process.argv.slice(2);
if (!bakePath || resolve(input)===resolve(output)) throw new Error('Usage: input.glb separate-output.glb contact.json');
try { await access(output); throw new Error('Output exists'); } catch(e) { if(e.code!=='ENOENT')throw e; }
const bake=JSON.parse(await readFile(bakePath,'utf8'));
if (!Array.isArray(bake.times) || bake.times.length<121 || bake.times.some((v,i)=>!Number.isFinite(v) || i>0&&v<=bake.times[i-1])) throw new Error('Invalid times');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(input),root=doc.getRoot();
const walk=root.listAnimations().find(a=>a.getName().toLowerCase()==='walk');
if (!walk) throw new Error('Missing Walk');
const changed=[];
const inputAccessor=doc.createAccessor('WalkContactTime',root.listBuffers()[0]).setType('SCALAR').setArray(new Float32Array(bake.times));
for(const ch of walk.listChannels()) {
 const n=ch.getTargetNode(),path=ch.getTargetPath();
 const normalize=name=>name.replaceAll(':','');
 if (!(path==='translation'&&/Hips$/.test(n.getName()) || path==='rotation'&&/(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(n.getName()))) continue;
 const key=normalize(n.getName())+'.'+(path==='translation'?'position':'quaternion');
 // Three track paths use quaternion, while the browser serializer accepts rotation aliases.
 const values=bake.tracks[key] || bake.tracks[normalize(n.getName())+'.rotation'];
 const count=path==='translation'?3:4;
 if (!values || values.length!==bake.times.length*count || values.some(v=>!Number.isFinite(v))) throw new Error('Missing/invalid baked track '+key);
 const data=new Float32Array(values);
 if(count===4) for(let i=0;i<bake.times.length;i++) {
  const q=data.subarray(i*4,i*4+4),length=Math.hypot(...q);
  if(length<.9||length>1.1)throw new Error('Invalid quaternion');
  if(i && q.reduce((s,v,k)=>s+v*data[(i-1)*4+k],0)<0) for(let k=0;k<4;k++)q[k]*=-1;
 }
 const accessor=doc.createAccessor(n.getName()+'Contact',root.listBuffers()[0]).setType(count===3?'VEC3':'VEC4').setArray(data);
 const sampler=doc.createAnimationSampler().setInput(inputAccessor).setOutput(accessor).setInterpolation('LINEAR');
 walk.addSampler(sampler);ch.setSampler(sampler);changed.push(key);
}
if(changed.length!==9) throw new Error('Expected Hips translation and eight leg/toe rotations, got '+changed.length);
const asset=root.getAsset();asset.extras={...(asset.extras||{}),walkAdvance:bake.config.advance,walkSpeed:bake.config.advance/bake.duration,walkFootContact:false,walkStartPhase:bake.config.walkStartPhase ?? 0,walkCrossfadeWarp:false};
await doc.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12,quantizeWeight:12}));
const staging=output+'.staging.glb';
try { await access(staging); throw new Error('Staging exists'); } catch(e) { if(e.code!=='ENOENT')throw e; }
try {
 await io.write(staging,doc);
 const check=(await io.read(staging)).getRoot();
 const checkWalk=check.listAnimations().find(a=>a.getName().toLowerCase()==='walk');
 if(checkWalk.listChannels().length!==walk.listChannels().length)throw new Error('Lost channels after serialization');
 for(const ch of checkWalk.listChannels()) {
  const sampler=ch.getSampler();
  if(!ch.getTargetNode()||!sampler?.getInput()||!sampler?.getOutput())throw new Error('Invalid serialized channel');
 }
 await rename(staging,output);
} catch(e) { await rm(staging,{force:true});throw e; }
console.log(JSON.stringify({output,changed,walkAdvance:asset.extras.walkAdvance,walkSpeed:asset.extras.walkSpeed},null,2));
