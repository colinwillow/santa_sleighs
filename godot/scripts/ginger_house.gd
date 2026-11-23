## GRID GINGERBREAD HOUSE (his call, Nov 23): cheap + network-friendly. Every brick has an integer id; destruction is just
## "these ids are gone" -- the server decides, every peer applies the same list. Bricks are rounded cookie blocks in a
## running bond (alternate courses offset), drawn with ONE MultiMesh (+ one for icing caps), so a house is ~3 draw calls and
## a brick removal is a transform write, never a mesh rebuild. Icing, candy canes, peppermint, windows are decorations.
class_name GingerHouse
extends Node3D

const CELL := 0.5          # brick height unit (m)
const BRICK := Vector3(1.0, 0.45, 0.5)   # a wall brick: 2 cells long, a little shorter than a cell, 1 cell deep

var bricks: Array = []     # [{p: Vector3 (local centre), s: Vector3 (size), r: Basis, kind: String, alive: bool, row: int, ice: int}]
var mm: MultiMesh
var ice_mm: MultiMesh
var w = 9                 # footprint in cells (x)
var d = 7                 # (z)
var h = 6                 # wall courses
var seed_ = 1
var aabb = AABB()
var alive_count = 0

static var brick_mesh: Mesh
static var ice_mesh: Mesh
static var cookie_mat: StandardMaterial3D
static var ice_mat: StandardMaterial3D

static func rounded_box(size: Vector3, r: float, seg: int = 4) -> ArrayMesh:
	# a subdivided box whose vertices are pulled onto a rounded box: soft cookie edges, no hard 90s
	var bm = BoxMesh.new(); bm.size = size
	bm.subdivide_width = seg; bm.subdivide_height = seg; bm.subdivide_depth = seg
	var arr = bm.get_mesh_arrays()
	var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var norms: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var half = size * 0.5
	var inner = (half - Vector3(r, r, r)).max(Vector3.ZERO)
	for i in verts.size():
		var p = verts[i]
		var c = p.clamp(-inner, inner)
		var n = (p - c)
		if n.length() > 0.0001:
			n = n.normalized(); verts[i] = c + n * r; norms[i] = n
	arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = norms
	var m = ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

static func shared() -> void:
	if brick_mesh: return
	brick_mesh = rounded_box(BRICK * 0.98, 0.09, 4)
	ice_mesh = rounded_box(Vector3(1.06, 0.16, 0.6), 0.07, 3)
	cookie_mat = StandardMaterial3D.new()
	cookie_mat.vertex_color_use_as_albedo = true
	cookie_mat.roughness = 0.8
	ice_mat = StandardMaterial3D.new()
	ice_mat.albedo_color = Color("#fff7ee"); ice_mat.roughness = 0.3
	ice_mat.emission_enabled = true; ice_mat.emission = Color("#3a2a20"); ice_mat.emission_energy_multiplier = 0.15

func _init(p_w := 9, p_d := 7, p_h := 6, p_seed := 1) -> void:
	w = p_w; d = p_d; h = p_h; seed_ = p_seed

