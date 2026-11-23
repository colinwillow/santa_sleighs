# Mixamo clip (retarget-anims library GLB: an animated node tree, no skin) -> an ARMATURE FBX Unity can import as Humanoid.
# Builds one bone per mixamorig node with its rest orientation = the node's rest world transform, drives each bone from its
# node with Copy Transforms, bakes, and exports the armature with the baked action.
#   blender -b --python clip_to_fbx.py -- clip.glb out.fbx
import bpy, sys
from mathutils import Matrix
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
nodes = [o for o in bpy.data.objects if o.name.startswith('mixamorig')]
acts = {o.name: (o.animation_data.action if o.animation_data else None) for o in nodes}
# rest = the tree with no animation applied
for o in nodes:
    if o.animation_data: o.animation_data.action = None
bpy.context.view_layer.update()
rest = {o.name: o.matrix_world.copy() for o in nodes}
frame_end = int(max((act.frame_range[1] for act in acts.values() if act), default=1))
for o in list(bpy.data.objects):          # the importer's parent empty is called Armature too: free the name
    if o.type == 'EMPTY' and not o.name.startswith('mixamorig'): o.name = 'clip_root'
arm_d = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_d); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for o in nodes:
    b = arm_d.edit_bones.new(o.name)
    kids = [c for c in o.children if c.name.startswith('mixamorig')]
    L = max(0.02, min(((rest[c.name].translation - rest[o.name].translation).length for c in kids), default=0.05))
    b.length = L; b.matrix = rest[o.name].normalized()   # head at the node, axes = the node's axes (Y along the bone)
for o in nodes:
    p = o.parent
    if p is not None and p.name.startswith('mixamorig'): arm_d.edit_bones[o.name].parent = arm_d.edit_bones[p.name]
bpy.ops.object.mode_set(mode='OBJECT')
for o in nodes:
    if acts[o.name]:
        o.animation_data_create(); o.animation_data.action = acts[o.name]
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    c = pb.constraints.new('COPY_TRANSFORMS'); c.target = bpy.data.objects[pb.name]
    if pb.name.endswith('Hips'): pass
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.nla.bake(frame_start=1, frame_end=max(2, frame_end), only_selected=False, visual_keying=True, clear_constraints=True, bake_types={'POSE'})
bpy.ops.object.mode_set(mode='OBJECT')
arm.animation_data.action.name = a[1].split('/')[-1].rsplit('.', 1)[0]
for o in list(bpy.data.objects):
    if o is not arm: bpy.data.objects.remove(o)
arm.select_set(True)
bpy.ops.export_scene.fbx(filepath=a[1], object_types={'ARMATURE'}, add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=False,
                         bake_anim_use_nla_strips=False, axis_forward='-Z', axis_up='Y', apply_scale_options='FBX_SCALE_ALL')
print('[CLIP] wrote', a[1], 'frames', frame_end, 'bones', len(arm.pose.bones))
