#!/usr/bin/env python3
"""Converte workflow UI (ComfyUI) -> API e submete. Uso:
python3 submit_wf.py "<workflow.json>" <imagem.png> <nome_job> [seed]
"""
import json, sys, time, urllib.request, urllib.error, shutil, os

COMFY = "http://127.0.0.1:8188"
BASE = "/media/servidor/nvme_data/ai_music/comfyui/ComfyUI"
INPUT_DIR = f"{BASE}/input"
OUT_DIR = f"{BASE}/output"

def post(path, payload):
    req = urllib.request.Request(COMFY + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP ERROR", e.code, e.read().decode()[:2000])
        raise

def get(path):
    with urllib.request.urlopen(COMFY + path, timeout=60) as r:
        return json.loads(r.read())

# Somente tipos escalares de widget consomem slot em widgets_values.
# Qualquer outro tipo (MESH, FILE_3D_..., SHAPE_SUBDIVIDES, MODEL, ...) é socket/link.
WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", "COLOR", "LOAD_3D", "COMFY_DYNAMICCOMBO_V3"}

def is_widget(spec):
    if isinstance(spec, dict):
        if spec.get("forceInput"):
            return False
        t = spec.get("type", None)
    else:
        t = spec[0] if isinstance(spec, list) and spec else spec
    if isinstance(t, list):
        return True  # COMBO estilo antigo (opções inline)
    return str(t).upper() in WIDGET_TYPES

def norm_value(v):
    """Corrige caminhos/nome de modelo vindos do workflow (int8 não roda no gfx1031)."""
    if isinstance(v, str):
        v = v.replace("\\\\", "/").replace("\\", "/").replace("int8_convrot", "bf16")
    return v

def dyn_options(spec):
    """Apenas DynamicCombo de verdade (opções são objetos com 'key')."""
    if isinstance(spec, dict):
        t = spec.get("type")
        extra = spec
    else:
        t = spec[0] if isinstance(spec, list) and spec else spec
        extra = spec[1] if isinstance(spec, list) and len(spec) > 1 and isinstance(spec[1], dict) else {}
    if str(t).upper() != "COMFY_DYNAMICCOMBO_V3":
        return None
    opts = extra.get("options") if isinstance(extra, dict) else None
    if isinstance(opts, list) and opts and isinstance(opts[0], dict) and "key" in opts[0]:
        return opts
    return None

def build_api(wf_path, image_name=None, seed=None):
    wf = json.load(open(wf_path))
    obj = json.load(urllib.request.urlopen(COMFY + "/object_info", timeout=120))
    links = {l[0]: (l[1], l[2]) for l in wf.get("links", [])}
    prompt, missing_cls = {}, set()
    for n in wf["nodes"]:
        nid, ct, mode = str(n["id"]), n["type"], n.get("mode", 0)
        if mode in (2, 4):
            continue
        cls = obj.get(ct)
        inputs, linked = {}, {}
        for i in n.get("inputs", []) or []:
            if i.get("link") is not None and i.get("name"):
                src = links.get(i["link"])
                if src:
                    linked[i["name"]] = [str(src[0]), src[1]]
        widgets = list(n.get("widgets_values") or [])
        if image_name and ct == "PixaromaLoadImageMini" and widgets:
            widgets[0] = image_name
        if ct == "PixaromaSeed":
            st = (n.get("properties") or {}).get("seedState")
            state = None
            try:
                state = json.loads(st) if isinstance(st, str) else st
            except Exception:
                state = None
            if seed is not None:
                base = state if isinstance(state, dict) else (widgets[0] if widgets and isinstance(widgets[0], dict) else {})
                state = {**base, "seed": seed}
            if state is not None:
                inputs["SeedState"] = state if isinstance(state, str) else json.dumps(state)
        if cls:
            order = []
            for section in ("required", "optional"):
                for name, s in (cls.get("input", {}).get(section, {}) or {}).items():
                    order.append((name, s))
            wi = 0
            SEED_NAMES = ("seed", "noise_seed")
            CONTROL = ("fixed", "increment", "decrement", "randomize")
            for name, s in order:
                if is_widget(s):
                    val = widgets[wi] if wi < len(widgets) else None
                    skip = 1
                    # o frontend guarda um widget extra "control_after_generate" logo após o seed
                    if name.lower() in SEED_NAMES and wi + 1 < len(widgets) and str(widgets[wi + 1]).lower() in CONTROL:
                        skip = 2
                    opts = dyn_options(s)
                    if opts is not None:
                        # DynamicCombo (spec do ComfyUI): o input principal recebe a CHAVE (string)
                        # e os sub-widgets vão PLANOS no prompt (o backend monta o dict via dynamic_paths).
                        key = val
                        inputs[name] = key
                        chosen = next((o for o in opts if o.get("key") == key), None)
                        if chosen:
                            for sub in (chosen.get("inputs", {}).get("required", {}) or {}).keys():
                                if wi + skip < len(widgets):
                                    inputs[f"{name}.{sub}"] = norm_value(widgets[wi + skip])
                                wi += 1
                        wi += skip
                    else:
                        if name in linked:
                            inputs[name] = linked[name]
                        elif val is not None:
                            inputs[name] = norm_value(val)
                        wi += skip
                elif name in linked:
                    inputs[name] = linked[name]
            if wi < len(widgets):
                print(f"[aviso] nó {nid} ({ct}): {len(widgets)-wi} widget(s) não consumidos: {widgets[wi:]!r}")
        else:
            missing_cls.add(ct)
            inputs.update(linked)
        prompt[nid] = {"class_type": ct, "inputs": inputs}
    if missing_cls:
        print("[aviso] classes ausentes no object_info:", missing_cls)
    return prompt

def main():
    wf_path, image, job = sys.argv[1], sys.argv[2], sys.argv[3]
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else None
    shutil.copy(image, os.path.join(INPUT_DIR, "ref_char.png"))
    prompt = build_api(wf_path, image_name="ref_char.png", seed=seed)
    print(f"nós convertidos: {len(prompt)}")
    res = post("/prompt", {"prompt": prompt, "client_id": "opencode"})
    pid = res["prompt_id"]
    print("prompt_id:", pid, flush=True)
    for i in range(600):
        time.sleep(3)
        try:
            h = get(f"/history/{pid}")
        except Exception:
            continue
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                print("ERRO:", json.dumps(st, ensure_ascii=False)[:1500])
                return
            outs = h[pid].get("outputs", {})
            files = []
            for node_out in outs.values():
                for k in ("images", "3d", "meshes", "result"):
                    for f in node_out.get(k, []) or []:
                        files.append(f)
            print("DONE saídas:", json.dumps(files, ensure_ascii=False)[:800])
            return
        if i % 10 == 0:
            q = get("/queue")
            print(f"[{i*3}s] pend={len(q.get('queue_pending', []))} run={len(q.get('queue_running', []))}", flush=True)
    print("TIMEOUT")

if __name__ == "__main__":
    main()
