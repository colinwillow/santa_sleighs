// THE SLEIGH -- a port of the web game's flight (src/sleigh.js FLY): fly a lead point (yaw / pitch / speed), four reindeer
// spring after their slots, and the sleigh hangs off the rear pair on a slack rope (gravity + drag + a distance constraint), so it
// swings out on turns. Nobody driving = it holds its heading and flies straight on. Simulate() runs only on the host later;
// clients will receive State and draw.
using UnityEngine;

public class Sleigh : MonoBehaviour
{
    public float speed0 = 24f, boostSpeed = 40f, accel = 1.6f, turn = 1.25f, climb = 0.75f, maxBank = 0.7f;
    public float minAlt = 3f, ceiling = 120f, ropeLen = 8.5f, grav = 4.5f, drag = 0.014f, deerK = 28f, deerC = 9f;

    public Vector3 lead = new Vector3(0, 30, -90), S = new Vector3(0, 30, -104), SV = new Vector3(0, 0, 24);
    public float yaw, pitch, bank, speed = 24f;
    public float inSteer, inClimb; public bool inBoost;
    public Transform body;
    readonly Vector3[] slots = { new Vector3(-1.5f, 0, 0), new Vector3(1.5f, 0, 0), new Vector3(-1.5f, 0, -4.4f), new Vector3(1.5f, 0, -4.4f) };
    readonly Vector3[] dp = new Vector3[4], dv = new Vector3[4];
    readonly Transform[] deer = new Transform[4];
    LineRenderer[] reins = new LineRenderer[2];
    float t;

    static Material Mat(Color c, float gloss = 0.2f) { var m = new Material(Resources.Load<Material>("Lit")) { color = c }; m.SetFloat("_Glossiness", gloss); return m; }
    static GameObject Prim(PrimitiveType p, Transform parent, Vector3 pos, Vector3 scale, Material m)
    {
        var g = GameObject.CreatePrimitive(p); Destroy(g.GetComponent<Collider>());
        g.transform.SetParent(parent, false); g.transform.localPosition = pos; g.transform.localScale = scale; g.GetComponent<Renderer>().sharedMaterial = m; return g;
    }

    public void Build()
    {
        var red = Mat(new Color(0.83f, 0.16f, 0.16f), 0.4f); var gold = Mat(new Color(0.91f, 0.72f, 0.29f), 0.7f);
        body = new GameObject("SleighBody").transform; body.SetParent(transform, false);
        var hull = new GameObject("hull"); hull.transform.SetParent(body, false); hull.transform.localPosition = new Vector3(0, 0.95f, 0);
        hull.AddComponent<MeshFilter>().sharedMesh = GingerHouse.RoundedBox(new Vector3(2.2f, 1.1f, 4.4f), 0.35f, 4);
        hull.AddComponent<MeshRenderer>().sharedMaterial = red;
        Prim(PrimitiveType.Cube, body, new Vector3(0, 1.9f, -1.9f), new Vector3(2.2f, 1f, 0.5f), red);
        foreach (float sx in new[] { -0.95f, 0.95f }) Prim(PrimitiveType.Cube, body, new Vector3(sx, 0.08f, 0.2f), new Vector3(0.14f, 0.14f, 5f), gold);
        Prim(PrimitiveType.Sphere, body, new Vector3(0, 1.9f, -1.2f), new Vector3(1.8f, 1.6f, 1.6f), Mat(new Color(0.25f, 0.48f, 0.29f)));
        var fur = Mat(new Color(0.54f, 0.35f, 0.23f)); var nose = Mat(new Color(1f, 0.16f, 0.16f));
        for (int i = 0; i < 4; i++)
        {
            var g = new GameObject("deer" + i).transform; g.SetParent(transform, false); deer[i] = g;
            Prim(PrimitiveType.Sphere, g, new Vector3(0, 1.8f, 0.4f), new Vector3(2f, 1.8f, 2.6f), fur);
            Prim(PrimitiveType.Sphere, g, new Vector3(0, 2.7f, 1.5f), Vector3.one * 0.84f, fur);
            Prim(PrimitiveType.Sphere, g, new Vector3(0, 2.62f, 1.95f), Vector3.one * (i == 0 ? 0.24f : 0.16f), i == 0 ? nose : Mat(Color.black));
            foreach (var lp in new[] { new Vector3(-0.45f, 0.8f, 0.9f), new Vector3(0.45f, 0.8f, 0.9f), new Vector3(-0.4f, 0.8f, -0.3f), new Vector3(0.4f, 0.8f, -0.3f) })
                Prim(PrimitiveType.Capsule, g, lp, new Vector3(0.28f, 0.6f, 0.28f), fur).name = "leg";
            dp[i] = lead + slots[i]; dv[i] = new Vector3(0, 0, speed);
        }
        var ropeMat = new Material(Resources.Load<Material>("Unlit")) { color = new Color(0.48f, 0.29f, 0.16f) };
        for (int k = 0; k < 2; k++)
        {
            reins[k] = new GameObject("rein" + k).AddComponent<LineRenderer>(); reins[k].transform.SetParent(transform, false);
            reins[k].positionCount = 11; reins[k].widthMultiplier = 0.06f; reins[k].sharedMaterial = ropeMat; reins[k].useWorldSpace = true;
        }
    }

