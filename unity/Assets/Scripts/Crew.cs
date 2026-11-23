// THE CREW on the sleigh: his Tough Santa (Humanoid, Mixamo clips retargeted by Unity) standing at the gun, two elves sitting.
// The Gatling is held at Santa's belly and aimed at the reticle; Unity's own Humanoid IK puts both hands on its grip sockets
// every frame (OnAnimatorIK), so no clip can push an arm through the body or off the gun.
using UnityEngine;

public class Crew : MonoBehaviour
{
    public Transform sleighBody;
    public Vector3 aimPoint;
    public bool firing;
    public Transform muzzle;
    Animator santaAnim; Transform gunPivot, gun, gripR, gripL;
    Quaternion gunFix = Quaternion.identity;
    float recoil;

    public static Transform Find(Transform root, string startsWith)
    {
        foreach (var t in root.GetComponentsInChildren<Transform>(true)) if (t.name.StartsWith(startsWith)) return t;
        return null;
    }

    /// spawn a Humanoid character, scaled to `height` metres, facing the parent's +Z, feet at the local origin
    public static Animator Spawn(string res, string ctrl, Transform parent, Vector3 localPos, float height, float yaw = 0f)
    {
        var prefab = Resources.Load<GameObject>(res);
        if (!prefab) { Debug.LogError("[SANTA] missing " + res); return null; }
        var holder = new GameObject(prefab.name + "_holder").transform; holder.SetParent(parent, false);
        holder.localPosition = localPos; holder.localRotation = Quaternion.Euler(0, yaw, 0);
        var go = Instantiate(prefab, holder, false);
        var anim = go.GetComponent<Animator>() ?? go.AddComponent<Animator>();
        anim.runtimeAnimatorController = Resources.Load<RuntimeAnimatorController>(ctrl);
        anim.applyRootMotion = false; anim.cullingMode = AnimatorCullingMode.AlwaysAnimate;
        foreach (var r in go.GetComponentsInChildren<SkinnedMeshRenderer>()) r.updateWhenOffscreen = true;
        // measure in rest pose (before the animator runs): head top vs toes, then scale + face +Z
        var top = Find(go.transform, "mixamorig_HeadTop_End") ?? anim.GetBoneTransform(HumanBodyBones.Head);
        var toe = Find(go.transform, "mixamorig_LeftToeBase") ?? anim.GetBoneTransform(HumanBodyBones.LeftFoot);
        float h = top && toe ? Mathf.Abs(top.position.y - toe.position.y) : 1f;
        go.transform.localScale *= height / Mathf.Max(0.01f, h);
        var la = anim.GetBoneTransform(HumanBodyBones.LeftUpperArm); var ra = anim.GetBoneTransform(HumanBodyBones.RightUpperArm);
        if (la && ra && holder.InverseTransformPoint(la.position).x > holder.InverseTransformPoint(ra.position).x)
            go.transform.localRotation = Quaternion.Euler(0, 180, 0) * go.transform.localRotation;   // his left must be on -X in Unity (facing +Z)
        var minY = toe ? holder.InverseTransformPoint(toe.position).y : 0f;
        go.transform.localPosition -= new Vector3(0, minY, 0);
        return anim;
    }

