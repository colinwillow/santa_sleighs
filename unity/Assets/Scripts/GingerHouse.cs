// GRID GINGERBREAD HOUSE: every brick has an integer id; destruction = "these ids are gone" (the host decides, every peer
// applies the same list -- multiplayer-ready). Rounded cookie bricks in running bond, drawn with GPU instancing (one call per
// 1023 bricks), so a house is a couple of draw calls and removing a brick is a list edit, never a mesh rebuild.
using System.Collections.Generic;
using UnityEngine;

public class GingerHouse : MonoBehaviour
{
    public const float CourseH = 0.45f;
    public static readonly Vector3 Brick = new Vector3(1.0f, 0.45f, 0.5f);

    public struct B { public Vector3 p; public Quaternion r; public Color col; public int row; public bool roof; public bool alive; public bool iced; }
    public readonly List<B> bricks = new List<B>();
    public int w = 9, d = 7, h = 6, seed = 1;
    public Bounds bounds;
    public int alive;

    static Mesh brickMesh, iceMesh;
    static Material brickMat, iceMat;
    readonly List<Matrix4x4> mats = new List<Matrix4x4>();
    readonly List<Vector4> cols = new List<Vector4>();
    readonly List<Matrix4x4> iceMats = new List<Matrix4x4>();
    MaterialPropertyBlock mpb;
    bool dirty = true;

    public static Mesh RoundedBox(Vector3 size, float r, int seg)
    {
        // a subdivided cube whose vertices are pulled onto a rounded box: soft cookie edges, never a hard 90
        var verts = new List<Vector3>(); var norms = new List<Vector3>(); var tris = new List<int>();
        Vector3 half = size * 0.5f, inner = new Vector3(Mathf.Max(0, half.x - r), Mathf.Max(0, half.y - r), Mathf.Max(0, half.z - r));
        Vector3[] faceN = { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
        foreach (var n in faceN)
        {
            Vector3 u = Mathf.Abs(n.y) > 0.5f ? Vector3.right : Vector3.up;
            Vector3 v = Vector3.Cross(n, u);
            int start = verts.Count;
            for (int i = 0; i <= seg; i++)
                for (int j = 0; j <= seg; j++)
                {
                    float a = (i / (float)seg) * 2 - 1, b = (j / (float)seg) * 2 - 1;
                    Vector3 p = Vector3.Scale(n + u * a + v * b, half);
                    Vector3 c = new Vector3(Mathf.Clamp(p.x, -inner.x, inner.x), Mathf.Clamp(p.y, -inner.y, inner.y), Mathf.Clamp(p.z, -inner.z, inner.z));
                    Vector3 dir = p - c;
                    Vector3 nn = dir.sqrMagnitude > 1e-8f ? dir.normalized : n;
                    verts.Add(c + nn * r); norms.Add(nn);
                }
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < seg; j++)
                {
                    int a0 = start + i * (seg + 1) + j, a1 = a0 + 1, b0 = a0 + seg + 1, b1 = b0 + 1;
                    tris.Add(a0); tris.Add(a1); tris.Add(b0); tris.Add(a1); tris.Add(b1); tris.Add(b0);
                }
        }
        var m = new Mesh(); m.SetVertices(verts); m.SetNormals(norms); m.SetTriangles(tris, 0);
        // make sure faces wind outward
        var t = m.triangles; var vs = m.vertices;
        for (int k = 0; k < t.Length; k += 3)
        {
            Vector3 fn = Vector3.Cross(vs[t[k + 1]] - vs[t[k]], vs[t[k + 2]] - vs[t[k]]);
            Vector3 c = (vs[t[k]] + vs[t[k + 1]] + vs[t[k + 2]]) / 3f;
            if (Vector3.Dot(fn, c) < 0) { int tmp = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = tmp; }
        }
        m.triangles = t; m.RecalculateBounds();
        return m;
    }

