# Add two jiggle bones (jiggle_L / jiggle_R) to the elf: parented to Spine2, weighted to the bust with a smooth
# falloff (only on vertices already owned by the torso), then export a GLB for the game to spring.
import bpy, sys
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
src, out = args[0], args[1]
C = dict(cx=0.042, cy=-0.118, cz=0.652, rx=0.06, ry=0.055, rz=0.055, base_y=-0.082)  # metres, Blender space (front = -Y)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
me = next(o for o in bpy.data.objects if o.type == 'MESH')
AW = arm.matrix_world; AWi = AW.inverted()
spine2 = next(b.name for b in arm.data.bones if b.name.endswith('Spine2'))
torso = {g.index for g in me.vertex_groups if any(g.name.endswith(s) for s in ('Spine', 'Spine1', 'Spine2'))}

bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for side, sx in (('L', 1), ('R', -1)):
    b = eb.new(f'jiggle_{side}')
    b.head = AWi @ Vector((sx * C['cx'], C['base_y'], C['cz'] + 0.004))
    b.tail = AWi @ Vector((sx * (C['cx'] + 0.004), C['cy'] - 0.035, C['cz']))
    b.parent = eb[spine2]; b.use_connect = False; b.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')

M = me.matrix_world
gL = me.vertex_groups.new(name='jiggle_L'); gR = me.vertex_groups.new(name='jiggle_R')
n = 0
for v in me.data.vertices:
    p = M @ v.co
    if p.y > C['base_y']: continue
    own = sum(g.weight for g in v.groups if g.group in torso)
    if own < 0.5: continue
    for grp, sx in ((gL, 1), (gR, -1)):
        d = ((p.x - sx * C['cx']) / C['rx']) ** 2 + ((p.y - C['cy']) / C['ry']) ** 2 + ((p.z - C['cz']) / C['rz']) ** 2
        if d >= 1: continue
        t = 1 - d ** 0.5; w = 0.95 * t * t * (3 - 2 * t)          # smoothstep falloff to the rim
        w *= min(1, (C['base_y'] - p.y) / 0.02)                     # fade in from the ribcage
        if w < 0.01: continue
        for g in v.groups: g.weight *= (1 - w)                       # take it from the existing bones
        grp.add([v.index], w, 'REPLACE'); n += 1
print('JIGGLE verts', n)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_morph=False, export_image_format='AUTO')
