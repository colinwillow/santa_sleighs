// STATIC MERGE (draw calls): the village is hundreds of small separate meshes (fence posts, lamp parts, props, kit pieces),
// one draw call each. A few seconds into the game, every mesh that has NOT moved / changed since the start is merged with
// the others sharing its material (and shadow flags) into one mesh per material. Anything that animates (bobbing pickups,
// swaying things, the rig, characters) is seen moving and left alone. Instanced / skinned / points / sprites are skipped.
// The merged mesh keeps the material's LIT original (look.js `userData.litMat`) so the LIT / FLAT switch still works.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { applyLook, LOOK } from './look.js';

export function makeStaticMerger(scene, { exclude = () => [], after = 3 } = {}) {
  let t = 0, snap = null, done = false;
  const skip = new Set();
  const collectSkip = () => { skip.clear(); for (const r of exclude()) r?.traverse(o => skip.add(o)); };
  const candidates = () => {
    collectSkip();
    const list = [];
    scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || o.userData.ink || o.userData.noMerge) return;
      if (Array.isArray(o.material) || o.material.isShaderMaterial || o.geometry.groups.length > 1 || o.geometry.morphAttributes.position) return;
      if (o.children.length) return;   // removing it would take its children with it
      let v = o; while (v) { if (!v.visible || v.isBone) return; v = v.parent; }   // hidden, or riding a skeleton (guns, cigars)
      list.push(o);
    });
    return list;
  };
  function snapshot() {
    scene.updateMatrixWorld(true);
    snap = new Map(); for (const o of candidates()) snap.set(o, { m: o.matrixWorld.clone(), v: o.geometry.attributes.position.version, g: o.geometry });
  }
  function commit() {
    scene.updateMatrixWorld(true);
    const groups = new Map();
    for (const o of candidates()) {
      const s0 = snap.get(o); if (!s0 || !s0.m.equals(o.matrixWorld) || s0.g !== o.geometry || s0.v !== o.geometry.attributes.position.version) continue;   // new, moved, or its vertices changed
      const mat = o.userData.litMat || o.material, g = o.geometry;
      const sig = Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize).join(',') + (g.index ? 'i' : 'n');
      const key = mat.uuid + '|' + o.castShadow + o.receiveShadow + '|' + o.renderOrder + '|' + sig;
      (groups.get(key) || groups.set(key, { mat, o, list: [] }).get(key)).list.push(o);
    }
    let before = 0, after = 0;
    for (const { mat, o: first, list } of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map(o => { const g = o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (g.attributes[k].isInterleavedBufferAttribute) g.setAttribute(k, g.attributes[k].clone()); return g.applyMatrix4(o.matrixWorld); });
      let merged; try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = first.castShadow; m.receiveShadow = first.receiveShadow; m.renderOrder = first.renderOrder;
      m.userData.litMat = mat; m.userData.merged = list.length; m.name = 'merged:' + (mat.name || mat.type);
      scene.add(m); if (LOOK.mode === 'flat') applyLook(m, 'flat');
      for (const o of list) o.parent?.remove(o);
      before += list.length; after++;
    }
    console.info(`static merge: ${before} meshes -> ${after}`);
    STATS.before = before; STATS.after = after;
  }
  const STATS = { before: 0, after: 0 };
  return {
    stats: STATS,
    /** call every frame from the game loop (dt in seconds) */
    tick(dt) {
      if (done) return;
      if (!snap) { snapshot(); t = performance.now(); return; }
      if (performance.now() - t >= after * 1000) { done = true; commit(); }   // wall clock: a slow first few frames still count
    },
  };
}

/** merge the leaf meshes directly under each node of `root` by material, in that node's own space -- for rigs built from many
 *  rigid primitives (the reindeer: ~34 meshes each). Moving sub-groups (legs, head, antlers) stay separate; only their own
 *  leaf meshes merge. Call before ink outlines / looks are added. */
export function mergeChildren(root) {
  let before = 0, after = 0;
  const nodes = []; root.traverse(o => { if (!o.isMesh) nodes.push(o); });
  for (const n of nodes) {
    const groups = new Map();
    for (const c of n.children) {
      if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || Array.isArray(c.material) || c.geometry.groups.length > 1) continue;
      const g = c.geometry, sig = Object.keys(g.attributes).sort().join(',') + (g.index ? 'i' : 'n');
      const key = c.material.uuid + '|' + c.castShadow + c.receiveShadow + '|' + sig + '|' + c.visible;
      (groups.get(key) || groups.set(key, []).get(key)).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map(c => { c.updateMatrix(); return c.geometry.clone().applyMatrix4(c.matrix); });
      let merged; try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
      geos.forEach(g => g.dispose()); if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.visible = list[0].visible;
      for (const c of list) n.remove(c);
      n.add(m); before += list.length; after++;
    }
  }
  return { before, after };
}