    static void Shared()
    {
        if (brickMesh) return;
        brickMesh = RoundedBox(Brick * 0.98f, 0.09f, 4);
        iceMesh = RoundedBox(new Vector3(1.06f, 0.16f, 0.6f), 0.07f, 3);
        brickMat = new Material(Resources.Load<Material>("Bricks")) { enableInstancing = true };
        brickMat.SetFloat("_Glossiness", 0.2f);
        iceMat = new Material(Resources.Load<Material>("Bricks")) { enableInstancing = true, color = new Color(1f, 0.97f, 0.93f) };
        iceMat.SetFloat("_Glossiness", 0.7f);
    }

    public void Build()
    {
        Shared();
        var rng = new System.Random(seed);
        float W = w * 0.5f, D = d * 0.5f;
        // walls: running bond on four sides, a door + side windows left open
        for (int row = 0; row < h; row++)
        {
            float y = row * CourseH + CourseH * 0.5f, off = row % 2 == 1 ? 0.5f : 0f;
            for (int side = 0; side < 4; side++)
            {
                float along = side < 2 ? W : D;
                int n = Mathf.FloorToInt(along / Brick.x) + 1;
                for (int k = 0; k < n; k++)
                {
                    float u = (k + off) * Brick.x - along * 0.5f + Brick.x * 0.5f;
                    if (u - Brick.x * 0.5f < -along * 0.5f - 0.01f || u + Brick.x * 0.5f > along * 0.5f + 0.01f) continue;
                    if (side == 0 && row < 4 && Mathf.Abs(u - 0.25f) < 0.7f) continue;            // the door
                    if (side >= 1 && (row == 2 || row == 3) && Mathf.Abs(u) < 0.6f) continue;    // windows
                    Vector3 p; Quaternion q = Quaternion.identity;
                    if (side == 0) p = new Vector3(u, y, D * 0.5f - Brick.z * 0.5f);
                    else if (side == 1) p = new Vector3(u, y, -D * 0.5f + Brick.z * 0.5f);
                    else { p = new Vector3((side == 2 ? 1 : -1) * (W * 0.5f - Brick.z * 0.5f), y, u); q = Quaternion.Euler(0, 90, 0); }
                    Add(p, q, row, false, row == h - 1, rng);
                }
            }
        }
        // gable ends: courses shrinking to the peak
        float top = h * CourseH;
        int gableRows = Mathf.FloorToInt(W * 0.5f / Brick.x * 1.6f);
        for (int gr = 0; gr < gableRows; gr++)
        {
            float y = top + gr * CourseH + CourseH * 0.5f;
            float halfW = W * 0.5f * (1f - (gr + 1f) / (gableRows + 1f));
            int n = Mathf.FloorToInt(halfW * 2f / Brick.x);
            for (int k = 0; k < n; k++)
            {
                float u = (k + 0.5f) * Brick.x - n * Brick.x * 0.5f;
                Add(new Vector3(u, y, D * 0.5f - Brick.z * 0.5f), Quaternion.identity, h + gr, false, false, rng);
                Add(new Vector3(u, y, -D * 0.5f + Brick.z * 0.5f), Quaternion.identity, h + gr, false, false, rng);
            }
        }
        // roof: two slopes of tilted cookie shingles, iced at ridge + eaves
        float peak = top + gableRows * CourseH + 0.35f, run = W * 0.5f + 0.45f;
        float rise = peak - top + 0.25f, slope = Mathf.Sqrt(run * run + rise * rise), pitch = Mathf.Atan2(rise, run) * Mathf.Rad2Deg;
        int rows = Mathf.FloorToInt(slope / 0.5f), cols = Mathf.FloorToInt((D + 0.8f) / Brick.x) + 1;
        foreach (float sgn in new[] { 1f, -1f })
        {
            Quaternion q = Quaternion.Euler(0, 0, sgn * pitch) * Quaternion.Euler(0, 90, 0);
            for (int rr = 0; rr < rows; rr++)
            {
                float t = (rr + 0.5f) / rows, x = sgn * run * (1f - t), y = top - 0.25f + rise * t + 0.2f, off = rr % 2 == 1 ? 0.5f : 0f;
                for (int c = 0; c < cols; c++)
                {
                    float z = (c + off) * Brick.x - cols * Brick.x * 0.5f;
                    if (Mathf.Abs(z) > (D + 0.8f) * 0.5f) continue;
                    Add(new Vector3(x, y, z), q, 100 + rr, true, rr == rows - 1 || rr == 0, rng);
                }
            }
        }
        alive = bricks.Count;
        bounds = new Bounds(transform.position + Vector3.up * peak * 0.5f, new Vector3(W + 2f, peak + 1f, D + 2f) * 1.2f);
        Decorate(W, D, peak);
    }

