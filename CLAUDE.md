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
- **Destructible gingerbread** (b14, rebuilt to his kit sheet `images/reference/gingerbread_kit_sheet.jpg` + house ref): `src/destruct.js`.
  MODULES on a 2.4 m grid (wall panels plain/snowflake/swirl/awning/lattice/door/arch, rope pillars, gables, shingle roof, dormer,
  chimney, lantern, plinth, steps, fence, props); `buildBreakableHouse(scene, opts)` assembles them (module counts, storeys, panel
  layout, dormer, colours). Walls = SOLID slabs cut into flush jittered chunks (no gaps); hits dent, dead chunks leave as cookie
  debris showing the slab thickness; contact graph: anything cut off from the ground falls. `DESTRUCT` registry (`hitAt(p, r, power)`,
  `raycast`, `update`; bullet `(p, .32, 1)`, blast `(p, 3.2, 30)`), tuning `GB`. 1 solid + 1 glow mesh a house; ~42-61k tris a house
  (still over the 40k target). FAR version: `buildFarHouse` (~3.5k, 1 draw); `placeHouse(scene, o)` shows far and builds the breakable
  one within 40 m or on a hit (`DESTRUCT.update(dt, camera)`). Test page `?scene=destruct` (warm light, bedroom gag in the hero house,
  NAUGHTY chip), `?kit=1` lays out every module. The game village does not use placeHouse yet.
- **Gingerfolk + gags**: `src/gingerfolk.js` = the civilians (cookie-cutter gingerbread people, pivot limbs, expressions happy /
  shock / embarrassed, poses idle / run / flail / cover). `src/gag.js` = hidden moments; `caughtInTheAct(scene, at)` (bed, quilt rhythm,
  hearts; `trigger()` -> freeze, stare, "!", blush, flee). **`CONTENT.level` gates every naughty gag**: off | cheeky (default) | censored | spicy (OPTIONS > NAUGHTY, `?naughty=`;
  `window.SANTA_PLATFORM = 'ios'` or `?tame=1` forces off). Gingerfolk have an `upper` hip hinge for bending.
  Implied only -- never shown; anything sexual involves clearly-adult characters (cookies are fine).
- **TWIN STICKS** (b15, his): `src/input.js` -- LEFT pad flies (steer/climb), RIGHT pad aims + fires (push past `STICKS.fireAt` = shooting);
  both float (pad appears under the thumb, rests faint in its corner). BOOST = a button. The right stick moves a RETICLE round a rest
  point ahead of the sleigh (`AIM` in main.js, `reach` = fraction of the short screen side); the camera ray under it marches to the
  terrain and tracers fly straight at that point (Santa's gun swings after it). Mouse = reticle + left button; gamepad: L fly, R aim/fire,
  RT/A boost, RB fire.
- **WEAPONS** (b18): his `models/weapons/guns_01.glb` (4 solid guns) -> `guns_rigged.glb` by `tools/blender/gun_rig.py` (split by
  loose parts + 3D k-means, each recentred on its main grip, muzzle = +Z, sockets `grip_r grip_l muzzle eject` as empties, the
  Gatling's `barrels` its own spinning node). Pack with `tools/blender/pack.mjs` (prune keepLeaves, or the sockets vanish).
  `src/weapons.js`: `WEAPONS` table (gatling / rifle / rocket / snowball: rate, shot, speed, spread, kick, sound, len), `heldGun`, and
  `makeShots` (slugs, rockets with smoke + blast, lobbed snowballs). Switch: WEAPON button / 1-4 / Q / pad Y; pickups float over the
  village on gold rings. Support hand slides back along the gun to what his arm can reach.
- **GODOT SPIKE** (his call, Nov 23: multiplayer Steam game -> test Godot): `godot/` (Godot 4.4.1; README there). Sleigh flight
  port, GRID gingerbread houses (brick ids, MultiMesh, server-authoritative hits broadcast as id lists), his Santa + Gatling,
  ENet host (drives) / join (shoots) -- verified headless: both peers agreed bricks_gone. Godot can't import Draco: keep non-Draco
  copies in `godot/assets/`. Godot lives in the scratchpad (installing to /opt was refused); xvfb + opengl3 renders frames.
  The web game stays the sketchbook.
- **Home-screen icon** (b11): `icons/*-vN.png` + root `apple-touch-icon.png`, `manifest.webmanifest`. Version in the FILENAME, never `?v=`
  (iOS keeps an icon per URL forever). Source art `images/reference/icon_source.png`; white corners flood-filled with the frame gold.
- **Tough Santa** (b17, his `models/santa_tough.glb`, original untouched): `models/santa_tough_rig.glb` = + HAND MOUNTS (his
  `blender-addons/pipeline/mounts.py`: `weapon_root_right/left`, `weapon_tip(_2)`, `gun_tip_right/left`, children of the hands) + a HAT
  CHAIN (`tools/blender/hat_chain_rig.py`: `hat_01..03` + `hat_tip` along the curl to the pompom, brim stays on the Head). The game
  springs the chain (`HAT` in characters.js, high-passed head accel + idle wobble). OPTIONS > SANTA: TOUGH (default) / CLASSIC (reloads).
  EVERY new humanoid gets mounts.py; the gun still IKs both fists to its grips (mount bones are there for held props).
- **Elf jiggle** (b5): `models/elf_girl_jiggle.glb` = his elf + `jiggle_L/R` bones (Spine2 children, falloff weights) made by
  `tools/blender/` (this Blender can't read Draco: undraco -> rig -> pack). The game springs them in `makeJiggle` (`CREW.jiggle`);
  input is high-passed acceleration, so a long turn doesn't pin them. His original `elf_girl.glb` stays untouched.
