## SANTA SLAYS -- Godot spike (Nov 23). Proves: the sleigh flight port, grid gingerbread houses you can shoot apart,
## his Santa + guns imported, and TWO PLAYERS over the network -- the HOST drives the sleigh, a JOINING player rides as the
## gunner. The server is authoritative: it flies the sleigh, decides every hit, and broadcasts "these brick ids are gone".
##
## Run:   godot --path godot                      solo (you drive + shoot)
##        godot --path godot -- --host            host: drives (WASD / arrows, shift boost), port 7777
##        godot --path godot -- --join=IP         gunner: mouse aims, left button fires (or Space)
## Test:  --test (scripted input), --frames=N (quit after N frames), --shot=path.png (save a frame), --cam=x,y,z
extends Node3D

const PORT := 7777
var args = {}
var sleigh: Sleigh
var shots_sent := 0
var houses: Array = []
var cam: Camera3D
var hud: Label
var santa: Node3D
var gun: Node3D
var muzzle: Node3D
var role = "solo"                 # solo | driver | gunner
var aim_point = Vector3.ZERO
var fire_cd = 0.0
var frames = 0
var t = 0.0
var tracers: Array = []
var debris: Array = []
var bricks_gone = 0
var peers = 0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv = a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else true
	_world()
	sleigh = Sleigh.new(); sleigh.ground_h = func(x, z): return 0.0
	add_child(sleigh)
	_santa_and_gun()
	cam = Camera3D.new(); cam.fov = 62; cam.far = 1500; add_child(cam); cam.current = true
	hud = Label.new(); hud.position = Vector2(12, 8); hud.add_theme_font_size_override("font_size", 20)
	var layer = CanvasLayer.new(); layer.add_child(hud); add_child(layer)
	_network()

# ---- the world: dusk sky, fog + glow, snow ground, a little town of grid gingerbread houses ---------------------------
func _world() -> void:
	var env = Environment.new()
	var sky = Sky.new(); var sm = ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("#141c44"); sm.sky_horizon_color = Color("#f0a88a"); sm.ground_horizon_color = Color("#8a84b8"); sm.ground_bottom_color = Color("#2a2a44")
	sky.sky_material = sm; env.sky = sky; env.background_mode = Environment.BG_SKY
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.glow_enabled = true; env.glow_intensity = 0.9; env.glow_bloom = 0.15
	env.fog_enabled = true; env.fog_light_color = Color("#8a84b8"); env.fog_density = 0.0015
	var we = WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun = DirectionalLight3D.new(); sun.light_color = Color("#c9d6ff"); sun.light_energy = 1.1; sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-50, -40, 0); add_child(sun)
	var ground = MeshInstance3D.new(); var pm = PlaneMesh.new(); pm.size = Vector2(700, 700); ground.mesh = pm
	var snow = StandardMaterial3D.new(); snow.albedo_color = Color("#e9eeff"); snow.roughness = 0.95; ground.material_override = snow
	add_child(ground)
	# a small town: houses on a grid with streets between (seeded, so every peer builds the identical town)
	var idx = 0
	for gx in range(-3, 4):
		for gz in range(-3, 4):
			if (gx + gz) % 2 != 0 and abs(gx) + abs(gz) > 1: continue
			var hw = 7 + (idx % 3) * 2; var hd = 6 + ((idx / 3) % 2) * 2; var hh = 5 + (idx % 2)
			var hs = GingerHouse.new(hw, hd, hh, 100 + idx)
			hs.position = Vector3(gx * 16.0, 0, gz * 16.0); hs.rotation.y = (idx % 4) * PI / 2
			add_child(hs); houses.append(hs); idx += 1

# ---- his Santa + the Gatling (imported GLBs; no clips yet in the spike -- arms posed toward the gun) -------------------
func _santa_and_gun() -> void:
	var s = load("res://assets/santa_tough_rig.glb") as PackedScene
	if s:
		santa = s.instantiate(); sleigh.body.add_child(santa)
		santa.scale = Vector3.ONE * 2.0; santa.position = Vector3(0, 1.0, -0.2)
	var gs = load("res://assets/guns_rigged.glb") as PackedScene
	if gs:
		var all = gs.instantiate()
		var g = all.find_child("gatling", true, false) as Node3D
		if g:
			all.remove_child(g); g.owner = null
			gun = Node3D.new(); gun.add_child(g); sleigh.body.add_child(gun)
			gun.position = Vector3(-0.3, 2.1, 0.6); g.scale = Vector3.ONE * 4.0; g.position = Vector3.ZERO
			for c in g.get_children(): if c.name.begins_with("muzzle"): muzzle = c
		all.queue_free()

