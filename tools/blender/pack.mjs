import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, textureCompress, prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(inp);
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88 }), draco());
await io.write(out, doc);
const skin = doc.getRoot().listSkins()[0]; if (!skin) { console.log('nodes', doc.getRoot().listNodes().map(n => n.getName()).join(' ')); process.exit(0); }
console.log('joints', skin.listJoints().length, skin.listJoints().filter(j => /jiggle/.test(j.getName())).map(j => j.getName()));
