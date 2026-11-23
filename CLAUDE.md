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
- **Elf jiggle** (b5): `models/elf_girl_jiggle.glb` = his elf + `jiggle_L/R` bones (Spine2 children, falloff weights) made by
  `tools/blender/` (this Blender can't read Draco: undraco -> rig -> pack). The game springs them in `makeJiggle` (`CREW.jiggle`);
  input is high-passed acceleration, so a long turn doesn't pin them. His original `elf_girl.glb` stays untouched.