# ---- networking -----------------------------------------------------------------------------------------------------
func _network() -> void:
	if args.has("host"):
		var peer = ENetMultiplayerPeer.new(); var err = peer.create_server(PORT, 8)
		print("[NET] host on ", PORT, " err=", err)
		multiplayer.multiplayer_peer = peer; role = "driver"
		multiplayer.peer_connected.connect(func(id): peers += 1; print("[NET] peer joined ", id))
		multiplayer.peer_disconnected.connect(func(id): peers -= 1; print("[NET] peer left ", id))
	elif args.has("join"):
		var peer = ENetMultiplayerPeer.new(); var err = peer.create_client(str(args["join"]), PORT)
		print("[NET] joining ", args["join"], " err=", err)
		multiplayer.multiplayer_peer = peer; role = "gunner"
		multiplayer.connected_to_server.connect(func(): print("[NET] connected as ", multiplayer.get_unique_id()))
	else:
		role = "solo"

func is_server() -> bool:
	return not multiplayer.has_multiplayer_peer() or multiplayer.is_server()

# server -> everyone: the sleigh's state (unreliable; the next one replaces it)
@rpc("authority", "call_remote", "unreliable_ordered")
func sync_sleigh(s: Array, aim: Vector3) -> void:
	sleigh.apply_state(s)
	if role != "gunner": aim_point = aim

# gunner -> server: where I'm aiming (so the host sees Santa aim)
@rpc("any_peer", "call_remote", "unreliable_ordered")
func gunner_aim(p: Vector3) -> void:
	if multiplayer.is_server(): aim_point = p

# anyone -> server: I fired from here, this way. The server decides the hit.
@rpc("any_peer", "call_local", "reliable")
func req_fire(from: Vector3, dir: Vector3) -> void:
	if not is_server(): return
	var hit_point = from + dir * 250.0; var hit_house = -1; var ids = PackedInt32Array()
	var best = 250.0
	for i in houses.size():
		var r: Dictionary = houses[i].ray_brick(from, dir, best)
		if r.has("id") and r.t < best: best = r.t; hit_house = i; hit_point = r.point
	if hit_house < 0 and dir.y < -0.01:   # the ground
		var tg = -from.y / dir.y; if tg < best: hit_point = from + dir * tg
	if hit_house >= 0:
		ids = houses[hit_house].bricks_near(hit_point, 0.75)
		ids.append_array(houses[hit_house].unsupported_after(ids))
	show_fire.rpc(from, hit_point, hit_house, ids)

# server -> everyone: draw the tracer, remove the bricks (the same ids everywhere)
@rpc("authority", "call_local", "reliable")
func show_fire(from: Vector3, to: Vector3, house: int, ids: PackedInt32Array) -> void:
	tracers.append({"a": from, "b": to, "life": 0.08})
	if house >= 0 and ids.size() > 0:
		var pts: Array = houses[house].remove(ids)
		bricks_gone += pts.size()
		for p in pts: _debris(p)

func _debris(p: Dictionary) -> void:
	if debris.size() > 120:
		var old = debris.pop_front(); old.node.queue_free()
	var m = MeshInstance3D.new(); m.mesh = GingerHouse.brick_mesh
	var mat = StandardMaterial3D.new(); mat.albedo_color = p.col; m.material_override = mat
	add_child(m); m.global_transform = Transform3D(p.r, p.p)
	debris.append({"node": m, "v": Vector3(randf_range(-3, 3), randf_range(2, 6), randf_range(-3, 3)), "spin": Vector3(randf(), randf(), randf()) * 6.0, "life": 6.0})

