## THE SLEIGH -- a port of the web game's flight (src/sleigh.js FLY): the player flies a lead point (yaw / pitch / speed),
## four buff reindeer spring after their slots, and the sleigh hangs off the rear pair on a slack rope (gravity + drag + a
## distance constraint), so it swings out on turns. NOBODY DRIVING = it holds its heading and flies straight on (his design:
## it can crash). Only the server simulates; clients receive `state()` and draw it.
class_name Sleigh
extends Node3D

const FLY := {
	"speed": 24.0, "boost": 40.0, "accel": 1.6, "turn": 1.25, "climb": 0.75, "max_bank": 0.7,
	"min_alt": 3.0, "ceiling": 120.0, "rope": 8.5, "grav": 4.5, "drag": 0.014, "deer_k": 28.0, "deer_c": 9.0,
}
var lead = Vector3(0, 30, -90)
var yaw = 0.0
var pitch = 0.0
var bank = 0.0
var speed = 24.0
var S = Vector3(0, 30, -104)       # the sleigh body
var SV = Vector3(0, 0, 24)
var deer: Array = []               # [{node, slot, p, v}]
var body: Node3D
var ropes: Array = []
var input = {"steer": 0.0, "climb": 0.0, "boost": false}
var ground_h: Callable = func(_x, _z): return 0.0
var crashed = 0.0                  # >0 for a moment after a hard hit (shake + sound hook)

func _ready() -> void:
	body = _build_sleigh(); add_child(body)
	var slots = [Vector3(-1.5, 0, 0), Vector3(1.5, 0, 0), Vector3(-1.5, 0, -4.4), Vector3(1.5, 0, -4.4)]
	for i in 4:
		var n = _build_deer(i == 0); add_child(n)
		deer.append({"node": n, "slot": slots[i], "p": lead + slots[i], "v": Vector3(0, 0, speed), "phase": i * 0.37})
	for i in 2:
		var r = MeshInstance3D.new(); r.mesh = ImmediateMesh.new()
		var m = StandardMaterial3D.new(); m.albedo_color = Color("#7a4a2a"); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		r.material_override = m; add_child(r); ropes.append(r)

func _mat(c: String, metal := false) -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = Color(c); m.roughness = 0.4 if metal else 0.75; m.metallic = 0.7 if metal else 0.0; return m

func _build_sleigh() -> Node3D:
	var g = Node3D.new()
	var red = _mat("#d42a2a"); var gold = _mat("#e8b84a", true)
	var hull = MeshInstance3D.new(); hull.mesh = GingerHouse.rounded_box(Vector3(2.2, 1.1, 4.4), 0.35, 4); hull.material_override = red
	hull.position = Vector3(0, 0.95, 0); g.add_child(hull)
	var back = MeshInstance3D.new(); back.mesh = GingerHouse.rounded_box(Vector3(2.2, 1.0, 0.5), 0.2, 3); back.material_override = red
	back.position = Vector3(0, 1.9, -1.9); g.add_child(back)
	for sx in [-0.95, 0.95]:
		var run = MeshInstance3D.new(); run.mesh = GingerHouse.rounded_box(Vector3(0.14, 0.14, 5.0), 0.06, 2); run.material_override = gold
		run.position = Vector3(sx, 0.08, 0.2); g.add_child(run)
		var curl = MeshInstance3D.new(); var t = TorusMesh.new(); t.inner_radius = 0.35; t.outer_radius = 0.5; curl.mesh = t
		curl.material_override = gold; curl.rotation.z = PI / 2; curl.position = Vector3(sx, 0.5, 2.7); g.add_child(curl)
	var sack = MeshInstance3D.new(); var sm = SphereMesh.new(); sm.radius = 0.9; sm.height = 1.6; sack.mesh = sm
	sack.material_override = _mat("#3f7a4a"); sack.position = Vector3(0, 1.9, -1.2); g.add_child(sack)
	return g

func _build_deer(red_nose: bool) -> Node3D:
	var g = Node3D.new(); var fur = _mat("#8a5a3a"); var light = _mat("#d9b48f")
	var chest = MeshInstance3D.new(); var c = SphereMesh.new(); c.radius = 0.9; c.height = 1.6; chest.mesh = c; chest.material_override = fur
	chest.position = Vector3(0, 1.8, 0.4); chest.scale = Vector3(1.1, 1.0, 1.4); g.add_child(chest)
	var head = MeshInstance3D.new(); var hm = SphereMesh.new(); hm.radius = 0.42; hm.height = 0.84; head.mesh = hm; head.material_override = fur
	head.position = Vector3(0, 2.7, 1.5); g.add_child(head)
	var nose = MeshInstance3D.new(); var nm = SphereMesh.new(); nm.radius = 0.12; nm.height = 0.24; nose.mesh = nm
	var nmat = _mat("#ff2a2a" if red_nose else "#1b1b22")
	if red_nose: nmat.emission_enabled = true; nmat.emission = Color("#ff1010"); nmat.emission_energy_multiplier = 3.0
	nose.material_override = nmat; nose.position = Vector3(0, 2.62, 1.95); g.add_child(nose)
	for sx in [-0.25, 0.25]:
		var a = MeshInstance3D.new(); var cy = CylinderMesh.new(); cy.top_radius = 0.04; cy.bottom_radius = 0.06; cy.height = 0.9
		a.mesh = cy; a.material_override = light; a.position = Vector3(sx, 3.3, 1.4); a.rotation.z = -sx * 2.0; g.add_child(a)
	for p in [Vector3(-0.45, 0.8, 0.9), Vector3(0.45, 0.8, 0.9), Vector3(-0.4, 0.8, -0.3), Vector3(0.4, 0.8, -0.3)]:
		var leg = MeshInstance3D.new(); var lm = CylinderMesh.new(); lm.top_radius = 0.16; lm.bottom_radius = 0.1; lm.height = 1.2
		leg.mesh = lm; leg.material_override = fur; leg.position = p; leg.set_meta("leg", true); g.add_child(leg)
	return g