func _ready() -> void:
	shared()
	var rng = RandomNumberGenerator.new(); rng.seed = seed_
	var W = w * CELL; var D = d * CELL
	# ---- walls: running bond along each side; openings for a door + windows ----
	var door_c = w / 2
	for row in h:
		var y = row * BRICK.y + BRICK.y * 0.5
		var off = 0.5 if row % 2 == 1 else 0.0
		for side in 4:
			var along = w if side < 2 else d
			var n_b = int(along * CELL / BRICK.x) + 1
			for k in n_b:
				var u = (k + off) * BRICK.x - along * CELL * 0.5 + BRICK.x * 0.5
				if u - BRICK.x * 0.5 < -along * CELL * 0.5 - 0.01 or u + BRICK.x * 0.5 > along * CELL * 0.5 + 0.01:
					continue
				var cu = (u + along * CELL * 0.5) / CELL   # cell coordinate along the side
				# openings: front door (side 0), a window on each side wall at rows 2-3
				if side == 0 and row < 4 and abs(cu - (door_c + 0.5)) < 1.2: continue
				if side >= 1 and row in [2, 3] and abs(cu - along * 0.5) < 1.1: continue
				var p: Vector3; var basis = Basis()
				match side:
					0: p = Vector3(u, y, D * 0.5 - BRICK.z * 0.5)
					1: p = Vector3(u, y, -D * 0.5 + BRICK.z * 0.5)
					2: p = Vector3(W * 0.5 - BRICK.z * 0.5, y, u); basis = Basis(Vector3.UP, PI / 2)
					3: p = Vector3(-W * 0.5 + BRICK.z * 0.5, y, u); basis = Basis(Vector3.UP, PI / 2)
				_add(p, basis, "wall", row, row == h - 1, rng)
	# ---- gable ends (front + back): courses shrinking toward the peak ----
	var gable_rows = int(W * 0.5 / BRICK.x * 1.6)
	var top = h * BRICK.y
	for gr in gable_rows:
		var y = top + gr * BRICK.y + BRICK.y * 0.5
		var half_w = W * 0.5 * (1.0 - float(gr + 1) / float(gable_rows + 1))
		var n_b = int(half_w * 2.0 / BRICK.x)
		for k in n_b:
			var u = (k + 0.5) * BRICK.x - n_b * BRICK.x * 0.5
			for sz in [1.0, -1.0]:
				_add(Vector3(u, y, sz * (D * 0.5 - BRICK.z * 0.5)), Basis(), "gable", h + gr, false, rng)
	# ---- roof: two slopes of tilted cookie shingles, iced along the ridge + eaves ----
	var peak = top + gable_rows * BRICK.y + 0.35
	var run = W * 0.5 + 0.45
	var slope_len = Vector2(run, peak - top + 0.25).length()
	var pitch = atan2(peak - top + 0.25, run)
	var rows_r = int(slope_len / 0.5)
	var cols = int((D + 0.8) / BRICK.x) + 1
	for sgn in [1.0, -1.0]:
		var basis = Basis(Vector3.FORWARD, sgn * pitch) * Basis(Vector3.UP, PI / 2)
		for rr in rows_r:
			var t = (rr + 0.5) / rows_r
			var x = sgn * (run * (1.0 - t))
			var y = top - 0.25 + (peak - top + 0.25) * t + 0.2
			var off = 0.5 if rr % 2 == 1 else 0.0
			for c in cols:
				var z = (c + off) * BRICK.x - cols * BRICK.x * 0.5
				if abs(z) > (D + 0.8) * 0.5: continue
				_add(Vector3(x, y, z), basis, "roof", 100 + rr, rr == rows_r - 1 or rr == 0, rng)
	# ---- build the multimeshes ----
	mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = brick_mesh
	mm.instance_count = bricks.size()
	var n_ice = 0
	for b in bricks: if b.ice >= 0: n_ice += 1
	ice_mm = MultiMesh.new(); ice_mm.transform_format = MultiMesh.TRANSFORM_3D; ice_mm.mesh = ice_mesh; ice_mm.instance_count = n_ice
	var ii = 0
	for i in bricks.size():
		var b: Dictionary = bricks[i]
		mm.set_instance_transform(i, Transform3D(b.r, b.p))
		mm.set_instance_color(i, b.col)
		if b.ice >= 0:
			b.ice = ii
			ice_mm.set_instance_transform(ii, Transform3D(b.r, b.p + b.r * Vector3(0, BRICK.y * 0.55, 0)))
			ii += 1
		aabb = aabb.expand(b.p) if i > 0 else AABB(b.p, Vector3.ZERO)
	aabb = aabb.grow(0.8)
	alive_count = bricks.size()
	var mi = MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = cookie_mat; add_child(mi)
	var ice = MultiMeshInstance3D.new(); ice.multimesh = ice_mm; ice.material_override = ice_mat; add_child(ice)
	_decorate(W, D, top, peak, rng)

func _add(p: Vector3, r: Basis, kind: String, row: int, iced: bool, rng: RandomNumberGenerator) -> void:
	var base = Color("#b4682f") if kind != "roof" else Color("#8a4a22")
	var j = rng.randf_range(-0.06, 0.06)
	var col = Color(base.r + j, base.g + j * 0.8, base.b + j * 0.5)
	bricks.append({"p": p, "r": r, "kind": kind, "alive": true, "row": row, "ice": 0 if iced else -1, "col": col})

