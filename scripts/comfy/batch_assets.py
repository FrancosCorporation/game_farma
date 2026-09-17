#!/usr/bin/env python3
"""Orquestrador em LOTE: referência (SDXL) -> TRELLIS 2 -> Blender -> GLB do jogo.

Uso:
  python3 scripts/comfy/batch_assets.py [--only id1,id2] [--start-from id] [--skip-ref]
                                        [--ref-only] [--dry-run] [--no-blender] [--no-protocol]

- Lê o manifesto: scripts/comfy/assets_manifest.json
- Resumível: pula asset cujo GLB de saída já existe.
- Protocolo de VRAM: para llama-cpp e pausa media-api/flaresolverr durante o lote (restaura no fim).
- Saúde: se o ComfyUI não responder, reinicia (kill -9 -> systemd auto-restart) e espera voltar.
- Métricas: scripts/comfy/batch_state.json (status/duração por asset e por etapa).

Ver também: findings.md §1 (armadilhas) e SKILL_BANK/SKILL_H_PIPELINE_3D_LOTE.md.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib

REPO = "/home/servidor/Git/game_farma"
COMFY = "http://127.0.0.1:8188"
COMFY_DIR = "/media/servidor/nvme_data/ai_music/comfyui/ComfyUI"
WORKFLOW = f"{COMFY_DIR}/user/default/workflows/2. Trellis 2 - Image to 3D Model - HQ + PBR Textures.json"
BLENDER = "/snap/bin/blender"
POST = f"{REPO}/scripts/blender/postprocess_character.py"
MANIFEST = f"{REPO}/scripts/comfy/assets_manifest.json"
STATE = f"{REPO}/scripts/comfy/batch_state.json"
REFS_DIR = f"{REPO}/scripts/comfy/refs"
QA_DIR = f"{REPO}/scripts/comfy/qa"

NEGATIVE = ("photorealistic, hyperrealistic, GTA V, 8k detail, skin pores, photogrammetry, scan, "
            "grunge, dirt, scratches, realistic human face, PBR micro-detail, cinematic dark lighting, "
            "multiple people, multiple views, collage, cropped, out of frame, text, watermark, logo, "
            "button between fingers, object between fingers, hole between fingers, gap between fingers, "
            "webbed fingers, fused fingers, extra fingers, missing fingers, deformed hands, poorly drawn hands, "
            "poorly drawn eyes, asymmetric eyes, cross-eyed, extra pupils, glassy eyes")

REF_SEEDS = {}


def log(msg):
    print(time.strftime("[%H:%M:%S]"), msg, flush=True)


def http_get(path, timeout=15):
    with urllib.request.urlopen(COMFY + path, timeout=timeout) as r:
        return json.loads(r.read())


def http_post(path, payload, timeout=60):
    req = urllib.request.Request(COMFY + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def comfy_ready(timeout=15) -> bool:
    try:
        http_get("/system_stats", timeout=timeout)
        return True
    except Exception:
        return False


def ensure_comfy(timeout_s=120):
    """Garante o ComfyUI de pé; se mudo, reinicia via kill (systemd Restart=on-failure)."""
    if comfy_ready():
        return True
    log("ComfyUI mudo — reiniciando (kill -9 -> auto-restart)")
    pid = subprocess.run(["systemctl", "show", "comfyui", "-p", "MainPID", "--value"],
                         capture_output=True, text=True).stdout.strip()
    if pid and pid != "0":
        subprocess.run(["kill", "-9", pid], check=False)
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        time.sleep(5)
        if comfy_ready():
            log("ComfyUI de volta ✓")
            time.sleep(5)
            return True
    return False


def docker(cmd):
    subprocess.run(["docker"] + cmd, capture_output=True, text=True)


_PRIOR_STATE = {}


def container_state(name):
    r = subprocess.run(["docker", "inspect", "-f", "{{.State.Status}}", name],
                       capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def protocol_start():
    for name, action in (("llama-cpp", "stop"), ("media-api", "pause"), ("flaresolverr", "pause")):
        st = container_state(name)
        if st == "running":
            _PRIOR_STATE[name] = action
            docker([action, name])
        else:
            log(f"aviso: container {name} não está running (status={st}) — pulei {action}")
    log("Protocolo VRAM aplicado (llama parado, media-api/flaresolverr pausados)")


def protocol_end():
    for name, action in (("media-api", "unpause"), ("flaresolverr", "unpause"), ("llama-cpp", "start")):
        if name in _PRIOR_STATE:
            docker([action, name])
    log("Protocolo VRAM restaurado (só o que foi alterado)")


# ---------------- etapas ----------------

PALETTE = {
    "black": (0, 0, 0), "white": (255, 255, 255), "gray": (128, 128, 128),
    "light gray": (200, 200, 200), "dark gray": (64, 64, 64), "red": (200, 0, 0),
    "dark red": (120, 0, 0), "maroon": (128, 0, 0), "brown": (139, 69, 19),
    "tan": (210, 180, 140), "beige": (245, 245, 220), "olive": (128, 128, 0),
    "green": (0, 160, 0), "dark green": (0, 100, 0), "teal": (0, 128, 128),
    "turquoise": (64, 224, 208), "cyan": (0, 200, 200), "light blue": (173, 216, 230),
    "blue": (0, 0, 220), "navy": (0, 0, 128), "purple": (128, 0, 128),
    "violet": (150, 100, 200), "pink": (255, 105, 180), "orange": (255, 140, 0),
    "yellow": (230, 220, 60),
}


def color_name(hex_str):
    h = hex_str.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    best, bd = "gray", 1e9
    for name, (pr, pg, pb) in PALETTE.items():
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < bd:
            best, bd = name, d
    return best


def gen_ref(asset):
    """Gera a referência 2D via SDXL e copia para scripts/comfy/refs/<id>.png"""
    ref_path = os.path.join(REFS_DIR, f"{asset['id']}.png")
    if os.path.exists(ref_path):
        log(f"referência já existe: {ref_path}")
        return ref_path
    seed = asset.get("seed") or (777 + zlib.crc32(asset["id"].encode()) % 10007)
    text = asset["prompt"]
    cores = asset.get("cores") or {}
    if cores.get("camisa") and cores.get("calca"):
        text = text.replace(
            "simple casual clothes",
            f"simple casual clothes, wearing a {color_name(cores['camisa'])} top "
            f"and {color_name(cores['calca'])} pants",
        )
    prompt = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 30, "cfg": 6.0,
              "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
              "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"batch_ref_{asset['id']}", "images": ["6", 0]}},
    }
    res = http_post("/prompt", {"prompt": prompt, "client_id": "batch"})
    pid = res["prompt_id"]
    log(f"ref SDXL submetida ({asset['id']}, seed {seed}): {pid}")
    for _ in range(600):
        time.sleep(3)
        h = http_get(f"/history/{pid}").get(pid)
        if h:
            st = h.get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(f"SDXL ref falhou: {json.dumps(st)[:300]}")
            imgs = h.get("outputs", {}).get("7", {}).get("images", [])
            if not imgs:
                raise RuntimeError("SDXL sem saída de imagem")
            src = os.path.join(COMFY_DIR, "output", imgs[0].get("subfolder", ""), imgs[0]["filename"])
            os.makedirs(REFS_DIR, exist_ok=True)
            shutil.copy(src, ref_path)
            REF_SEEDS[asset["id"]] = seed
            log(f"referência salva: {ref_path} (seed {seed})")
            return ref_path
    raise TimeoutError("SDXL ref timeout")


def trellis(asset, ref_path):
    """Submete o workflow TRELLIS 2 e devolve o caminho do GLB novo em output/3d/."""
    sys.path.insert(0, f"{REPO}/scripts/comfy")
    import submit_wf as swf

    out3d = os.path.join(COMFY_DIR, "output", "3d")
    before = {f: os.path.getmtime(os.path.join(out3d, f)) for f in os.listdir(out3d) if f.endswith(".glb")}

    shutil.copy(ref_path, os.path.join(COMFY_DIR, "input", "ref_char.png"))
    seed = asset.get("seed") or (777 + zlib.crc32(asset["id"].encode()) % 10007)
    p = swf.build_api(WORKFLOW, image_name="ref_char.png", seed=seed)
    # validações obrigatórias (ver findings.md §1.2)
    rm = p.get("241", {}).get("inputs", {})
    assert rm.get("sign_mode") == "udf" and "sign_mode.qef" in rm, "DynamicCombo do RemeshMesh inválido!"
    assert p.get("322", {}).get("inputs", {}).get("filename_prefix", "").startswith("3d/"), "Save3DAdvanced inválido!"
    res = http_post("/prompt", {"prompt": p, "client_id": "batch"})
    pid = res["prompt_id"]
    log(f"TRELLIS submetido ({asset['id']}, seed {seed}): {pid}")

    t0 = time.time()
    while True:
        time.sleep(20)
        h = http_get(f"/history/{pid}").get(pid)
        if h:
            st = h.get("status", {})
            if st.get("status_str") == "error":
                err = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError(f"TRELLIS erro: {json.dumps(err)[:400] if err else 'desconhecido'}")
            novos = [f for f in os.listdir(out3d) if f.endswith(".glb")
                     and (f not in before or os.path.getmtime(os.path.join(out3d, f)) > before[f])]
            if not novos:
                raise RuntimeError("TRELLIS 'sucesso' mas nenhum GLB novo (ver 'Output will be ignored')")
            novos.sort(key=lambda f: os.path.getmtime(os.path.join(out3d, f)), reverse=True)
            glb = os.path.join(out3d, novos[0])
            log(f"TRELLIS ok em {round((time.time()-t0)/60,1)} min -> {novos[0]}")
            return glb, seed
        if time.time() - t0 > 3 * 3600:
            raise TimeoutError("TRELLIS > 3h")


def blender_post(glb_in, glb_out, kind, tris_char=100000, tris_prop=5000):
    sys.path.insert(0, f"{REPO}/scripts/comfy")
    import finalize_assets as fa
    if kind == "character":
        m = fa.finalize_one(glb_in, glb_out, tris=tris_char, height=1.72, size_limit_mb=8)
    else:
        m = fa.finalize_one(glb_in, glb_out, tris=tris_prop, height=0, size_limit_mb=4)
    log(f"finalize: tris={m['tris_final']} altura={m['altura']} mb={m['tamanho_mb']} "
        f"contract_ok={m['contract_ok']} falhas={m['falhas']}")
    if not m["contract_ok"]:
        raise RuntimeError(f"contrato de asset falhou: {m['falhas']}")
    return m


def qa_shot(asset_id, glb_game_path):
    """Screenshot com a luz do jogo (copiando para public/models temporariamente)."""
    try:
        os.makedirs(QA_DIR, exist_ok=True)
        tmp_name = f"_qa_{asset_id}_{os.getpid()}"
        tmp_path = f"{REPO}/public/models/{tmp_name}.glb"
        shutil.copy(glb_game_path, tmp_path)
        try:
            for cam in ("face", "torso", "full"):
                out = f"{QA_DIR}/{asset_id}.png" if cam == "full" else f"{QA_DIR}/{asset_id}_{cam}.png"
                args = ["node", "scripts/shot3d.mjs", tmp_name, out, "--wait=3000"]
                if cam != "full":
                    args.append(f"--cam={cam}")
                subprocess.run(args, cwd=REPO, capture_output=True, text=True, timeout=180)
                if os.path.exists(out):
                    log(f"QA screenshot: {out}")
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    except Exception as e:
        log(f"QA screenshot falhou (segue): {e}")


# ---------------- orquestração ----------------

def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    return {"assets": {}}


def save_state(st):
    json.dump(st, open(STATE, "w"), indent=1, ensure_ascii=False)


def run_asset(asset, args, st):
    aid = asset["id"]
    entry = st["assets"].setdefault(aid, {})
    out_glb = os.path.join(REPO, asset["out"])
    if os.path.exists(out_glb) and not args.force:
        log(f"[{aid}] já pronto (skip): {asset['out']}")
        entry.update(status="done", out=asset["out"])
        return
    t_asset = time.time()
    log(f"[{aid}] ===== iniciando ({asset['kind']}) =====")
    try:
        ref = os.path.join(REFS_DIR, f"{aid}.png")
        if not args.skip_ref and not os.path.exists(ref):
            t = time.time(); ref = gen_ref(asset); entry["t_ref_min"] = round((time.time()-t)/60, 1)
        entry["ref_seed"] = REF_SEEDS.get(aid)
        if args.ref_only:
            entry.update(status="ref-only")
            return
        if not os.path.exists(ref):
            raise RuntimeError(f"referência ausente e --skip-ref: {ref}")
        t = time.time(); glb_raw, tseed = trellis(asset, ref); entry["t_trellis_min"] = round((time.time()-t)/60, 1)
        entry["trellis_seed"] = tseed
        entry["raw_glb"] = os.path.basename(glb_raw)
        if not args.no_blender:
            t = time.time(); blender_post(glb_raw, out_glb, asset["kind"], args.tris_char, args.tris_prop); entry["t_blender_min"] = round((time.time()-t)/60, 1)
            qa_shot(aid, out_glb)
        entry.update(status="done", out=asset["out"], t_total_min=round((time.time()-t_asset)/60, 1))
        log(f"[{aid}] ✅ CONCLUÍDO em {entry['t_total_min']} min")
    except Exception as e:
        entry.update(status="error", error=str(e)[:500], t_total_min=round((time.time()-t_asset)/60, 1))
        log(f"[{aid}] ❌ ERRO: {e}")
        if not ensure_comfy():
            raise RuntimeError("ComfyUI não voltou")
    finally:
        save_state(st)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--start-from", default="")
    ap.add_argument("--skip-ref", action="store_true")
    ap.add_argument("--ref-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-blender", action="store_true")
    ap.add_argument("--no-protocol", action="store_true")
    ap.add_argument("--no-free-ram", action="store_true")
    ap.add_argument("--tris-char", type=int, default=100000)
    ap.add_argument("--tris-prop", type=int, default=5000)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--retry-errors", action="store_true",
                    help="processa apenas assets com status=error no state")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    assets = man["assets"]
    if args.only:
        wanted = set(args.only.split(","))
        assets = [a for a in assets if a["id"] in wanted]
    if args.start_from:
        idx = next(i for i, a in enumerate(assets) if a["id"] == args.start_from)
        assets = assets[idx:]
    if args.retry_errors:
        st0 = load_state()
        assets = [a for a in assets if st0["assets"].get(a["id"], {}).get("status") == "error"]
        print(f"Retry de erros: {len(assets)} assets")

    print(f"Lote: {len(assets)} assets | dry-run={args.dry_run}")
    if args.dry_run:
        for a in assets:
            out = os.path.join(REPO, a["out"])
            print(f"  {a['id']:28s} ref={'OK' if os.path.exists(os.path.join(REFS_DIR, a['id']+'.png')) else 'pendente'}"
                  f" out={'PRONTO' if os.path.exists(out) else 'pendente'}")
        return

    if not ensure_comfy():
        sys.exit("ComfyUI indisponível")
    if not args.no_protocol:
        protocol_start()
    st = load_state()
    try:
        for a in assets:
            run_asset(a, args, st)
    finally:
        if not args.no_protocol:
            protocol_end()
        st["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        save_state(st)
        if not args.no_free_ram:
            log("Finalizando ComfyUI e esvaziando a RAM (fim dos processos)…")
            subprocess.run([sys.executable, f"{REPO}/scripts/comfy/free_ram.py"], check=False)
        done = sum(1 for v in st["assets"].values() if v.get("status") == "done")
        errs = sum(1 for v in st["assets"].values() if v.get("status") == "error")
        print(f"\n=== LOTE: {done} prontos, {errs} com erro | estado: {STATE} ===")


if __name__ == "__main__":
    main()
