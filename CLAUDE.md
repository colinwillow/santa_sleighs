# SANTA SLEIGHS -- working rules

Cozy snow-diorama flying game (Santa, buff reindeer on ropes, minigun, milk + cookies as health/fuel). Three.js r180 vendored,
native ES modules, import map, **no build step**. Mobile first (portrait + landscape), page zoom locked; iOS later via Capacitor.
Deployed as a static site (GitHub Pages, `.nojekyll`).

- Movement / controls / animation ideas can be borrowed from `colinwillow/korajin` (twin-stick mobile game) -- copy what is needed,
  never import its code wholesale. Rigging: `colinwillow/blender-addons` (Auto-Rig Pro pipeline). Mocap retargeting: `colinwillow/retarget-anims`.
- Tuning numbers live in tables (`FLY` in `src/sleigh.js`). Velocities damp with `Math.exp(-k*dt)`, never a bare `*= k`.
- Every build: raise `BUILD` in `src/main.js` (the cyan number top-left), say what changed in one or two lines, "shipped unverified".
  He playtests on his phone.
- Build only what he asks for; one small slice at a time, refined.
- Primitive models are stand-ins until his GLBs land in `models/`.
