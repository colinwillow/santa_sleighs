// SANTA SLAYS (Unity) -- code-first: the scene is empty and this builds the game at startup. First slice: dusk town of grid
// gingerbread houses, the rope-hung sleigh (port of the web flight), TWIN STICKS (left half of the screen flies, right half
// aims + fires), hitscan Gatling that knocks bricks out (host-decides shape, ready for networking), debris, chase camera.
using System.Collections.Generic;
using UnityEngine;

public class Game : MonoBehaviour
{
    public const int Build = 3;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot() { new GameObject("Game").AddComponent<Game>(); }

    Sleigh sleigh; Crew crew; Camera cam; readonly List<GingerHouse> houses = new List<GingerHouse>();
    Vector3 aimPoint, camPos; float fireCd; int bricksGone, shots;
    readonly List<(Rigidbody rb, float life)> debris = new List<(Rigidbody, float)>();
    readonly List<(LineRenderer lr, float life)> tracers = new List<(LineRenderer, float)>();
    Material debrisMat, tracerMat;

    // twin sticks
    class Pad { public int id = -1; public Vector2 origin, v; }
    readonly Pad L = new Pad(), R = new Pad();
    const float PadR = 70f;
    float fps, fpsT; int fpsN;

    void Start()
    {
        Application.targetFrameRate = 60;
        // dusk sky + fog + light
        cam = new GameObject("Camera").AddComponent<Camera>(); cam.tag = "MainCamera";
        cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.36f, 0.33f, 0.55f); cam.fieldOfView = 62; cam.farClipPlane = 1200;
        RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared; RenderSettings.fogDensity = 0.004f; RenderSettings.fogColor = new Color(0.54f, 0.52f, 0.72f);
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.55f, 0.6f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.6f, 0.5f, 0.65f); RenderSettings.ambientGroundColor = new Color(0.4f, 0.35f, 0.45f);
        var sun = new GameObject("Moon").AddComponent<Light>(); sun.type = LightType.Directional; sun.color = new Color(0.79f, 0.84f, 1f); sun.intensity = 1.1f;
        sun.shadows = LightShadows.Soft; sun.transform.rotation = Quaternion.Euler(50, -40, 0);
        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane); ground.transform.localScale = new Vector3(70, 1, 70);
        ground.GetComponent<Renderer>().sharedMaterial = new Material(Resources.Load<Material>("Lit")) { color = new Color(0.91f, 0.93f, 1f) };
        // the town: a grid with streets, seeded so every player builds the identical town
        int idx = 0;
        for (int gx = -3; gx <= 3; gx++)
            for (int gz = -3; gz <= 3; gz++)
            {
                if ((gx + gz) % 2 != 0 && Mathf.Abs(gx) + Mathf.Abs(gz) > 1) continue;
                var go = new GameObject("House" + idx); go.transform.position = new Vector3(gx * 16f, 0, gz * 16f); go.transform.rotation = Quaternion.Euler(0, (idx % 4) * 90f, 0);
                var h = go.AddComponent<GingerHouse>(); h.w = 7 + (idx % 3) * 2; h.d = 6 + ((idx / 3) % 2) * 2; h.h = 5 + idx % 2; h.seed = 100 + idx;
                h.Build(); houses.Add(h); idx++;
            }
        sleigh = new GameObject("Sleigh").AddComponent<Sleigh>(); sleigh.Build();
        crew = new GameObject("Crew").AddComponent<Crew>(); crew.sleighBody = sleigh.body; crew.Build();
        debrisMat = new Material(Resources.Load<Material>("Lit")) { color = new Color(0.71f, 0.41f, 0.18f) };
        tracerMat = new Material(Resources.Load<Material>("Glow")) { color = new Color(1f, 0.9f, 0.5f) };
        camPos = sleigh.S - Vector3.forward * 14f + Vector3.up * 7.5f;
    }

    // ---- input: twin sticks (touch) + keyboard / mouse ---------------------------------------------------------------
    void ReadInput(out float steer, out float climb, out Vector2 aim, out bool fire, out bool mouseAim)
    {
        steer = 0; climb = 0; aim = Vector2.zero; fire = false; mouseAim = false;
        for (int i = 0; i < Input.touchCount; i++)
        {
            var tch = Input.GetTouch(i);
            Pad p = tch.fingerId == L.id ? L : tch.fingerId == R.id ? R : null;
            if (tch.phase == TouchPhase.Began && p == null) { p = tch.position.x < Screen.width * 0.5f ? L : R; if (p.id >= 0) p = null; else { p.id = tch.fingerId; p.origin = tch.position; } }
            if (p == null) continue;
            p.v = Vector2.ClampMagnitude((tch.position - p.origin) / PadR, 1f);
            if (tch.phase == TouchPhase.Ended || tch.phase == TouchPhase.Canceled) { p.id = -1; p.v = Vector2.zero; }
        }
        steer = L.v.x; climb = L.v.y; aim = R.v; fire = R.v.magnitude > 0.28f;
        if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) steer -= 1;
        if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) steer += 1;
        if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) climb += 1;
        if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) climb -= 1;
        if (Input.touchCount == 0 && (Input.GetMouseButton(0) || Input.GetKey(KeyCode.Space))) { fire = true; mouseAim = Input.GetMouseButton(0); }
        steer = Mathf.Clamp(steer, -1, 1); climb = Mathf.Clamp(climb, -1, 1);
    }

    void Update()
    {
        float dt = Mathf.Min(Time.deltaTime, 0.05f);
        ReadInput(out float steer, out float climb, out Vector2 aim, out bool fire, out bool mouseAim);
        sleigh.inSteer = steer; sleigh.inClimb = climb; sleigh.inBoost = Input.GetKey(KeyCode.LeftShift);
        sleigh.Simulate(dt); sleigh.Draw(dt);

        // chase camera
        Vector3 yf = new Vector3(Mathf.Sin(sleigh.yaw), 0, Mathf.Cos(sleigh.yaw));
        Vector3 want = sleigh.S - yf * 10.5f + Vector3.up * (5.2f - sleigh.pitch * 5f);
        camPos = Vector3.Lerp(camPos, want, 1 - Mathf.Exp(-4f * dt));
        cam.transform.position = camPos;
        cam.transform.LookAt(Vector3.Lerp(sleigh.S, sleigh.lead, 0.4f) + Vector3.up);

        // aim: a reticle around a rest point ahead of the sleigh; the gun shoots at what's under it
        Vector3 rest = sleigh.lead + sleigh.Fwd * 30f + Vector3.down * 8f;
        Vector2 rp = cam.WorldToScreenPoint(rest);
        Vector2 sp = mouseAim ? (Vector2)Input.mousePosition : rp + aim * Mathf.Min(Screen.width, Screen.height) * 0.42f;
        var ray = cam.ScreenPointToRay(sp);
        aimPoint = ray.direction.y < -0.02f ? ray.origin + ray.direction * (ray.origin.y / -ray.direction.y) : ray.origin + ray.direction * 200f;
        reticle = sp;
        crew.aimPoint = aimPoint; crew.firing = fire;

        fireCd -= dt;
        if (fire && fireCd <= 0)
        {
            fireCd = 0.07f; shots++;
            Vector3 from = crew.muzzle ? crew.muzzle.position : sleigh.body.TransformPoint(new Vector3(-0.4f, 2.4f, 1.8f));
            crew.Kick();
            Vector3 dir = (aimPoint - from).normalized + Random.insideUnitSphere * 0.02f;
            Fire(from, dir.normalized);
        }
        for (int i = tracers.Count - 1; i >= 0; i--) { var tr = tracers[i]; tr.life -= dt; tracers[i] = tr; if (tr.life <= 0) { Destroy(tr.lr.gameObject); tracers.RemoveAt(i); } }
        for (int i = debris.Count - 1; i >= 0; i--) { var d = debris[i]; d.life -= dt; debris[i] = d; if (d.life <= 0) { Destroy(d.rb.gameObject); debris.RemoveAt(i); } }

        fpsN++; fpsT += Time.unscaledDeltaTime; if (fpsT > 0.5f) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
    }

    /// the host-decides hit: nearest brick along the ray, knock out a small ball of bricks + whatever they held up
    void Fire(Vector3 from, Vector3 dir)
    {
        float best = 250f; int hitHouse = -1; int hitId = -1;
        for (int i = 0; i < houses.Count; i++)
            if (houses[i].Ray(from, dir, best, out int id, out float d) && d < best) { best = d; hitHouse = i; hitId = id; }
        Vector3 hit = from + dir * best;
        if (hitHouse < 0 && dir.y < -0.01f) { float tg = -from.y / dir.y; if (tg < best) hit = from + dir * tg; }
        var lr = new GameObject("tracer").AddComponent<LineRenderer>(); lr.sharedMaterial = tracerMat; lr.widthMultiplier = 0.08f; lr.positionCount = 2;
        lr.SetPosition(0, from); lr.SetPosition(1, hit); tracers.Add((lr, 0.06f));
        if (hitHouse < 0) return;
        var h = houses[hitHouse];
        var ids = h.Near(hit, 0.75f); ids.AddRange(h.Unsupported(ids));
        foreach (var (p, r, col) in h.Remove(ids)) Debris(p, r, col, dir);
        bricksGone += ids.Count;
    }

    void Debris(Vector3 p, Quaternion r, Color col, Vector3 dir)
    {
        if (debris.Count > 80) { Destroy(debris[0].rb.gameObject); debris.RemoveAt(0); }
        var g = new GameObject("crumb"); g.transform.SetPositionAndRotation(p, r);
        g.AddComponent<MeshFilter>().sharedMesh = GingerHouse.BrickMesh;
        g.AddComponent<MeshRenderer>().sharedMaterial = debrisMat;
        g.AddComponent<BoxCollider>().size = GingerHouse.Brick;
        var rb = g.AddComponent<Rigidbody>(); rb.mass = 0.3f;
        rb.linearVelocity = dir * 6f + Random.insideUnitSphere * 3f + Vector3.up * 3f; rb.angularVelocity = Random.insideUnitSphere * 6f;
        debris.Add((rb, 6f));
    }

    // ---- HUD (IMGUI for the first slice) ---------------------------------------------------------------------------------
    Vector2 reticle;
    void OnGUI()
    {
        var st = new GUIStyle(GUI.skin.label) { fontSize = Mathf.Max(14, Screen.height / 40) }; st.normal.textColor = Color.white;
        GUI.Label(new Rect(12, 8, 900, 60), $"SANTA SLAYS (Unity) b{Build}   fps {fps:0}   bricks gone {bricksGone}", st);
        float r = 16; var rc = new Rect(reticle.x - r, Screen.height - reticle.y - r, r * 2, r * 2);
        var rs = new GUIStyle(st) { alignment = TextAnchor.MiddleCenter, fontSize = (int)(r * 2) }; rs.normal.textColor = new Color(1f, 0.3f, 0.3f);
        GUI.Label(rc, "+", rs);
        foreach (var p in new[] { L, R })
        {
            if (p.id < 0) continue;
            var c = new Rect(p.origin.x - PadR, Screen.height - p.origin.y - PadR, PadR * 2, PadR * 2);
            GUI.Box(c, GUIContent.none);
            var k = p.origin + p.v * PadR; GUI.Box(new Rect(k.x - 22, Screen.height - k.y - 22, 44, 44), GUIContent.none);
        }
    }
}
