// CLOUD BUILD ENTRY (GameCI: buildMethod SantaBuild.BuildScript.BuildWebGL). The project is CODE-FIRST: there is no hand-made
// scene. This method writes the one scene (an empty scene -- Boot.cs builds the whole game at startup), the materials the game
// loads from Resources (so their shaders are not stripped), sets the WebGL player options, and builds to -customBuildPath.
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.Animations;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace SantaBuild
{
    public static class BuildScript
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        [MenuItem("Santa Slays/Prepare Project")]
        public static void Prepare()
        {
            Directory.CreateDirectory("Assets/Scenes");
            Directory.CreateDirectory("Assets/Resources");
            // materials the code loads by name; living in Resources keeps their shaders in the build
            MakeMat("Assets/Resources/Lit.mat", "Standard", true);
            MakeMat("Assets/Resources/Bricks.mat", "Santa/InstancedLit", true);
            MakeMat("Assets/Resources/Unlit.mat", "Unlit/Color", true);
            MakeMat("Assets/Resources/Glow.mat", "Unlit/Color", false);
            // animator controllers (code-first): Santa = tipsy idle <-> firing (bool "firing"), elves = sitting; IK pass on
            Controller("Assets/Resources/SantaCtrl.controller", new[] { ("tipsy", "Drunk_Idle"), ("fire", "Firing_Rifle_2"), ("rifle", "Rifle_Idle_2") }, "firing");
            Controller("Assets/Resources/ElfCtrl.controller", new[] { ("sit", "Sitting_Idle_3"), ("happy", "Happy_Idle") }, null);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        static AnimationClip Clip(string name) =>
            AssetDatabase.LoadAllAssetsAtPath("Assets/Resources/Anims/" + name + ".fbx").OfType<AnimationClip>().FirstOrDefault(c => !c.name.StartsWith("__preview"));

        static void Controller(string path, (string state, string clip)[] states, string firingBool)
        {
            AssetDatabase.DeleteAsset(path);
            var ac = AnimatorController.CreateAnimatorControllerAtPath(path);
            if (firingBool != null) ac.AddParameter(firingBool, AnimatorControllerParameterType.Bool);
            var layers = ac.layers; layers[0].iKPass = true; ac.layers = layers;
            var sm = ac.layers[0].stateMachine;
            AnimatorState first = null;
            foreach (var (state, clip) in states)
            {
                var c = Clip(clip); if (c == null) { Console.WriteLine("[SANTA] missing clip " + clip); continue; }
                var st = sm.AddState(state); st.motion = c; st.iKOnFeet = false;
                if (first == null) { first = st; sm.defaultState = st; }
            }
            if (firingBool != null)
            {
                var idle = sm.states.First(x => x.state.name == "tipsy").state; var fire = sm.states.First(x => x.state.name == "fire").state;
                var t1 = idle.AddTransition(fire); t1.AddCondition(AnimatorConditionMode.If, 0, firingBool); t1.duration = 0.12f; t1.hasExitTime = false;
                var t2 = fire.AddTransition(idle); t2.AddCondition(AnimatorConditionMode.IfNot, 0, firingBool); t2.duration = 0.25f; t2.hasExitTime = false;
            }
            Console.WriteLine("[SANTA] controller " + path + " states " + sm.states.Length);
        }

        static void MakeMat(string path, string shader, bool instancing)
        {
            var sh = Shader.Find(shader);
            if (sh == null) { Console.WriteLine("[SANTA] missing shader " + shader); return; }
            var m = new Material(sh) { enableInstancing = instancing };
            AssetDatabase.CreateAsset(m, path);
        }

        public static void BuildWebGL()
        {
            string outPath = Arg("customBuildPath") ?? "build/WebGL/WebGL";
            Prepare();
            PlayerSettings.productName = "Santa Slays";
            PlayerSettings.companyName = "colinwillow";
            // GitHub Pages can't send Content-Encoding headers: gzip + the JS decompression fallback works everywhere
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            });
            var s = report.summary;
            Console.WriteLine($"[SANTA] build {s.result} size {s.totalSize} errors {s.totalErrors} time {s.totalTime} -> {outPath}");
            EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 101);
        }

        static string Arg(string name)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == "-" + name) return a[i + 1];
            return null;
        }
    }
}