    Quaternion LeadRot() => Quaternion.Euler(-pitch * Mathf.Rad2Deg, yaw * Mathf.Rad2Deg, -bank * Mathf.Rad2Deg);
    public Vector3 Fwd => new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));

    public void Simulate(float dt)
    {
        speed += ((inBoost ? boostSpeed : speed0) - speed) * (1 - Mathf.Exp(-accel * dt));
        yaw += inSteer * turn * dt;        // Unity is left-handed: + yaw turns right
        pitch += (inClimb * climb - pitch) * (1 - Mathf.Exp(-3f * dt));
        bank += (inSteer * maxBank - bank) * (1 - Mathf.Exp(-4f * dt));
        Vector3 f = Fwd;
        lead += f * speed * dt;
        if (lead.y < minAlt + 1.5f) { lead.y = minAlt + 1.5f; pitch = Mathf.Max(pitch, 0.1f); }
        if (lead.y > ceiling) { lead.y = ceiling; pitch = Mathf.Min(pitch, 0f); }
        float rim = new Vector2(lead.x, lead.z).magnitude;
        if (rim > 260f) { float want = Mathf.Atan2(-lead.x, -lead.z); yaw += Mathf.DeltaAngle(yaw * Mathf.Rad2Deg, want * Mathf.Rad2Deg) * Mathf.Deg2Rad * Mathf.Min(1f, (rim - 260f) / 40f) * dt * 2f; }
        var lr = LeadRot();
        for (int i = 0; i < 4; i++)
        {
            Vector3 target = lead + lr * slots[i];
            Vector3 a = (target - dp[i]) * deerK - (dv[i] - f * speed) * deerC;
            dv[i] += a * dt; dp[i] += dv[i] * dt;
        }
        Vector3 harness = (dp[2] + dp[3]) * 0.5f - (lr * Vector3.forward) * 1.3f + Vector3.up * 1.8f;
        float sp = SV.magnitude;
        SV.y -= grav * dt; SV -= SV * drag * sp * dt; S += SV * dt;
        Vector3 to = S - harness; float dist = to.magnitude;
        if (dist > ropeLen) { to /= dist; S = harness + to * ropeLen; float o = Vector3.Dot(SV, to) - Vector3.Dot(dv[2], to); if (o > 0) SV -= to * o * 1.02f; }
        if (S.y < 0.15f) { S.y = 0.15f; if (SV.y < 0) SV.y *= -0.25f; }
    }

    public void Draw(float dt)
    {
        t += dt;
        var lr = LeadRot();
        for (int i = 0; i < 4; i++)
        {
            deer[i].position = dp[i];
            deer[i].rotation = Quaternion.Slerp(deer[i].rotation, lr, 1 - Mathf.Exp(-10f * dt));
            float ph = t * (6f + speed * 0.18f) + i * 2.2f;
            foreach (Transform c in deer[i]) if (c.name == "leg") c.localRotation = Quaternion.Euler(Mathf.Sin(ph + (c.localPosition.z > 0 ? 0 : Mathf.PI)) * 40f, 0, 0);
        }
        Vector3 harness = (dp[2] + dp[3]) * 0.5f - (lr * Vector3.forward) * 1.3f + Vector3.up * 1.8f;
        body.position = S;
        Vector3 fw = harness - S;
        if (fw.sqrMagnitude > 0.25f) body.rotation = Quaternion.Slerp(body.rotation, Quaternion.LookRotation(fw.normalized, Vector3.up), 1 - Mathf.Exp(-12f * dt));
        for (int k = 0; k < 2; k++)
        {
            Vector3 a = dp[2 + k] + new Vector3(0, 1.8f, 0) - deer[2 + k].forward * 0.8f, b = body.TransformPoint(new Vector3(-0.6f + 1.2f * k, 1.4f, 2.4f));
            for (int j = 0; j <= 10; j++) { float u = j / 10f; Vector3 p = Vector3.Lerp(a, b, u); p.y -= Mathf.Sin(u * Mathf.PI) * 0.6f; reins[k].SetPosition(j, p); }
        }
    }
}
