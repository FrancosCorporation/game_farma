// =============================================================================
// FarmaCheckSceneGenerator.cs - Versao corrigida e simplificada
// =============================================================================
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using TMPro;
using UnityEngine.UI;
using System.IO;
using System.Reflection;
using System.Linq;
using FarmaCheck.Core;
using FarmaCheck.UI;
using FarmaCheck.API;

public static class SerializedFieldHelper
{
    public static void SetField(object obj, string fieldName, object value)
    {
        var field = obj?.GetType().GetField(fieldName,
            BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public);
        if (field != null) field.SetValue(obj, value);
    }
}

public class FarmaCheckSceneGenerator
{
    private static readonly Color C_Farmaceutico = new Color32(13, 148, 136, 255);
    private static readonly Color C_PainelInf = new Color32(31, 63, 73, 255);
    private static readonly Color C_Cabecalho = new Color32(10, 50, 70, 255);
    private static readonly Color C_Parede = new Color32(240, 235, 225, 255);
    private static readonly Color C_Chamado = new Color32(180, 170, 150, 255);

    [MenuItem("Assets/Generate FarmaCheck/_1 Build All")]
    public static void BuildAll()
    {
        AssetDatabase.Refresh();
        GenerateMenuScene();
        GenerateExteriorScene();
        GenerateConsultorioScene();
        EditorBuildSettings.scenes = new[] {
            new EditorBuildSettingsScene("Assets/_App/Scenes/Menu.unity", true),
            new EditorBuildSettingsScene("Assets/_App/Scenes/Exterior.unity", true),
            new EditorBuildSettingsScene("Assets/_App/Scenes/Consultorio.unity", true)
        };
        Debug.Log("=== FarmaCheck: tudo gerado com sucesso! ===");
    }