    public void Build()
    {
        // a present crate to stand on + a driver's bench
        var lit = Resources.Load<Material>("Lit");
        var crate = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(crate.GetComponent<Collider>());
        crate.transform.SetParent(sleighBody, false); crate.transform.localPosition = new Vector3(0, 0.85f, -0.35f); crate.transform.localScale = new Vector3(1.3f, 0.4f, 1.2f);
        crate.GetComponent<Renderer>().sharedMaterial = new Material(lit) { color = new Color(0.18f, 0.42f, 0.25f) };
        santaAnim = Spawn("Characters/santa_tough_rig", "SantaCtrl", sleighBody, new Vector3(0, 1.05f, -0.35f), 2.0f);
        Spawn("Characters/elf_girl_jiggle", "ElfCtrl", sleighBody, new Vector3(0.1f, 1.45f, 1.1f), 1.8f);
        Spawn("Characters/elf_girl_jiggle", "ElfCtrl", sleighBody, new Vector3(0.25f, 2.1f, -1.5f), 1.8f, 20f);
        if (santaAnim) santaAnim.gameObject.AddComponent<SantaIK>().crew = this;

        // the Gatling, from his gun pack, on a pivot at Santa's belly
        var pack = Resources.Load<GameObject>("Weapons/guns_rigged");
        if (pack && santaAnim)
        {
            var inst = Instantiate(pack);
            gun = Find(inst.transform, "gatling");
            gunPivot = new GameObject("gunPivot").transform; gunPivot.SetParent(santaAnim.transform.parent, false);
            gunPivot.localPosition = new Vector3(-0.15f, 1.0f, 0.35f);
            if (gun)
            {
                gun.SetParent(gunPivot, false); gun.localPosition = Vector3.zero; gun.localRotation = Quaternion.identity; gun.localScale = Vector3.one;
                gripR = Find(gun, "grip_r"); gripL = Find(gun, "grip_l"); muzzle = Find(gun, "muzzle");
                if (gripR && muzzle)
                {
                    // whatever axes the FBX ended up with: rotate so grip_r -> muzzle points along the pivot's +Z, and the
                    // grip sits on the pivot; then size it so the barrel line is Rambo-long
                    Vector3 along = gunPivot.InverseTransformDirection(muzzle.position - gripR.position);
                    gunFix = Quaternion.FromToRotation(along.normalized, Vector3.forward);
                    gun.localRotation = gunFix;
                    float len = (muzzle.position - gripR.position).magnitude;
                    gun.localScale *= 1.4f / Mathf.Max(0.01f, len);
                    gun.localPosition -= gunPivot.InverseTransformPoint(gripR.position);
                }
            }
            Destroy(inst);
        }
    }

    void LateUpdate()
    {
        if (!gunPivot) return;
        if (santaAnim) santaAnim.SetBool("firing", firing);
        Vector3 dir = aimPoint - gunPivot.position;
        if (dir.sqrMagnitude > 1f)
        {
            // aim in the sleigh's frame, clamped to the arc in front of him
            Vector3 l = sleighBody.InverseTransformDirection(dir.normalized);
            float yaw = Mathf.Clamp(Mathf.Atan2(l.x, l.z), -1.5f, 1.5f), pitch = Mathf.Clamp(Mathf.Asin(Mathf.Clamp(l.y, -1, 1)), -1.1f, 0.6f);
            var want = sleighBody.rotation * Quaternion.Euler(-pitch * Mathf.Rad2Deg, yaw * Mathf.Rad2Deg, 0);
            gunPivot.rotation = Quaternion.Slerp(gunPivot.rotation, want, 1 - Mathf.Exp(-12f * Time.deltaTime));
        }
        recoil = Mathf.Lerp(recoil, 0, 1 - Mathf.Exp(-18f * Time.deltaTime));
        if (gun) gun.parent.localPosition = new Vector3(-0.15f, 1.0f, 0.35f) - new Vector3(0, 0, recoil);
    }

    public void Kick() { recoil = 0.08f; }
    public Transform GripR => gripR; public Transform GripL => gripL;
}

/// lives on Santa's Animator object (Unity only calls OnAnimatorIK there): both fists onto the gun's grips
public class SantaIK : MonoBehaviour
{
    public Crew crew;
    Animator a;
    void Awake() { a = GetComponent<Animator>(); }
    void OnAnimatorIK(int layer)
    {
        if (!crew || !crew.GripR) return;
        a.SetIKPositionWeight(AvatarIKGoal.RightHand, 1f); a.SetIKRotationWeight(AvatarIKGoal.RightHand, 0.6f);
        a.SetIKPosition(AvatarIKGoal.RightHand, crew.GripR.position); a.SetIKRotation(AvatarIKGoal.RightHand, crew.GripR.rotation);
        if (crew.GripL)
        {
            a.SetIKPositionWeight(AvatarIKGoal.LeftHand, 1f); a.SetIKRotationWeight(AvatarIKGoal.LeftHand, 0.5f);
            a.SetIKPosition(AvatarIKGoal.LeftHand, crew.GripL.position); a.SetIKRotation(AvatarIKGoal.LeftHand, crew.GripL.rotation);
        }
        // look where he's shooting
        a.SetLookAtWeight(0.6f, 0.2f, 0.7f); a.SetLookAtPosition(crew.aimPoint);
    }
}