    void Add(Vector3 p, Quaternion r, int row, bool roof, bool iced, System.Random rng)
    {
        float j = (float)(rng.NextDouble() - 0.5) * 0.12f;
        Color c = roof ? new Color(0.54f + j, 0.29f + j * 0.8f, 0.13f + j * 0.5f) : new Color(0.71f + j, 0.41f + j * 0.8f, 0.18f + j * 0.5f);
        bricks.Add(new B { p = p, r = r, col = c, row = row, roof = roof, alive = true, iced = iced });
    }

    void Decorate(float W, float D, float peak)
    {
        var glow = new Material(Resources.Load<Material>("Glow")) { color = new Color(1f, 0.78f, 0.45f) };
        foreach (float s in new[] { -1f, 1f })
        {
            var win = GameObject.CreatePrimitive(PrimitiveType.Quad); Destroy(win.GetComponent<Collider>());
            win.transform.SetParent(transform, false); win.transform.localPosition = new Vector3(s * (W * 0.5f - 0.2f), 2.5f * CourseH + 0.22f, 0);
            win.transform.localRotation = Quaternion.Euler(0, s * -90f, 0); win.transform.localScale = new Vector3(1f, 0.8f, 1);
            win.GetComponent<Renderer>().sharedMaterial = glow;
        }
        var door = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(door.GetComponent<Collider>());
        door.transform.SetParent(transform, false); door.transform.localPosition = new Vector3(0.25f, 0.85f, D * 0.5f - 0.3f);
        door.transform.localScale = new Vector3(1f, 1.7f, 0.12f);
        door.GetComponent<Renderer>().sharedMaterial = new Material(Resources.Load<Material>("Lit")) { color = new Color(0.76f, 0.18f, 0.16f) };
        var l = new GameObject("glow").AddComponent<Light>(); l.type = LightType.Point; l.color = new Color(1f, 0.69f, 0.38f);
        l.range = 5f; l.intensity = 2f; l.transform.SetParent(transform, false); l.transform.localPosition = new Vector3(0, 1.4f, 0);
        var candy = new Material(Resources.Load<Material>("Lit")) { color = new Color(0.89f, 0.16f, 0.23f) };
        var pep = GameObject.CreatePrimitive(PrimitiveType.Cylinder); Destroy(pep.GetComponent<Collider>());
        pep.transform.SetParent(transform, false); pep.transform.localPosition = new Vector3(0, peak - 0.15f, D * 0.5f + 0.1f);
        pep.transform.localRotation = Quaternion.Euler(90, 0, 0); pep.transform.localScale = new Vector3(0.84f, 0.08f, 0.84f);
        pep.GetComponent<Renderer>().sharedMaterial = candy;
    }

    void Rebuild()
    {
        mats.Clear(); cols.Clear(); iceMats.Clear();
        var m = transform.localToWorldMatrix;
        foreach (var b in bricks)
        {
            if (!b.alive) continue;
            mats.Add(m * Matrix4x4.TRS(b.p, b.r, Vector3.one)); cols.Add(b.col);
            if (b.iced) iceMats.Add(m * Matrix4x4.TRS(b.p + b.r * new Vector3(0, Brick.y * 0.55f, 0), b.r, Vector3.one));
        }
        dirty = false;
    }

