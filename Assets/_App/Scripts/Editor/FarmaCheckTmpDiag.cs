using UnityEngine;
using UnityEditor;
using System.Linq;

public static class FarmaCheckTmpDiag
{
    public static void Run()
    {
        var direto = Resources.Load<TMPro.TMP_Settings>("TMP Settings");
        Debug.Log($"[DIAG] Resources.Load TMP Settings = {(direto != null ? "OK" : "NULL")}");
        try
        {
            bool inst = TMPro.TMP_Settings.instance != null;
            Debug.Log($"[DIAG] TMP_Settings.instance = {(inst ? "OK" : "NULL")}");
        }
        catch (System.Exception e) { Debug.Log("[DIAG] instance THROWS: " + e.GetType().Name); }

        var fontes = AssetDatabase.FindAssets("t:TMP_FontAsset")
            .Select(AssetDatabase.GUIDToAssetPath).ToList();
        Debug.Log($"[DIAG] TMP_FontAssets no projeto: {fontes.Count}");
        foreach (var f in fontes.Take(5)) Debug.Log("[DIAG] Fonte: " + f);

        var cena = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(
            "Assets/_App/Scenes/Menu.unity");
        int total = 0, comFonte = 0;
        var textos = UnityEngine.Object.FindObjectsOfTypeAll(typeof(TMPro.TextMeshProUGUI))
            .Cast<TMPro.TextMeshProUGUI>().ToList();
        foreach (var t in textos)
        {
            total++;
            if (t.font != null) comFonte++;
            else Debug.Log("[DIAG] SEM FONTE: " + t.name);
        }
        Debug.Log($"[DIAG] Textos na cena Menu: {total}, com fonte explícita: {comFonte}");
        EditorApplication.Exit(0);
    }
}
