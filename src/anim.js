// Animation: Mixamo clips from colinwillow/retarget-anims (Y Bot, copied into models/anims/), retargeted at load onto
// each character's OWN rest skeleton (src/retarget.js), cached per (character, clip), crossfaded by role.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { retargetClip } from './retarget.js';

// role -> clip file stem, per character kind. Add a role here + drop the GLB in models/anims/.
export const CLIPS = {
  santa: {
    idle: 'Rifle_Idle_2', fire: 'Firing_Rifle_2', walk: 'Rifle_Walk', run: 'Rifle_Run', jump: 'Jumping_5', air: 'Falling_Idle', getup: 'Getting_Up', land: 'Landing',
    tipsy: 'Drunk_Idle', dance: 'Silly_Dancing', cheer: 'Cheering',
  },
  elf: {
    idle: 'Idle_14', happy: 'Happy_Idle', walk: 'Walking', run: 'Standard_Run', jump: 'Jumping_5', air: 'Falling_Idle',
    samba: 'Samba_Dancing', hiphop: 'Hip_Hop_Dancing', wave_dance: 'Wave_Hip_Hop_Dance', wave: 'Waving',
    sit: 'Sitting_Idle_3', cheer: 'Cheering', cheer_sit: 'Cheering_While_Sitting',
  },
  snowman: { idle: 'Mutant_Breathing_Idle', roar: 'Mutant_Roaring', hit: 'Hit_Reaction', die: 'Mutant_Dying',
    walk: 'Mutant_Walking', run: 'Mutant_Run', swipe: 'Mutant_Swiping', punch: 'Mutant_Punch', jump: 'Mutant_Jump_Attack', flex: 'Mutant_Flexing_Muscles_1' },
};

const loader = new GLTFLoader();
const srcCache = new Map();
function loadSrc(stem) {
  if (!srcCache.has(stem)) srcCache.set(stem, new Promise((res, rej) => loader.load(`./models/anims/${stem}.glb`, g => res({ scene: g.scene, clip: g.animations[0] }), undefined, rej)));
  return srcCache.get(stem);
}

/**
 * animator(kind, restScene, liveScene): restScene = an untouched copy of the character (never posed), liveScene = the
 * instance in the world. play(role) loads + retargets on first use, then crossfades.
 */
export function animator(kind, restScene, liveScene) {
  const mixer = new THREE.AnimationMixer(liveScene);
  const baked = new Map();      // role -> Promise<AnimationAction>
  let current = null, currentRole = null;
  const action = role => {
    if (!baked.has(role)) baked.set(role, (async () => {
      const stem = CLIPS[kind][role]; if (!stem) throw new Error('no clip for ' + kind + '.' + role);
      const { scene, clip } = await loadSrc(stem);
      const rc = retargetClip(scene, clip, restScene, { name: role });
      return mixer.clipAction(rc);
    })());
    return baked.get(role);
  };
  return {
    mixer, roles: Object.keys(CLIPS[kind]),
    get role() { return currentRole; },
    async play(role, fade = 0.18, { once = false, speed = 1 } = {}) {
      if (role === currentRole) return current;
      currentRole = role;
      const a = await action(role);
      if (currentRole !== role) return a;              // a newer request won while this one loaded
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed;
      a.play();
      if (current && current !== a) current.crossFadeTo(a, fade, false); else a.fadeIn(fade);
      current = a;
      return a;
    },
    /** playback speed of the current clip (legs matched to ground speed) */
    setSpeed(s) { if (current) current.timeScale += (s - current.timeScale) * 0.2; },
    preload(...roles) { return Promise.all(roles.map(action)); },
    update(dt) { mixer.update(dt); },
  };
}
