# SANTA SLAYS -- working rules (repo: santa_sleighs)

Cozy snow-diorama flying game (Santa, buff reindeer on ropes, minigun, milk + cookies as health/fuel). Three.js r180 vendored,
native ES modules, import map, **no build step**. Mobile first (portrait + landscape), page zoom locked; iOS later via Capacitor.
Deployed as a static site (GitHub Pages, `.nojekyll`).

- Movement / controls / animation ideas can be borrowed from `colinwillow/korajin` (twin-stick mobile game) -- copy what is needed,
  never import its code wholesale. Rigging: `colinwillow/blender-addons` (Auto-Rig Pro pipeline). Mocap retargeting: `colinwillow/retarget-anims`.
- Tuning numbers live in tables (`FLY` in `src/sleigh.js`). Velocities damp with `Math.exp(-k*dt)`, never a bare `*= k`.
- **ALWAYS PUSH TO `main`** (his, Nov 23: "always push to main"). Commit, `git pull --rebase origin main`, `git push origin main`. No PRs unless he asks.
- Every build: raise `BUILD` in `src/main.js` (the cyan number top-left), say what changed in one or two lines, "shipped unverified".
  He playtests on his phone.
- Build only what he asks for; one small slice at a time, refined.
- Primitive models are stand-ins until his GLBs land in `models/` (`models/santa.glb`, `models/elf_girl.glb`: Mixamo-rigged, no clips yet).
- **The neighborhood kit** (`src/kit.js`): every piece is `piece(K, x, z, ry, opts)` writing into one batched context; layout files
  (`village.js`, `kitshow.js`) only decide placement. New piece = a builder in kit.js + a spot in the showroom (`?scene=kit`).
- Look: bloom (`src/post.js`, `?bloom=0` = raw A/B) + lavender FogExp2 haze; glowing things use the `L` batch (past 1.0 so they bloom).
- Budget: report tris/draws when they move (b3: village solid batch ~260k tris, ~70 draws). Small details use `BALL` / `CYL6`, not `BLOB` / `CYL`.
- Design notes: `DESIGN.md`. **It is a SHOOTER** ("Santa Slays"): Rambo-size gun + cigar.
- **The crew** (`src/crew.js`): his GLBs posed in code, no clips yet. Santa's hands are two-bone IK'd onto the gun's grip sockets
  (never a world-position guess); the cigar hangs off the Head bone. Elves = one model cloned (`SkeletonUtils.clone`).
  Tuning in `CREW`. `?cam=crew` = the close-up for checking poses.
- **Animation** (b7): Mixamo clips from `colinwillow/retarget-anims` (Y Bot, `library/clips/*.glb`) are COPIED into
  `models/anims/` and retargeted at load (`src/retarget.js` = a copy of that repo's layer 1, patched to read plain nodes).
  Roles per character in `CLIPS` (`src/anim.js`); add a role = copy the GLB + one line. Code layers run AFTER the clip:
  Santa's fists IK'd to the gun (gun rides his Spine, aimed in his frame), elf arm overrides, jiggle. `characters.js` builds
  them; `crew.js` places them in the sleigh; `sandbox.js` (`?scene=sandbox`) shows them on white with clip buttons.
- **Look** (b7): `src/look.js` -- FLAT = every lit material swapped for a self-lit copy + ink outlines (inverted hulls, skinning-aware);
  LIT = original. A taste switch: the LOOK chip (remembered), `?look=flat|lit`. Sandbox defaults FLAT, the game LIT.
- **Menus** (b8): `src/menu.js` = DOM overlays; main.js owns STATE ('menu' | 'play' | 'pause') and hands in handlers. START SCREEN = the
  live world: the crew (separate Santa + 2 elves, idle clips, Santa fires bursts at the sky) on a cleared stage at `MENU_SPOT`
  (terrain.js; village.js keeps it clear + dresses it), the sleigh auto-circles behind. PAUSE: options, DEBUG (fps/tris/draws, camera,
  slow-mo, look, bloom, HUD stats, reset), sandboxes. `?play=1` skips the menu; test pages get a `◀ MENU` chip. Elves are 1.8 m (Santa 2.0).
- **Sound**: `src/audio.js` (`window.sfx`: play / loop handles / master / music bus), files + CREDITS in `audio/`. Game code calls
  `window.sfx?.…` so a missing module never blanks the page. Check modules with `node --input-type=module --check < file`
  (plain `node --check` missed a stray paren once).
- **Destructible gingerbread** (b10): `src/destruct.js` -- `buildBreakableHouse(scene, opts)` + the `DESTRUCT` registry (`hitAt(p, r, power)`,
  `raycast`, `update(dt)`; bullet `(p, .32, 1)`, blast `(p, 3.2, 30)`). One merged mesh per material a house; each piece owns a vertex
  range, a dead piece is copied out as CPU debris and its range collapsed (draws never change). Support: blocks fall when all below are
  gone, roof panels drop under 45% wall tops, chimney with its panel. ~36k tris a house -- test-page weight; a village needs a far version.
  Test page `?scene=destruct` (`src/destructshow.js`). Tuning in `GB`.
- **Elf jiggle** (b5): `models/elf_girl_jiggle.glb` = his elf + `jiggle_L/R` bones (Spine2 children, falloff weights) made by
  `tools/blender/` (this Blender can't read Draco: undraco -> rig -> pack). The game springs them in `makeJiggle` (`CREW.jiggle`);
  input is high-passed acceleration, so a long turn doesn't pin them. His original `elf_girl.glb` stays untouched.
