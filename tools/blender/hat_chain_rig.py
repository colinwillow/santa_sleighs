# HAT DYNAMICS RIG: a chain of deform bones along a floppy hat (Santa's curls back + over to the pompom), parented to the
# Head, weighted by how far along the hat each vertex is (the brim stays on the Head, the tip + pompom ride the chain).
#   blender -b --python hat_chain_rig.py -- in.glb out.glb [points.json]
# points.json (optional) = the chain's joints in Blender world space, base first: [[x,y,z], ...]. Default = santa_tough.
import bpy, sys, json
from mathutils import Vector
from mathutils.geometry import intersect_point_line
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
PTS = [(0.0, 0.04, 0.80), (-0.02, 0.13, 0.885), (-0.10, 0.225, 0.845), (-0.17, 0.275, 0.735)]
if len(args) > 2: PTS = json.load(open(args[2]))
RAD = (0.17, 0.13, 0.10, 0.08)        # how far from the chain a vertex may sit and still be "hat" (per joint, base -> tip)
FADE = (0.10, 0.35)                   # weight ramps from 0 at s=.10 to full at s=.35 (s = 0 base .. 1 tip)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
me = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not me: bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
AWi = arm.matrix_world.inverted()
P = [Vector(p) for p in PTS]
head_name = next(b.name for b in arm.data.bones if b.name.endswith('Head') and 'Top' not in b.name)

bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
names = []
parent = eb[head_name]
for i in range(len(P) - 1):
    n = f'hat_{i + 1:02d}'; b = eb.new(n); b.head = AWi @ P[i]; b.tail = AWi @ P[i + 1]
    b.parent = parent; b.use_connect = i > 0; b.use_deform = True; parent = b; names.append(n)
tip = eb.new('hat_tip'); tip.head = AWi @ P[-1]; tip.tail = AWi @ (P[-1] + (P[-1] - P[-2]).normalized() * 0.05)
tip.parent = parent; tip.use_connect = True; tip.use_deform = True; names.append('hat_tip')
bpy.ops.object.mode_set(mode='OBJECT')

# arc length along the chain
seg = [(P[i], P[i + 1]) for i in range(len(P) - 1)]
lens = [(b - a).length for a, b in seg]; total = sum(lens)
head_groups = {g.index for g in me.vertex_groups if g.name.endswith(('Head', 'Neck', 'HeadTop_End'))}
groups = [me.vertex_groups.new(name=n) for n in names]
M = me.matrix_world; n_hat = 0
for v in me.data.vertices:
    p = M @ v.co
    if p.z < 0.64: continue
    if sum(g.weight for g in v.groups if g.group in head_groups) < 0.5: continue
    best = None; acc = 0
    for i, (a, b) in enumerate(seg):
        q, t = intersect_point_line(p, a, b); t = max(0.0, min(1.0, t)); q = a + (b - a) * t
        d = (p - q).length; s = (acc + lens[i] * t) / total
        r = RAD[i] + (RAD[i + 1] - RAD[i]) * t
        if best is None or d / r < best[0]: best = (d / r, i, t, s)
        acc += lens[i]
    k, i, t, s = best
    # the pompom: anything within its ball near the tip goes fully to the tip bone
    if (p - P[-1]).length < 0.075: i, t, s, k = len(seg), 0.0, 1.0, 0.0
    if k > 1.0: continue
    w = max(0.0, min(1.0, (s - FADE[0]) / (FADE[1] - FADE[0]))); w = w * w * (3 - 2 * w)
    if w < 0.01: continue
    for g in v.groups:
        if g.group in head_groups: g.weight *= (1 - w)
    # blend between the segment's bone and the next one by t, so the bend is smooth
    a_i = min(i, len(groups) - 1); b_i = min(i + 1, len(groups) - 1)
    groups[a_i].add([v.index], w * (1 - t), 'ADD'); groups[b_i].add([v.index], w * t, 'ADD'); n_hat += 1
print('[HAT] bones', names, 'verts', n_hat)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_animations=False, export_image_format='AUTO')
