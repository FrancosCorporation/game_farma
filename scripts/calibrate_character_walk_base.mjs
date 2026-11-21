// Constant Walk base correction for measured runtime Idle calibration.
// Usage: input.glb separate-output.glb normalizedYOffset nativeHeight
// Keeps cadence, oscillation, bind/mesh, rotations and Idle intact; rerun foot QA.
import * as THREE from 'three';
import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';
import{MeshoptDecoder,MeshoptEncoder}from'meshoptimizer';import{existsSync,writeFileSync}from'node:fs';
const[input,output,offsetArg,heightArg]=process.argv.slice(2),offset=Number(offsetArg),height=Number(heightArg);
if(!input||!output||input===output||existsSync(output)||!Number.isFinite(offset)||Math.abs(offset)>.02||!(height>1&&height<2.5))throw Error('Supply separate output and measured correction <=2cm/native height.');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const d=await io.read(input),r=d.getRoot(),walk=r.listAnimations().find(a=>a.getName()==='Walk');
const channel=walk?.listChannels().find(c=>/mixamorig:?Hips$/.test(c.getTargetNode().getName())&&c.getTargetPath()==='translation');
if(!channel)throw Error('Missing Hips Walk translation');
const hip=channel.getTargetNode(),parent=r.listNodes().find(n=>n.listChildren().includes(hip));if(!parent)throw Error('Missing parent');
const inv=new THREE.Matrix4().fromArray(parent.getWorldMatrix()).invert();
const local=new THREE.Vector3(0,offset*height/1.72,0).applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));
const accessor=channel.getSampler().getOutput();if(!(accessor.getArray()instanceof Float32Array))throw Error('Expected Float32 Hips translations');
const values=accessor.getArray().slice();for(let i=0;i<values.length;i+=3){values[i]+=local.x;values[i+1]+=local.y;values[i+2]+=local.z;}
const outputData=d.createAccessor('WalkBaseCalibrated',r.listBuffers()[0]).setType('VEC3').setArray(values);
const sampler=d.createAnimationSampler().setInput(channel.getSampler().getInput()).setOutput(outputData).setInterpolation(channel.getSampler().getInterpolation());walk.addSampler(sampler);channel.setSampler(sampler);
r.getAsset().extras={...r.getAsset().extras,walkBaseCalibrationMeters:offset};await io.write(output,d);
writeFileSync(output+'.calibration.json',JSON.stringify({input,output,offsetNormalizedMeters:offset,nativeHeight:height,localDelta:local.toArray(),method:'constant translation delta; oscillation/rotations/Idle preserved',requiresRuntimeQA:true},null,2));
