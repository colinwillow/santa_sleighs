# GUN RIG: his guns_01.glb is four solid, unrigged guns in one mesh. This splits them (loose parts, 3D k-means), and for each
# gun: recentres it on the main hand grip, turns it so the muzzle points glTF +Z (forward) with +Y up, and adds SOCKET nodes
# the game reads: grip_r (main hand), grip_l (support hand), muzzle, eject. The Gatling's barrel cluster becomes its own
# child node `barrels` pivoting on the barrel axis so it can spin. Socket points were picked from front renders (Blender
# world, before the turn) -- move an empty in Blender and re-export to retune a grip.
#   blender -b --python gun_rig.py -- guns_01_undraco.glb out.glb   (one file, four root nodes named by gun, one shared texture)
import bpy, sys, random, math
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
ALL = []
GUNS = {   # name: (k-means seed centre, sockets {name: (x, z)} -- y is the gun's own median depth)
  'snowball_cannon': ((-0.25, 0.10, 0.62), {'grip_r': (-0.255, 0.53), 'grip_l': (-0.387, 0.60), 'muzzle': (-0.51, 0.652), 'eject': (-0.13, 0.70)}),
  'gatling':         ((0.20, -0.27, 0.62), {'grip_r': (0.372, 0.625), 'grip_l': (0.229, 0.762), 'muzzle': (-0.17, 0.632), 'eject': (0.10, 0.58)}),
  'rifle':           ((-0.20, 0.29, 0.15), {'grip_r': (-0.038, 0.106), 'grip_l': (-0.272, 0.158), 'muzzle': (-0.462, 0.176), 'eject': (-0.12, 0.20)}),
  'rocket_launcher': ((0.20, -0.18, 0.17), {'grip_r': (0.176, 0.088), 'grip_l': (0.040, 0.063), 'muzzle': (-0.15, 0.218), 'eject': (0.40, 0.20)}),
}
BARRELS = {'gatling': {'x1': 0.031, 'zc': 0.632, 'r': 0.07}}   # parts in front of x1 within r of the axis = the spinning cluster

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
me = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
bpy.context.view_layer.objects.active = me; me.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
for o in parts:   # bake transforms so vertex coords are world
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
info = [(o, sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices), len(o.data.vertices)) for o in parts]
names = list(GUNS); cent = [Vector(GUNS[n][0]) for n in names]
for it in range(40):
    lab = [min(range(4), key=lambda k: (c - cent[k]).length_squared) for _, c, _ in info]
    for k in range(4):
        tot = sum(n for i, (_, _, n) in enumerate(info) if lab[i] == k) or 1
        cent[k] = sum((c * n for i, (_, c, n) in enumerate(info) if lab[i] == k), Vector()) / tot

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); objs[0].name = name; return objs[0]

turn = Matrix.Rotation(math.radians(90), 4, 'Z')   # Blender -X (his muzzles) -> -Y = glTF +Z
for k, name in enumerate(names):
    grp = [info[i][0] for i in range(len(info)) if lab[i] == k]
    ys = sorted(v.co.y for o in grp for v in o.data.vertices); ymid = ys[len(ys) // 2]
    S = {s: Vector((x, ymid, z)) for s, (x, z) in GUNS[name][1].items()}
    barrel_objs = []
    if name in BARRELS:
        B = BARRELS[name]
        for o in list(grp):
            c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
            if c.x < B['x1'] and math.hypot(c.y - ymid, c.z - B['zc']) < B['r']: barrel_objs.append(o); grp.remove(o)
    body = join(grp, name)
    origin = S['grip_r'].copy()
    M = turn @ Matrix.Translation(-origin)
    body.data.transform(M)
    for o in bpy.data.objects:   # hide everything else from this export
        o.select_set(False)
    keep = [body]
    if barrel_objs:
        bar = join(barrel_objs, 'barrels'); bar.data.transform(M)
        ax = M @ Vector((0, ymid, BARRELS[name]['zc']))           # the spin axis (runs along +Y after the turn = glTF +Z)
        bar.data.transform(Matrix.Translation(-Vector((ax.x, 0, ax.z)))); bar.location = (ax.x, 0, ax.z)
        bar.parent = body; keep.append(bar)
    for s, p in S.items():
        e = bpy.data.objects.new(s, None); bpy.context.collection.objects.link(e); e.location = M @ p; e.parent = body; keep.append(e)
    ALL.extend(keep)
    L = max((v.co.y for v in body.data.vertices)) - min((v.co.y for v in body.data.vertices))
    print('[GUN]', name, 'parts', len(grp) + len(barrel_objs), 'barrels', len(barrel_objs), 'length', round(L, 3))

bpy.ops.object.select_all(action='DESELECT')
for o in ALL: o.select_set(True)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o not in ALL: bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_image_format='AUTO', export_animations=False)
print('[GUN] wrote', out)
