// Post: bloom on everything bright (windows, bulbs, fires, lamps), then tone mapping + sRGB.
// Bloom renders at half resolution to stay light on the phone. `?bloom=0` turns it off (raw A/B).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const POST = { bloom: 0.9, radius: 0.5, threshold: 1.05 };

export function makePost(renderer, scene, camera) {
  if (new URLSearchParams(location.search).get('bloom') === '0') return { render: () => renderer.render(scene, camera), resize() {} };
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const size = new THREE.Vector2(innerWidth / 2, innerHeight / 2);
  const bloom = new UnrealBloomPass(size, POST.bloom, POST.radius, POST.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const resize = () => { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth / 2, innerHeight / 2); };
  resize();
  return { render: () => composer.render(), resize, bloom };
}
