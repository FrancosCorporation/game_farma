using UnityEditor;
using UnityEditor.Build.Reporting;

public static class BuildScript
{
    public static void BuildLinux()
    {
        var opcoes = new BuildPlayerOptions
        {
            scenes = new[] {
                "Assets/_App/Scenes/Menu.unity",
                "Assets/_App/Scenes/Exterior.unity",
                "Assets/_App/Scenes/Consultorio.unity"
            },
            locationPathName = "Builds/Linux/FarmaCheck.x86_64",
            target = BuildTarget.StandaloneLinux64,
            options = BuildOptions.None
        };
        var relatorio = BuildPipeline.BuildPlayer(opcoes);
        if (relatorio.summary.result != BuildResult.Succeeded)
            throw new System.Exception("Build falhou: " + relatorio.summary.totalErrors + " erros");
        EditorApplication.Exit(0);
    }
}
