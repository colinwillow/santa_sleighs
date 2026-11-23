# Santa Slays -- Godot 4.4 spike

Proves the Godot route for the multiplayer Steam game: the sleigh flight (ported from `src/sleigh.js`), GRID gingerbread houses
(every brick an id; a hit = "these ids are gone", decided by the server, applied on every peer), his Tough Santa + Gatling imported,
and two players over the network (host drives, joiner shoots).

## Run (Godot 4.4.x, https://godotengine.org/download)
- Open: Godot -> Import -> pick `godot/project.godot` -> Run (F5). Solo: WASD/arrows fly, Shift boost, mouse aims, left click fires.
- Two players on one machine / LAN: `godot --path godot -- --host` (drives), then `godot --path godot -- --join=127.0.0.1` (Santa's gun).
  Over the internet later this becomes Steam lobbies + Steam P2P (GodotSteam), no port forwarding.

## Files
- `scripts/main.gd` -- world, town, networking (server-authoritative: `req_fire` -> `show_fire`), camera, HUD, test hooks.
- `scripts/sleigh.gd` -- flight + reindeer springs + rope-hung sleigh; `state()` / `apply_state()` is what syncs.
- `scripts/ginger_house.gd` -- the grid house: rounded cookie bricks in running bond, one MultiMesh (+ icing), ray / radius hits,
  column support (unsupported bricks fall).
- `assets/` -- NON-Draco copies of his GLBs (Godot's importer can't read Draco): `node tools/blender/undraco.mjs in.glb out.glb`.

## Headless checks (how Claude tests it in the container)
- `godot --headless --path godot -- --test --frames=240` -> prints `[TEST] ... bricks_gone=N`.
- Host + client: run `-- --host --test --frames=1000` and `-- --join=127.0.0.1 --test --frames=700` together; both must print the
  same `bricks_gone` (they did: 5 = 5, 139 shots).
- Screenshot: `xvfb-run -a godot --path godot --rendering-driver opengl3 -- --test --shotframe=200 --shot=out.png --frames=210`
  (`--cam=x,y,z --look=x,y,z` pin the camera).
