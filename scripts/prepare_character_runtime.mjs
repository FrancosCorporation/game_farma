// Compress a separately validated animated candidate; does not approve it.
// Usage: input.glb separate-output.glb [mixamo-standard-65|mixamo-index-33|mixamo-no-pinky-57]
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {statSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const[input,output,profile='mixamo-standard-65']=process.argv.slice(2);
if(!input||!output||resolve(input)===resolve(output)||existsSync(output))throw Error('Supply a separate, new output file.');
if(!['mixamo-standard-65','mixamo-index-33','mixamo-no-pinky-57'].includes(profile))throw Error('Unknown skeleton contract');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(input);doc.getRoot().getAsset().extras={...doc.getRoot().getAsset().extras,skeletonProfile:profile};
await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:16,quantizeWeight:16}));
await io.write(output,doc);writeFileSync(output+'.prepare.json',JSON.stringify({input,output,profile,bytes:statSync(output).size,status:'compressed_candidate_requires_final_QA'},null,2));
console.log('Prepared candidate',output,statSync(output).size,'bytes');
