# GLB -> FBX for Unity (characters, props): textures embedded, Unity axes, the largest mesh + its armature (stray helper
# meshes like a leftover Icosphere are dropped). Extra bones (weapon mounts, hat chain, jiggle) come along as plain transforms.
#   blender -b --python to_fbx.py -- in.glb out.fbx
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
skinned = [o for o in meshes if any(m.type == 'ARMATURE' for m in o.modifiers)]
if skinned:   # characters: keep the skinned mesh, drop helpers
    keep = max(skinned, key=lambda o: len(o.data.vertices))
    for o in meshes:
        if o is not keep: bpy.data.objects.remove(o)
for o in bpy.data.objects: o.select_set(True)
bpy.ops.export_scene.fbx(filepath=a[1], use_selection=False, apply_scale_options='FBX_SCALE_ALL', axis_forward='-Z', axis_up='Y',
                         add_leaf_bones=False, bake_anim=False, path_mode='COPY', embed_textures=True, mesh_smooth_type='FACE',
                         object_types={'ARMATURE', 'MESH', 'EMPTY'})
print('[FBX] wrote', a[1], [o.name for o in bpy.data.objects])
