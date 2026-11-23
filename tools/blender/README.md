# Blender rig tools

The container's Blender 4.0 can't read Draco, so a GLB round-trips like this (node deps: `@gltf-transform/core@4`
`@gltf-transform/extensions@4` `@gltf-transform/functions@4` `draco3dgltf` `sharp`):

    node undraco.mjs models/elf_girl.glb /tmp/elf_raw.glb                  # Draco off
    blender -b --python elf_jiggle_rig.py -- /tmp/elf_raw.glb /tmp/elf_jig.glb   # add jiggle_L / jiggle_R
    node pack.mjs /tmp/elf_jig.glb models/elf_girl_jiggle.glb               # webp textures + Draco back on

`elf_jiggle_rig.py`: two deform bones parented to Spine2, weighted to the bust with a smoothstep falloff,
only on vertices the torso already owns. The bust centre / radii are the `C` table at the top (metres, Blender space, front = -Y).
