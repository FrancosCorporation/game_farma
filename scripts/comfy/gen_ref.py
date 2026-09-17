#!/usr/bin/env python3
"""Gera referência(s) 2D estilo Pixar no ComfyUI local (SDXL) para o pipeline de personagens 3D.

Uso:
  python3 scripts/comfy/gen_ref.py [seed_base=777] [n=4]

- Uma única passada gera `n` variações (batch) — escolher a melhor nas MÃOS/OLHOS.
- Saída: /media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/ref_pixar_v2_<seed>_*.png

Notas (ver findings.md §1):
- GPU: parar o llama antes (`docker stop llama-cpp`) se a VRAM estiver curta; SDXL 832×1216 ≈ 8 min.
- Prompt segue as âncoras de docs/DIRETRIZES_ARTE_ESTILIZADA.md §1. NÃO restringir a pose:
  mãos na cintura foi aprovada pelo PO; o alvo é o modelo ENTENDER mãos/olhos limpos.
"""
import json
import sys
import urllib.request

COMFY = "http://127.0.0.1:8188"


def post(path, payload):
    req = urllib.request.Request(COMFY + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def get(path):
    with urllib.request.urlopen(COMFY + path, timeout=30) as r:
        return json.loads(r.read())


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 777
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 4

    positive = (
        "stylized 3D render, Pixar style, casual mobile game art, friendly young adult woman, "
        "full body, standing confident pose with both hands resting on hips, arms akimbo, "
        "simple casual clothes, soft pastel palette, smooth PBR, clean textures, soft global illumination, "
        "clean symmetric eyes, round irises, centered pupils, calm friendly gaze, warm smile, "
        "hands cleanly modeled, naturally curled relaxed fingers, clear finger separation, "
        "no objects overlapping the hands, clean neutral studio background, centered composition, "
        "head to feet visible, game asset"
    )
    negative = (
        "photorealistic, hyperrealistic, GTA V, 8k detail, skin pores, photogrammetry, scan, "
        "grunge, dirt, scratches, realistic human face, PBR micro-detail, cinematic dark lighting, "
        "multiple people, multiple views, collage, cropped, out of frame, text, watermark, logo, "
        "button between fingers, object between fingers, hole between fingers, gap between fingers, "
        "webbed fingers, fused fingers, extra fingers, missing fingers, deformed hands, poorly drawn hands, "
        "poorly drawn eyes, asymmetric eyes, cross-eyed, extra pupils, glassy eyes"
    )

    prompt = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": n}},
        "5": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 30, "cfg": 6.0,
              "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
              "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"ref_pixar_v2_{seed}", "images": ["6", 0]}},
    }

    res = post("/prompt", {"prompt": prompt, "client_id": "gen_ref"})
    pid = res["prompt_id"]
    print("prompt_id:", pid, flush=True)

    import time
    for i in range(600):
        time.sleep(3)
        try:
            h = get(f"/history/{pid}")
        except Exception:
            continue
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                print("ERRO:", json.dumps(st, ensure_ascii=False)[:1200])
                return
            for o in h[pid].get("outputs", {}).get("7", {}).get("images", []):
                print("IMG:", o.get("filename"))
            print("DONE")
            return
        if i % 20 == 0:
            q = get("/queue")
            print(f"[{i*3}s] pend={len(q.get('queue_pending', []))} run={len(q.get('queue_running', []))}", flush=True)
    print("TIMEOUT")


if __name__ == "__main__":
    main()
