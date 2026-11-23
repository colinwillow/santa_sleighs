# Models

Drop `.glb` files here (Draco is fine; the decoder is in `vendor/draco`).

- `models/characters/` - Santa, elves, reindeer, snowmen, gingerbread men
- `models/props/` - sleigh, minigun, houses, presents...

## Uploading from the GitHub website (no git needed)
1. Open the repo on github.com, go into this `models/characters` (or `props`) folder.
2. **Add file -> Upload files**, drag the `.glb` (or `.fbx` / `.zip`) in, and **Commit changes**.
   GitHub's web upload takes files up to 25 MB; bigger ones need git or Git LFS.
3. Tell Claude the file name and it gets wired in (and rigged with Auto-Rig Pro from `blender-addons` if it needs a skeleton).

House rules: 1 unit = 1 m, Y up, Santa ~1.75 m, Mixamo bone names, textures 512-2K, files under ~20 MB.