    [MenuItem("Assets/Generate FarmaCheck/_2 Build Jogavel")]
    public static void BuildJogavel()
    {
        AssetDatabase.Refresh();
        GenerateMenuScene();
        GenerateExteriorScene();
        GenerateConsultorioScene();
        
        var opcoes = new BuildPlayerOptions {
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
        if (relatorio.summary.result == BuildResult.Succeeded)
            Debug.Log($"=== BUILD JOGAVEL OK: {relatorio.summary.outputPath} ===");
        else
            throw new System.Exception("Build falhou");
    }

    // =====================================================================
    // UTILIDADES
    // =====================================================================
    private static Material CriarMaterial(Color cor)
    {
        var mat = new Material(Shader.Find("Standard"));
        mat.color = cor;
        AssetDatabase.CreateAsset(mat, "Assets/_App/Materials/Mat_Gerado_" + Random.value.ToString("N8") + ".mat");
        return mat;
    }

    private static Mesh CreateBoxMesh(float larg, float alt, float prof)
    {
        var mesh = new Mesh();
        mesh.vertices = new[] {
            new Vector3(-larg/2, -alt/2, -prof/2), new Vector3(larg/2, -alt/2, -prof/2),
            new Vector3(larg/2, alt/2, -prof/2), new Vector3(-larg/2, alt/2, -prof/2),
            new Vector3(-larg/2, -alt/2, prof/2), new Vector3(larg/2, -alt/2, prof/2),
            new Vector3(larg/2, alt/2, prof/2), new Vector3(-larg/2, alt/2, prof/2)
        };
        mesh.normals = Vector3.forward;
        mesh.triangles = new[] {
            0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,5,1, 0,4,5,
            1,5,6, 1,6,2, 3,7,4, 3,4,0, 3,8,7, 3,7,2
        };
        return mesh;
    }

    private static GameObject CriarPainel(GameObject parent, string nome, Rect rect, Color cor)
    {
        var go = new GameObject(nome);
        go.transform.SetParent(parent.transform, false);
        var rt = go.AddComponent<RectTransform>();
        rt.anchoredPosition = new Vector2(rect.x + rect.width/2, rect.y + rect.height/2);
        rt.sizeDelta = new Vector2(rect.width, rect.height);
        go.AddComponent<Image>().color = cor;
        return go;
    }

    private static void AddText(GameObject parent, string nome, Vector2 pos, Vector2 size, string texto, Color cor, int fontSize, TextAlignmentOptions align)
    {
        var go = new GameObject(nome);
        go.transform.SetParent(parent.transform, false);
        var txt = go.AddComponent<TextMeshProUGUI>();
        txt.text = texto;
        txt.fontSize = fontSize;
        txt.color = cor;
        txt.alignment = align;
        var rt = go.GetComponent<RectTransform>();
        rt.anchoredPosition = pos;
        rt.sizeDelta = size;
    }

    private static Font GetOrCreateTMPFont()
    {
        var fonts = AssetDatabase.FindAssets("t_Regular");
        if (fonts.Length > 0)
        {
            var path = AssetDatabase.GUIDToAssetPath(fonts[0]);
            return AssetDatabase.LoadAssetAtPath<Font>(path);
        }
        return null;
    }

    private static Sprite GetUISprite()
    {
        var sprites = AssetDatabase.FindAssets("ui_default");
        if (sprites.Length > 0)
        {
            var path = AssetDatabase.GUIDToAssetPath(sprites[0]);
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }
        return null;
    }

    // =====================================================================
    // CENA MENU
    // =====================================================================
    private static void GenerateMenuScene()
    {
        EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
        var cena = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, (NewSceneMode)0);

        // Camara principal (fixed)
        var camGo = new GameObject("Main Camera");
        camGo.transform.position = new Vector3(0, 2, -5);
        camGo.AddComponent<Camera>();
        camGo.AddComponent<AudioListener>();
        camGo.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
        camGo.GetComponent<Camera>().backgroundColor = new Color(0.1f, 0.15f, 0.2f);

        // Chao (com collider)
        var chaoGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        chaoGo.name = "Chao";
        chaoGo.transform.position = new Vector3(0, -0.5f, 0);
        chaoGo.transform.localScale = new Vector3(20, 1, 20);
        chaoGo.GetComponent<MeshRenderer>().sharedMaterial = CriarMaterial(C_Chamado);

        // Luz
        var luzGo = new GameObject("Light");
        var luz = luzGo.AddComponent<Light>();
        luz.type = LightType.Directional;
        luz.color = Color.white;
        luz.intensity = 1f;
        luzGo.transform.rotation = Quaternion.Euler(45, 45, 0);

        // Player (anda com WASD)
        var playerGo = new GameObject("Player");
        playerGo.tag = "Player";
        playerGo.AddComponent<CharacterController>();
        playerGo.AddComponent<PlayerWalk>();
        playerGo.transform.position = new Vector3(0, 1, 5);

        // Portal trigger
        var portalGo = new GameObject("PortalTrigger");
        portalGo.transform.position = new Vector3(0, 1, -4);
        portalGo.AddComponent<BoxCollider>();
        portalGo.GetComponent<BoxCollider>().isTrigger = true;
        portalGo.AddComponent<PortalTrigger>();

        // Canvas
        var canvasGo = new GameObject("Canvas");
        canvasGo.AddComponent<Canvas>();
        canvasGo.AddComponent<CanvasScaler>();
        canvasGo.AddComponent<GraphicRaycaster>();
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        canvasGo.GetComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGo.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1920, 1080);

        AddText(canvasGo, "Titulo", new Vector2(0, 400), new Vector2(800, 100),
            "FarmaCheck", Color.white, 60, TextAlignmentOptions.Center);
        AddText(canvasGo, "Subtitulo", new Vector2(0, 280), new Vector2(600, 60),
            "O Desafio da Anaminese", Color.gray, 30, TextAlignmentOptions.Center);
        AddText(canvasGo, "Instrucoes", new Vector2(0, -400), new Vector2(800, 100),
            "Caminhe ate o portal e pressione E", Color.yellow, 24, TextAlignmentOptions.Center);

        // GameManager
        var gmGo = new GameObject("GameManager");
        gmGo.AddComponent<GameManager>();