    void Update()
    {
        if (dirty) Rebuild();
        if (mpb == null) mpb = new MaterialPropertyBlock();
        for (int s = 0; s < mats.Count; s += 1023)
        {
            int n = Mathf.Min(1023, mats.Count - s);
            mpb.Clear(); mpb.SetVectorArray("_Color", cols.GetRange(s, n));
            Graphics.DrawMeshInstanced(brickMesh, 0, brickMat, mats.GetRange(s, n), mpb);
        }
        for (int s = 0; s < iceMats.Count; s += 1023)
        {
            int n = Mathf.Min(1023, iceMats.Count - s); var ic = new List<Vector4>(); for (int k = 0; k < n; k++) ic.Add(new Vector4(1f, 0.97f, 0.93f, 1f));
            mpb.Clear(); mpb.SetVectorArray("_Color", ic);
            Graphics.DrawMeshInstanced(iceMesh, 0, iceMat, iceMats.GetRange(s, n), mpb);
        }
    }

    // ---- hits (server side) -------------------------------------------------------------------------------------------
    public bool Ray(Vector3 from, Vector3 dir, float maxD, out int id, out float dist)
    {
        id = -1; dist = maxD;
        if (!bounds.IntersectRay(new Ray(from, dir))) return false;
        var inv = transform.worldToLocalMatrix;
        Vector3 o = inv.MultiplyPoint3x4(from), dv = inv.MultiplyVector(dir).normalized;
        Vector3 half = Brick * 0.5f;
        for (int i = 0; i < bricks.Count; i++)
        {
            var b = bricks[i]; if (!b.alive) continue;
            var ri = Quaternion.Inverse(b.r);
            Vector3 bo = ri * (o - b.p), bd = ri * dv;
            float tmin = 0, tmax = dist; bool ok = true;
            for (int ax = 0; ax < 3 && ok; ax++)
            {
                if (Mathf.Abs(bd[ax]) < 1e-6f) { if (Mathf.Abs(bo[ax]) > half[ax]) ok = false; }
                else
                {
                    float t1 = (-half[ax] - bo[ax]) / bd[ax], t2 = (half[ax] - bo[ax]) / bd[ax];
                    tmin = Mathf.Max(tmin, Mathf.Min(t1, t2)); tmax = Mathf.Min(tmax, Mathf.Max(t1, t2));
                    if (tmin > tmax) ok = false;
                }
            }
            if (ok && tmin < dist) { dist = tmin; id = i; }
        }
        return id >= 0;
    }

    public List<int> Near(Vector3 worldP, float radius)
    {
        var lp = transform.InverseTransformPoint(worldP); var o = new List<int>();
        for (int i = 0; i < bricks.Count; i++) if (bricks[i].alive && (bricks[i].p - lp).sqrMagnitude < radius * radius) o.Add(i);
        return o;
    }

    /// everything left with no wall brick under it falls too (simple column support)
    public List<int> Unsupported(List<int> gone)
    {
        var g = new HashSet<int>(gone); var o = new List<int>(); bool changed = true;
        while (changed)
        {
            changed = false;
            for (int i = 0; i < bricks.Count; i++)
            {
                var b = bricks[i];
                if (!b.alive || g.Contains(i) || b.row == 0 || b.roof) continue;
                bool held = false;
                for (int j = 0; j < bricks.Count && !held; j++)
                {
                    var c = bricks[j];
                    if (c.alive && !g.Contains(j) && !c.roof && c.row == b.row - 1 && (c.p - (b.p - Vector3.up * CourseH)).magnitude < Brick.x * 0.8f) held = true;
                }
                if (!held) { g.Add(i); o.Add(i); changed = true; }
            }
        }
        return o;
    }

    /// apply a removal list (identical on every peer); returns world transforms + colours for debris
    public List<(Vector3, Quaternion, Color)> Remove(List<int> ids)
    {
        var o = new List<(Vector3, Quaternion, Color)>();
        foreach (int i in ids)
        {
            if (i < 0 || i >= bricks.Count || !bricks[i].alive) continue;
            var b = bricks[i]; b.alive = false; bricks[i] = b; alive--;
            o.Add((transform.TransformPoint(b.p), transform.rotation * b.r, b.col));
        }
        dirty = true;
        return o;
    }

    public static Mesh BrickMesh { get { Shared(); return brickMesh; } }
}
