// A verlet rope between two moving points, drawn as a thin tube that is rebuilt in place each frame
// (no allocations). Visual only: the sleigh's real tether is the distance constraint in sleigh.js.
import * as THREE from 'three';

const RAD = 4;
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

export class Rope {
  constructor(scene, a, b, { segs = 12, radius = 0.06, slack = 1.06, color = '#7a4a2a' } = {}) {
    this.a = a; this.b = b; this.n = segs + 1; this.slack = slack; this.radius = radius;
    this.p = []; this.o = [];
    for (let i = 0; i < this.n; i++) { const v = a.clone().lerp(b, i / segs); this.p.push(v); this.o.push(v.clone()); }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * RAD * 3);
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) for (let k = 0; k < RAD; k++) {
      const a0 = i * RAD + k, a1 = i * RAD + (k + 1) % RAD, b0 = a0 + RAD, b1 = a1 + RAD;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  update(dt) {
    const { p, o, n } = this;
    const rest = this.a.distanceTo(this.b) / (n - 1) * this.slack;
    const g = -14 * dt * dt;
    for (let i = 1; i < n - 1; i++) {
      _d.copy(p[i]).sub(o[i]).multiplyScalar(0.96);   // velocity with a little air drag
      o[i].copy(p[i]);
      p[i].add(_d); p[i].y += g;
    }
    p[0].copy(this.a); p[n - 1].copy(this.b);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n - 1; i++) {
        _d.subVectors(p[i + 1], p[i]);
        const len = _d.length() || 1e-6, diff = (len - rest) / len;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === n - 1 ? 0 : 0.5;
        const s = wa + wb ? 1 / (wa + wb) : 0;
        p[i].addScaledVector(_d, diff * wa * s);
        p[i + 1].addScaledVector(_d, -diff * wb * s);
      }
    }
    // rebuild tube rings
    for (let i = 0; i < n; i++) {
      _t.subVectors(p[Math.min(i + 1, n - 1)], p[Math.max(i - 1, 0)]).normalize();
      _n.crossVectors(_t, _up); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); _n.normalize();
      _b.crossVectors(_t, _n);
      for (let k = 0; k < RAD; k++) {
        const a = (k / RAD) * Math.PI * 2, c = Math.cos(a) * this.radius, s = Math.sin(a) * this.radius;
        const j = (i * RAD + k) * 3;
        this.pos[j] = p[i].x + _n.x * c + _b.x * s;
        this.pos[j + 1] = p[i].y + _n.y * c + _b.y * s;
        this.pos[j + 2] = p[i].z + _n.z * c + _b.z * s;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