func lead_basis() -> Basis:
	var f = Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	var b = Basis.looking_at(-f, Vector3.UP)        # looking_at points -Z at the target; our models face +Z
	return b * Basis(Vector3.FORWARD, -bank)

## server only: advance the flight
func simulate(dt: float) -> void:
	var tgt: float = FLY.boost if input.boost else FLY.speed
	speed += (tgt - speed) * (1.0 - exp(-FLY.accel * dt))
	yaw -= input.steer * FLY.turn * dt
	pitch += (input.climb * FLY.climb - pitch) * (1.0 - exp(-3.0 * dt))
	bank += (input.steer * FLY.max_bank - bank) * (1.0 - exp(-4.0 * dt))
	var f = Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	lead += f * speed * dt
	var gh: float = ground_h.call(lead.x, lead.z) + FLY.min_alt + 1.5
	if lead.y < gh: lead.y = gh; pitch = max(pitch, 0.1)
	if lead.y > FLY.ceiling: lead.y = FLY.ceiling; pitch = min(pitch, 0.0)
	var rim = Vector2(lead.x, lead.z).length()
	if rim > 260.0:   # the map edge curls you back in
		var want = atan2(-lead.x, -lead.z); var dy = wrapf(want - yaw, -PI, PI); yaw += dy * min(1.0, (rim - 260.0) / 40.0) * dt * 2.0
	_deer_and_rope(dt, f)

func _deer_and_rope(dt: float, f: Vector3) -> void:
	var lb = lead_basis()
	for dd in deer:
		var target: Vector3 = lead + lb * dd.slot
		var acc: Vector3 = (target - dd.p) * FLY.deer_k - (dd.v - f * speed) * FLY.deer_c
		dd.v += acc * dt; dd.p += dd.v * dt
	var harness: Vector3 = (deer[2].p + deer[3].p) * 0.5 - lb.z * 1.3 + Vector3(0, 1.8, 0)
	var sp = SV.length()
	SV.y -= FLY.grav * dt
	SV -= SV * FLY.drag * sp * dt
	S += SV * dt
	var to = S - harness; var dist = to.length()
	if dist > FLY.rope:
		to /= dist; S = harness + to * FLY.rope
		var out = SV.dot(to) - deer[2].v.dot(to)
		if out > 0.0: SV -= to * out * 1.02
	var floor_y: float = ground_h.call(S.x, S.z) + 0.15
	if S.y < floor_y:
		if SV.y < -6.0: crashed = 1.0
		S.y = floor_y; if SV.y < 0.0: SV.y *= -0.25

## the state every peer needs to draw the sleigh
func state() -> Array:
	var dp = []
	for dd in deer: dp.append(dd.p)
	return [lead, yaw, pitch, bank, speed, S, SV, dp]

func apply_state(s: Array) -> void:
	lead = s[0]; yaw = s[1]; pitch = s[2]; bank = s[3]; speed = s[4]; S = s[5]; SV = s[6]
	for i in deer.size(): deer[i].p = s[7][i]

## every peer: place the meshes from the state
func draw(dt: float, t: float) -> void:
	var lb = lead_basis()
	for i in deer.size():
		var n: Node3D = deer[i].node
		n.global_position = n.global_position.lerp(deer[i].p, 1.0 - exp(-20.0 * dt)) if n.global_position.length() > 0.1 else deer[i].p
		n.global_basis = n.global_basis.slerp(lb, 1.0 - exp(-10.0 * dt))
		var ph: float = t * (6.0 + speed * 0.18) + deer[i].phase * 6.0
		for leg in n.get_children():
			if leg.has_meta("leg"): leg.rotation.x = sin(ph + (0.0 if leg.position.z > 0 else PI)) * 0.7
	var harness: Vector3 = (deer[2].p + deer[3].p) * 0.5 - lb.z * 1.3 + Vector3(0, 1.8, 0)
	body.global_position = body.global_position.lerp(S, 1.0 - exp(-20.0 * dt)) if body.global_position.length() > 0.1 else S
	var fwd = (harness - S).normalized()
	if fwd.length() > 0.5:
		var want = Basis.looking_at(-fwd, Vector3.UP)
		body.global_basis = body.global_basis.slerp(want, 1.0 - exp(-12.0 * dt))
	# two sagging reins: rear deer -> the sleigh's front hooks
	for k in 2:
		var a: Vector3 = deer[2 + k].p + Vector3(0, 1.8, -0.8)
		var b: Vector3 = body.global_transform * Vector3(-0.6 + 1.2 * k, 1.4, 2.4)
		var im: ImmediateMesh = ropes[k].mesh; im.clear_surfaces(); im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
		for j in 11:
			var u = j / 10.0; var p = a.lerp(b, u); p.y -= sin(u * PI) * 0.6
			im.surface_add_vertex(p)
		im.surface_end()