        Debug.Log("[Menu] Cena gerada.");
    }

    // =====================================================================
    // CENA EXTERIOR
    // =====================================================================
    private static void GenerateExteriorScene()
    {
        EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
        var cena = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, (NewSceneMode)0);

        // Camera
        var camGo = new GameObject("Main Camera");
        camGo.transform.position = new Vector3(0, 2, -10);
        camGo.AddComponent<Camera>();
        camGo.AddComponent<AudioListener>();
        camGo.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
        camGo.GetComponent<Camera>().backgroundColor = new Color(0.5f, 0.7f, 1f);

        // Chao (grama)
        var chaoGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        chaoGo.name = "Chao";
        chaoGo.transform.position = new Vector3(0, -0.5f, 0);
        chaoGo.transform.localScale = new Vector3(50, 1, 50);
        chaoGo.GetComponent<MeshRenderer>().sharedMaterial = CriarMaterial(new Color32(34, 139, 34, 255));

        // Calcada
        var calcGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        calcGo.name = "Calcada";
        calcGo.transform.position = new Vector3(0, 0.01f, 5);
        calcGo.transform.localScale = new Vector3(4, 0.02f, 20);
        calcGo.GetComponent<MeshRenderer>().sharedMaterial = CriarMaterial(new Color32(169, 169, 169, 255));

        // Clinica (edificio simples)
        var clinicaGo = new GameObject("Clinica");
        clinicaGo.transform.position = new Vector3(0, 0, -10);
        
        // Paredes
        var matParede = CriarMaterial(new Color32(255, 255, 240, 255));
        var matTelhado = CriarMaterial(new Color32(178, 34, 34, 255));
        
        // Parede fundal
        var fundGo = new GameObject("ParedeFundo");
        fundGo.transform.SetParent(clinicaGo.transform, false);
        fundGo.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(8f, 5f, 0.3f);
        fundGo.AddComponent<MeshRenderer>().sharedMaterial = matParede;
        fundGo.transform.position = new Vector3(0, 2.5, -4);

        // Paredes laterais
        var esqGo = new GameObject("ParedeEsq");
        esqGo.transform.SetParent(clinicaGo.transform, false);
        esqGo.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.3f, 5f, 8f);
        esqGo.AddComponent<MeshRenderer>().sharedMaterial = matParede;
        esqGo.transform.position = new Vector3(-4, 2.5, 0);

        var dirGo = new GameObject("ParedeDir");
        dirGo.transform.SetParent(clinicaGo.transform, false);
        dirGo.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.3f, 5, 8f);
        dirGo.AddComponent<MeshRenderer>().sharedMaterial = matParede;
        dirGo.transform.position = new Vector3(4, 2.5, 0);

        // Telhado
        var telhadoGo = new GameObject("Telhado");
        telhadoGo.transform.SetParent(clinicaGo.transform, false);
        telhadoGo.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(9f, 0.2f, 9f);
        telhadoGo.AddComponent<MeshRenderer>().sharedMaterial = matTelhado;
        telhadoGo.transform.position = new Vector3(0, 5.5, 0);

        // Porta (trigger)
        var portaGo = new GameObject("PortaTrigger");
        portaGo.transform.SetParent(clinicaGo.transform, false);
        portaGo.AddComponent<BoxCollider>();
        portaGo.GetComponent<BoxCollider>().isTrigger = true;
        portaGo.transform.position = new Vector3(0, 1.5, 3.5);
        portaGo.AddComponent<PortaClinica>();

        // Player
        var playerGo = new GameObject("Player");
        playerGo.tag = "Player";
        playerGo.AddComponent<CharacterController>();
        playerGo.AddComponent<PlayerWalk>();
        playerGo.transform.position = new Vector3(0, 1, 15);

        // GameManager
        var gmGo = new GameObject("GameManager");
        gmGo.AddComponent<GameManager>();

        Debug.Log("[Exterior] Cena gerada.");
    }

    // =====================================================================
    // CENA CONSULTORIO
    // =====================================================================
    private static void GenerateConsultorioScene()
    {
        EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
        var cena = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, (NewSceneMode)0);

        // Camara do jogador
        var playerGo = new GameObject("Player");
        playerGo.tag = "Player";
        playerGo.AddComponent<CharacterController>();
        playerGo.AddComponent<PlayerWalk>();
        // Spawn no chao (y=1 = altura dos olhos)
        playerGo.transform.position = new Vector3(0, 1, 3);
        playerGo.transform.rotation = Quaternion.Euler(0, 180, 0);

        var camGo = new GameObject("Main Camera");
        camGo.transform.SetParent(playerGo.transform, false);
        camGo.transform.localPosition = Vector3.zero;
        camGo.AddComponent<Camera>();
        camGo.AddComponent<AudioListener>();
        camGo.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
        camGo.GetComponent<Camera>().backgroundColor = new Color(0.7f, 0.75f, 0.8f);

        // Luz
        var dirGo = new GameObject("DirectionalLight");
        var dirLight = dirGo.AddComponent<Light>();
        dirLight.type = LightType.Directional;
        dirLight.color = new Color(0.95f, 0.9f, 0.85f);
        dirLight.intensity = 1.5f;
        dirGo.transform.rotation = Quaternion.Euler(45, 45, 0);

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.7f, 0.75f, 0.8f);

        // Chao (COM COLLIDER - nao remove!)
        var chaoGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        chaoGo.name = "Chao";
        chaoGo.transform.position = new Vector3(0, -0.01f, 0);
        chaoGo.transform.localScale = new Vector3(12, 0.5f, 10);
        chaoGo.GetComponent<MeshRenderer>().sharedMaterial = CriarMaterial(C_Chamado);
        // NAO remove o collider!

        // Paredes (sem collider para o jogador nao bugar)
        var matParede = CriarMaterial(C_Parede);
        
        var paredeTras = GameObject.CreatePrimitive(PrimitiveType.Cube);
        paredeTras.transform.position = new Vector3(0, 2.5f, -5f);
        paredeTras.transform.localScale = new Vector3(10f, 5f, 0.2f);
        paredeTras.GetComponent<MeshRenderer>().sharedMaterial = matParede;
        Object.Object.DestroyImmediate(paredeTras.GetComponent<BoxCollider>());

        var paredeEsq = GameObject.CreatePrimitive(PrimitiveType.Cube);
        paredeEsq.transform.position = new Vector3(-5f, 2.5f, 0f);
        paredeEsq.transform.localScale = new Vector3(0.2f, 5f, 10f);
        paredeEsq.GetComponent<MeshRenderer>().sharedMaterial = matParede;
        Object.Object.DestroyImmediate(paredeEsq.GetComponent<BoxCollider>());

        var paredeDir = GameObject.CreatePrimitive(PrimitiveType.Cube);
        paredeDir.transform.position = new Vector3(5f, 2.5f, 0f);
        paredeDir.transform.localScale = new Vector3(0.2f, 5f, 10f);
        paredeDir.GetComponent<MeshRenderer>().sharedMaterial = matParede;
        Object.DestroyImmediate(paredeDir.GetComponent<BoxCollider>());

        // Teto
        var teto = GameObject.CreatePrimitive(PrimitiveType.Cube);
        teto.transform.position = new Vector3(0, 5f, 0f);
        teto.transform.localScale = new Vector3(10f, 0.2f, 10f);
        teto.GetComponent<MeshRenderer>().sharedMaterial = CriarMaterial(new Color32(250, 250, 245, 255));
        Object.DestroyImmediate(teto.GetComponent<BoxCollider>());

        // Mesa do consultorio
        var mesaGo = new GameObject("Mesa");
        mesaGo.transform.position = new Vector3(0, 0.75f, 0.5f);
        var matMadeira = CriarMaterial(new Color32(120, 85, 50, 255));
        var topoMesa = new GameObject("Topo");
        topoMesa.transform.SetParent(mesaGo.transform, false);
        topoMesa.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(2.5f, 0.1f, 1.2f);
        topoMesa.AddComponent<MeshRenderer>().sharedMaterial = matMadeira;
        // Pernas da mesa
        foreach (var p in new[] { new Vector3(-1.1f, -0.375f, -0.5f), new Vector3(1.1f, -0.375f, -0.5f),
                                  new Vector3(-1.1f, -0.375f, 0.5f), new Vector3(1.1f, -0.375f, 0.5f) })
        {
            var perna = new GameObject("Perna");
            perna.transform.SetParent(mesaGo.transform, false);
            perna.transform.localPosition = p;
            perna.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.1f, 0.75f, 0.1f);
            perna.AddComponent<MeshRenderer>().sharedMaterial = matMadeira;
        }

        // Cadeira do paciente
        var cadeiraGo = new GameObject("Cadeira");
        cadeiraGo.transform.position = new Vector3(0, 0, -2f);
        var matCadeira = CriarMaterial(new Color32(80, 60, 40, 255));
        var assento = new GameObject("Assento");
        assento.transform.SetParent(cadeiraGo.transform, false);
        assento.transform.localPosition = new Vector3(0, 0.5f, 0f);
        assento.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.8f, 0.1f, 0.7f);
        assento.AddComponent<MeshRenderer>().sharedMaterial = matCadeira;
        var encosto = new GameObject("Encosto");
        encosto.transform.SetParent(cadeiraGo.transform, false);
        encosto.transform.localPosition = new Vector3(0, 1f, -0.3f);
        encosto.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.8f, 1f, 0.1f);
        encosto.AddComponent<MeshRenderer>().sharedMaterial = matCadeira;

        // Paciente (representacao simples)
        var pacGo = new GameObject("Patient");
        pacGo.transform.position = new Vector3(0, 0.9f, -2f);
        pacGo.tag = "Patient";
        var matPaciente = CriarMaterial(new Color32(255, 220, 180, 255));
        // Cabeca
        var cabeca = new GameObject("Cabeca");
        cabeca.transform.SetParent(pacGo.transform, false);
        cabeca.AddComponent<SphereCollider>();
        cabeca.AddComponent<MeshFilter>().mesh = CreateSphereMesh(0.25f);
        cabeca.AddComponent<MeshRenderer>().sharedMaterial = matPaciente;
        cabeca.transform.localPosition = new Vector3(0, 0.85f, 0f);
        // Corpo
        var corpo = new GameObject("Corpo");
        corpo.transform.SetParent(pacGo.transform, false);
        corpo.AddComponent<MeshFilter>().sharedMesh = CreateBoxMesh(0.6f, 0.8f, 0.4f);
        corpo.AddComponent<MeshRenderer>().sharedMaterial = CriarMaterial(new Color32(100, 150, 200, 255));
        corpo.transform.localPosition = new Vector3(0, 0.4f, 0f);

        // Canvas UI
        var canvasGo = new GameObject("Canvas");
        canvasGo.AddComponent<Canvas>();
        canvasGo.AddComponent<CanvasScaler>();
        canvasGo.AddComponent<GraphicRaycaster>();
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        canvasGo.GetComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGo.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1920, 1080);

        // Chat panel - parte INFERIOR da tela
        var chatPanel = CriarPainel(canvasGo, "ChatPanel", new Rect(200, 0, 1520, 350), C_PainelInf);
        
        // Scroll area
        var scrollGo = CriarPainel(chatPanel, "Scroll", new Rect(20, 20, 1000, 280), Color.clear);
        var scroll = scrollGo.AddComponent<ScrollRect>();
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        
        var contentGo = new GameObject("Content");
        contentGo.transform.SetParent(scrollGo.transform, false);
        contentGo.AddComponent<RectTransform>();
        contentGo.AddComponent<VerticalLayoutGroup>();
        var vlg = contentGo.GetComponent<VerticalLayoutGroup>();
        vlg.spacing = 10f;
        contentGo.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
        var cr = contentGo.GetComponent<RectTransform>();
        cr.anchorMin = Vector2.zero;
        cr.anchorMax = new Vector2(1f, 1f);
        scroll.content = cr;
        
        var vpGo = new GameObject("Viewport");
        vpGo.transform.SetParent(scrollGo.transform, false);
        vpGo.AddComponent<Mask>();
        var vpRect = vpGo.GetComponent<RectTransform>();
        vpRect.anchorMin = Vector2.zero;
        vpRect.anchorMax = new Vector2(1f, 1f);
        scroll.viewport = vpRect;

        // Input field
        var inputGo = CriarPainel(chatPanel, "Input", new Rect(20, 310, 900, 35), new Color32(40, 55, 65, 255));
        var input = inputGo.AddComponent<TMP_InputField>();
        input.placeholder.gameObject.AddComponent<TextMeshProUGUI>();
        input.placeholder.GetComponent<TextMeshProUGUI>().text = "Digite sua pergunta...";
        input.placeholder.GetComponent<TextMeshProUGUI>().fontSize = 18;
        input.placeholder.GetComponent<TextMeshProUGUI>().color = new Color32(150, 170, 180, 255);

        // Botao enviar
        var btnEnvGo = CriarPainel(chatPanel, "BotaoEnviar", new Rect(940, 310, 200, 35), C_Farmaceutico);
        btnEnvGo.AddComponent<Button>();
        AddText(btnEnvGo, "BtnTxt", Vector2.zero, new Vector2(200, 35), "Enviar", Color.white, 18, TextAlignmentOptions.Center);

        // Botao finalizar
        var btnFinGo = CriarPainel(chatPanel, "BotaoFinalizar", new Rect(1160, 310, 200, 35), new Color32(180, 80, 40, 255));
        btnFinGo.AddComponent<Button>();
        AddText(btnFinGo, "BtnFinTxt", Vector2.zero, new Vector2(200, 35), "Finalizar", Color.white, 18, TextAlignmentOptions.Center);

        // Header
        CriarPainel(canvasGo, "Header", new Rect(0, 980, 300, 50), C_Cabecalho);
        AddText(canvasGo, "HeaderLabel", new Vector2(150, 1005), new Vector2(280, 40),
            "Consultorio", Color.white, 16, TextAlignmentOptions.Center);

        // Speech bubble (acima do paciente)
        var bubbleGo = new GameObject("SpeechBubble");
        bubbleGo.transform.SetParent(canvasGo.transform, false);
        var bRt = bubbleGo.AddComponent<RectTransform>();
        bRt.anchorMin = new Vector2(0.4f, 0.75f);
        bRt.anchorMax = new Vector2(0.6f, 0.85f);
        bubbleGo.AddComponent<Image>();
        var bTxtGo = new GameObject("BubbleTexto");
        bTxtGo.transform.SetParent(bubbleGo.transform, false);
        var bubbleTxt = bTxtGo.AddComponent<TextMeshProUGUI>();
        bubbleTxt.text = "Paciente: [queixa]";
        bubbleTxt.fontSize = 18;
        bubbleTxt.color = new Color32(31, 41, 55, 255);

        // Managers
        var gmGo = new GameObject("GameManager");
        gmGo.AddComponent<GameManager>();

        var llmGo = new GameObject("LLMClient");
        llmGo.AddComponent<LLMClient>();

        var accGo = new GameObject("AccessibilityBridge");
        accGo.AddComponent<AccessibilityManager>();

        var chatUIGo = new GameObject("ChatUIManager");
        var chatUI = chatUIGo.AddComponent<ChatUIManager>();
        SerializedFieldHelper.SetField(chatUI, "llmClient", llmGo.GetComponent<LLMClient>());
        SerializedFieldHelper.SetField(chatUI, "accessibility", accGo.GetComponent<AccessibilityManager>());
        SerializedFieldHelper.SetField(chatUI, "campoEntrada", input);
        SerializedFieldHelper.SetField(chatUI, "botaoEnviar", btnEnvGo.GetComponent<Button>());
        SerializedFieldHelper.SetField(chatUI, "scrollChat", scroll);
        SerializedFieldHelper.SetField(chatUI, "conteudoChat", contentGo.transform);

        // Botao enviar
        btnEnvGo.GetComponent<Button>().onClick.AddListener(() => chatUI.OnSendButtonClicked());
        
        // Botao finalizar
        btnFinGo.GetComponent<Button>().onClick.AddListener(() => {
            Debug.Log("[FarmaCheck] Finalizando e voltando ao menu...");
            GameManager.Instance?.SetState(GameState.MainMenu);
            SceneManager.LoadScene("Exterior");
        });

        // Input enter
        input.onSubmit.AddListener((_) => chatUI.OnSendButtonClicked());

        Debug.Log("[Consultorio] Cena gerada.");
    }

    // =====================================================================
    // HELPERS
    // =====================================================================
    private static Mesh CreateSphereMesh(float radius)
    {
        var mesh = new Mesh();
        int seg = 16;
        var verts = new System.Collections.Generic.List<Vector3>();
        var tris = new System.Collections.Generic.List<int>();
        
        for (int y = 0; y <= seg; y++)
        {
            for (int x = 0; x <= seg; x++)
            {
                float u = (float)x / seg;
                float v = (float)y / seg;
                float phi = v * Mathf.PI;
                float theta = u * 2 * Mathf.PI;
                verts.Add(new Vector3(
                    radius * Mathf.Sin(phi) * Mathf.Cos(theta),
                    radius * Mathf.Cos(phi),
                    radius * Mathf.Sin(phi) * Mathf.Sin(theta)
                ));
            }
        }
        
        for (int y = 0; y < seg; y++)
        {
            for (int x = 0; x < seg; x++)
            {
                int a = y * (seg + 1) + x;
                int b = a + seg + 1;
                tris.Add(a); tris.Add(b); tris.Add(a + 1);
                tris.Add(b); tris.Add(b + 1); tris.Add(a + 1);
            }
        }
        
        mesh.vertices = verts.ToArray();
        mesh.triangles = tris.ToArray();
        mesh.RecalculateNormals();
        return mesh;
    }
}