# ---- per frame --------------------------------------------------------------------------------------------------------
func _physics_process(dt: float) -> void:
	t += dt; frames += 1
	var test = args.has("test")
	# input: the driver flies, the gunner aims
	if role != "gunner":
		var steer = Input.get_axis("ui_left", "ui_right"); var climb = Input.get_axis("ui_down", "ui_up")
		if Input.is_key_pressed(KEY_A): steer -= 1.0
		if Input.is_key_pressed(KEY_D): steer += 1.0
		if Input.is_key_pressed(KEY_W): climb += 1.0
		if Input.is_key_pressed(KEY_S): climb -= 1.0
		if test: steer = 0.4; climb = -0.2 if sleigh.lead.y > 22.0 else 0.2   # circles over the town
		sleigh.input = {"steer": clamp(steer, -1, 1), "climb": clamp(climb, -1, 1), "boost": Input.is_key_pressed(KEY_SHIFT)}
	if is_server():
		sleigh.simulate(dt)
		if multiplayer.has_multiplayer_peer() and frames % 2 == 0: sync_sleigh.rpc(sleigh.state(), aim_point)
	# aim + fire (gunner, or solo / host shooting too)
	var online = not multiplayer.has_multiplayer_peer() or multiplayer.multiplayer_peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED
	if online and (role != "driver" or args.has("drivershoots")):
		var vp = get_viewport(); var mp = vp.get_mouse_position()
		if test: mp = vp.get_visible_rect().size * Vector2(0.5 + sin(t * 1.3) * 0.15, 0.62)
		var o = cam.project_ray_origin(mp); var dv = cam.project_ray_normal(mp)
		aim_point = o + dv * (o.y / max(0.05, -dv.y) if dv.y < -0.05 else 200.0)
		if role == "gunner" and frames % 3 == 0: gunner_aim.rpc_id(1, aim_point)
		var firing = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or Input.is_key_pressed(KEY_SPACE) or test
		fire_cd -= dt
		if firing and fire_cd <= 0.0 and muzzle:
			fire_cd = 0.08
			var from = muzzle.global_position; var dir = (aim_point - from).normalized()
			dir = (dir + Vector3(randf_range(-0.02, 0.02), randf_range(-0.02, 0.02), randf_range(-0.02, 0.02))).normalized()
			shots_sent += 1
			if multiplayer.has_multiplayer_peer() and not multiplayer.is_server(): req_fire.rpc_id(1, from, dir)
			else: req_fire(from, dir)

func _process(dt: float) -> void:
	sleigh.draw(dt, t)
	if gun and aim_point != Vector3.ZERO:
		var want = Basis.looking_at(-(aim_point - gun.global_position).normalized(), Vector3.UP)
		gun.global_basis = gun.global_basis.orthonormalized().slerp(want, 1.0 - exp(-12.0 * dt))
	# chase camera
	var yf = Vector3(sin(sleigh.yaw), 0, cos(sleigh.yaw))
	var want_p = sleigh.S - yf * 14.0 + Vector3(0, 7.5, 0)
	if args.has("cam"):
		var c = str(args["cam"]).split(","); want_p = Vector3(float(c[0]), float(c[1]), float(c[2]))
	cam.global_position = cam.global_position.lerp(want_p, 1.0 - exp(-4.0 * dt)) if frames > 2 else want_p
	var look = sleigh.S.lerp(sleigh.lead, 0.4) + Vector3(0, 1, 0)
	if args.has("look"):
		var c2 = str(args["look"]).split(","); look = Vector3(float(c2[0]), float(c2[1]), float(c2[2]))
	cam.look_at(look)
	# tracers + debris
	for tr in tracers: tr.life -= dt
	tracers = tracers.filter(func(x): return x.life > 0.0)
	_draw_tracers()
	for d in debris:
		d.life -= dt; d.v.y -= 18.0 * dt
		var n: Node3D = d.node
		n.global_position += d.v * dt; n.rotate_object_local(Vector3(1, 0.3, 0.2).normalized(), d.spin.x * dt)
		if n.global_position.y < 0.25: n.global_position.y = 0.25; d.v *= Vector3(0.6, -0.25, 0.6); d.spin *= 0.6
	hud.text = "Santa Slays -- Godot spike   role: %s   peers: %d   fps: %d   bricks gone: %d" % [role, peers, Engine.get_frames_per_second(), bricks_gone]
	_test_hooks()

var tracer_mi: MeshInstance3D
func _draw_tracers() -> void:
	if not tracer_mi:
		tracer_mi = MeshInstance3D.new(); tracer_mi.mesh = ImmediateMesh.new()
		var m = StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(3.0, 2.6, 1.2)
		tracer_mi.material_override = m; add_child(tracer_mi)
	var im: ImmediateMesh = tracer_mi.mesh; im.clear_surfaces()
	if tracers.is_empty(): return
	im.surface_begin(Mesh.PRIMITIVE_LINES)
	for tr in tracers: im.surface_add_vertex(tr.a); im.surface_add_vertex(tr.b)
	im.surface_end()

var shot_done = false
func _test_hooks() -> void:
	if args.has("shot") and not shot_done and frames >= int(args.get("shotframe", "120")):
		shot_done = true
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(str(args["shot"]))
		print("[TEST] saved ", args["shot"])
	if args.has("frames") and frames >= int(args["frames"]):
		print("[TEST] role=", role, " shots_sent=", shots_sent, " peers=", peers, " bricks_gone=", bricks_gone, " lead=", sleigh.lead.snapped(Vector3.ONE * 0.1), " S=", sleigh.S.snapped(Vector3.ONE * 0.1))
		get_tree().quit()