func _decorate(W: float, D: float, top: float, peak: float, rng: RandomNumberGenerator) -> void:
	# glowing windows + door (these stay; they are lights inside the openings)
	var glow = StandardMaterial3D.new(); glow.albedo_color = Color("#ffcf86"); glow.emission_enabled = true
	glow.emission = Color("#ffb050"); glow.emission_energy_multiplier = 3.0
	for side in [-1.0, 1.0]:
		var win = MeshInstance3D.new(); var q = QuadMesh.new(); q.size = Vector2(1.0, 0.8); win.mesh = q
		win.material_override = glow; win.position = Vector3(side * (W * 0.5 - 0.2), 2.5 * BRICK.y + 0.22, 0)
		win.rotation.y = side * PI / 2; add_child(win)
	var door = MeshInstance3D.new(); var dm = BoxMesh.new(); dm.size = Vector3(1.0, 1.7, 0.12); door.mesh = dm
	var red = StandardMaterial3D.new(); red.albedo_color = Color("#c22e28"); red.roughness = 0.5; door.material_override = red
	door.position = Vector3(0.25, 0.85, D * 0.5 - 0.3); add_child(door)
	var light = OmniLight3D.new(); light.light_color = Color("#ffb060"); light.light_energy = 2.0; light.omni_range = 5.0
	light.position = Vector3(0, 1.4, 0); add_child(light)
	# candy canes by the door, a peppermint on the front gable peak
	var white = StandardMaterial3D.new(); white.albedo_color = Color("#fff6ea")
	var candy = StandardMaterial3D.new(); candy.albedo_color = Color("#e3283a")
	for sx in [-0.65, 1.15]:
		for k in 6:
			var c = MeshInstance3D.new(); var cy = CylinderMesh.new(); cy.top_radius = 0.07; cy.bottom_radius = 0.07; cy.height = 0.2
			c.mesh = cy; c.material_override = candy if k % 2 == 0 else white; c.position = Vector3(sx, 0.1 + k * 0.2, D * 0.5 + 0.25); add_child(c)
	var pep = MeshInstance3D.new(); var pc = CylinderMesh.new(); pc.top_radius = 0.42; pc.bottom_radius = 0.42; pc.height = 0.16
	pep.mesh = pc; pep.material_override = candy; pep.rotation.x = PI / 2; pep.position = Vector3(0, peak - 0.15, D * 0.5 + 0.1); add_child(pep)

# ---- hits ------------------------------------------------------------------------------------------------------------
## nearest live brick hit by a ray (local space), or -1
func ray_brick(from_w: Vector3, dir_w: Vector3, max_d: float) -> Dictionary:
	var inv = global_transform.affine_inverse()
	var o = inv * from_w; var dv = (inv.basis * dir_w).normalized()
	if not aabb.intersects_segment(o, o + dv * max_d): return {}
	var best = -1; var best_t = max_d
	for i in bricks.size():
		var b: Dictionary = bricks[i]
		if not b.alive: continue
		# ray vs the brick's box in its own frame
		var bo: Vector3 = b.r.inverse() * (o - b.p); var bd: Vector3 = b.r.inverse() * dv
		var half = BRICK * 0.5
		var tmin = 0.0; var tmax = best_t; var ok = true
		for ax in 3:
			if abs(bd[ax]) < 1e-6:
				if abs(bo[ax]) > half[ax]: ok = false; break
			else:
				var t1 = (-half[ax] - bo[ax]) / bd[ax]; var t2 = (half[ax] - bo[ax]) / bd[ax]
				tmin = max(tmin, min(t1, t2)); tmax = min(tmax, max(t1, t2))
				if tmin > tmax: ok = false; break
		if ok and tmin < best_t: best_t = tmin; best = i
	if best < 0: return {}
	return {"id": best, "t": best_t, "point": from_w + dir_w.normalized() * best_t}

## ids of live bricks within radius of a world point (the server calls this, then broadcasts the list)
func bricks_near(point_w: Vector3, radius: float) -> PackedInt32Array:
	var lp = global_transform.affine_inverse() * point_w
	var out = PackedInt32Array()
	for i in bricks.size():
		if bricks[i].alive and bricks[i].p.distance_to(lp) < radius: out.append(i)
	return out

## everything above a removed wall brick with nothing left under it falls too (simple column support)
func unsupported_after(ids: PackedInt32Array) -> PackedInt32Array:
	var gone = {}
	for i in ids: gone[i] = true
	var out = PackedInt32Array()
	var changed = true
	while changed:
		changed = false
		for i in bricks.size():
			var b: Dictionary = bricks[i]
			if not b.alive or gone.has(i) or b.row == 0 or b.kind == "roof": continue
			var held = false
			for j in bricks.size():
				var c: Dictionary = bricks[j]
				if not c.alive or gone.has(j) or c.kind == "roof": continue
				if c.row == b.row - 1 and c.p.distance_to(b.p - Vector3(0, BRICK.y, 0)) < BRICK.x * 0.8: held = true; break
			if not held: gone[i] = true; out.append(i); changed = true
	return out

## apply a removal list (same on every peer); returns world positions for debris
func remove(ids: PackedInt32Array) -> Array:
	var pts = []
	for i in ids:
		if i < 0 or i >= bricks.size() or not bricks[i].alive: continue
		var b: Dictionary = bricks[i]
		b.alive = false; alive_count -= 1
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), b.p))
		if b.ice >= 0: ice_mm.set_instance_transform(b.ice, Transform3D(Basis().scaled(Vector3.ZERO), b.p))
		pts.append({"p": global_transform * b.p, "r": global_transform.basis * b.r, "col": b.col})
	return pts
