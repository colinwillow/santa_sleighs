// IMPORT RULES (code-first): characters + clips import as HUMANOID so Unity retargets any Mixamo / Auto-Rig Pro clip onto each
// body's own proportions; idle clips loop; guns are plain props. Runs automatically whenever these files import (cloud included).
using UnityEditor;

public class ImportRules : AssetPostprocessor
{
    void OnPreprocessModel()
    {
        var mi = (ModelImporter)assetImporter;
        string p = assetPath.Replace('\\', '/');
        if (p.Contains("/Resources/Characters/") || p.Contains("/Resources/Anims/"))
        {
            mi.animationType = ModelImporterAnimationType.Human;
            mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            mi.importAnimation = p.Contains("/Anims/");
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
        }
        else if (p.Contains("/Resources/Weapons/"))
        {
            mi.animationType = ModelImporterAnimationType.None;
            mi.importAnimation = false;
        }
    }

    void OnPreprocessAnimation()
    {
        var mi = (ModelImporter)assetImporter;
        if (!assetPath.Replace('\\', '/').Contains("/Resources/Anims/")) return;
        var clips = mi.defaultClipAnimations;
        for (int i = 0; i < clips.Length; i++)
        {
            clips[i].loopTime = true; clips[i].loopPose = true;
            clips[i].lockRootRotation = true; clips[i].lockRootHeightY = true; clips[i].lockRootPositionXZ = true;
            clips[i].keepOriginalOrientation = true; clips[i].keepOriginalPositionY = true; clips[i].keepOriginalPositionXZ = true;
        }
        mi.clipAnimations = clips;
    }
}
