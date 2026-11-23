// Terrain height: a flat village bowl in the middle, rolling hills, a frozen pond, rising rim.
import * as THREE from 'three';

export const WORLD = 700;            // metres across
export const VILLAGE_R = 92;         // flat village circle
export const POND = { x: -125, z: 75, r: 26 };

export function groundH(x, z) {
  let h = 6 * Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.010 - 0.4)
        + 3 * Math.sin(x * 0.031 - z * 0.022)
        + 1.2 * Math.sin(x * 0.08 + z * 0.06);
  const d = Math.hypot(x, z);
  h += Math.max(0, d - 220) * 0.18;  // rises toward the rim
  h *= THREE.MathUtils.smoothstep(d, VILLAGE_R, VILLAGE_R + 40);
  const pd = Math.hypot(x - POND.x, z - POND.z);
  const pond = 1 - THREE.MathUtils.smoothstep(pd, POND.r, POND.r + 18);
  return THREE.MathUtils.lerp(h, -1.2, pond);
}
