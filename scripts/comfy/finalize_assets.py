#!/usr/bin/env python3
"""Finaliza assets 3D: Blender normaliza -> meshopt simplify -> resize -> optimize webp.

Pipeline por asset (validado 16/09/2026):
  a) Blender normaliza (1.72 m, pivô nos pés, shade smooth) SEM decimar
  b) gltf-transform simplify --ratio <tris_alvo/tris_raw> --error 0.01
     ATENÇÃO: sem --error permissivo o simplificador para no erro default (0.0001)
     e NÃO atinge o alvo (ficou ~265k tris achando que era 30k).
  c) gltf-transform resize --width 2048 --height 2048
  d) gltf-transform optimize --compress meshopt --texture-compress webp
  e) validação de contrato via scripts/comfy/glb_info.mjs (tris/altura/extensões) + tamanho < 8 MB

Uso:
  python3 scripts/comfy/finalize_assets.py [--only id1,id2] [--tris-char 100000] [--tris-prop 5000] [--qa]
  python3 scripts/comfy/finalize_assets.py --raw <bruto.glb> --out <final.glb> [--id nome] [--qa]
"""
import argparse
import json
import os
import re
import subprocess
import sys

REPO = "/home/servidor/Git/game_farma"
STATE = os.path.join(REPO, "scripts/comfy/batch_state.json")
MANIFEST = os.path.join(REPO, "scripts/comfy/assets_manifest.json")
COMFY_OUTPUT_3D = "/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/3d"
HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = "/snap/bin/blender"
GLTF = os.path.join(REPO, "node_modules/.bin/gltf-transform")
GLB_INFO = os.path.join(HERE, "glb_info.mjs")
SIMPLIFY_ERROR = "0.01"


def log(msg):
    print(msg, flush=True)


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} falhou: {(r.stderr or r.stdout)[-400:]}")
    return r


def glb_info(path):
    r = sh(["node", GLB_INFO, path], cwd=REPO)
    return json.loads(r.stdout)


def blender_normalize(raw, out, height=1.72):
    r = sh([BLENDER, "-b", "--python", os.path.join(REPO, "scripts/blender/postprocess_character.py"),
            "--", raw, out, "100000000", str(height)])
    m = re.search(r"\[post\]\s*malhas:\s*\d+\s*\|\s*tris:\s*(\d+)", r.stdout)
    if not m:
        raise RuntimeError(f"tris_raw não encontrado no log do Blender: {r.stdout[-300:]}")
    return int(m.group(1))


def validate_contract(final_glb, tris_target, height_target=1.72, size_limit_mb=8):
    info = glb_info(final_glb)
    failures = []
    if "EXT_meshopt_compression" not in info["extensionsUsed"]:
        failures.append("sem EXT_meshopt_compression")
    if "EXT_texture_webp" not in info["extensionsUsed"]:
        failures.append("sem EXT_texture_webp")
    if not info.get("uv0", False):
        failures.append("sem TEXCOORD_0 (UV de textura)")
    if info["tris"] > tris_target * 1.15:
        failures.append(f"tris={info['tris']} > {tris_target}*1.15")
    if height_target > 0 and not (1.70 <= info["height"] <= 1.74):
        failures.append(f"altura={info['height']} fora de [1.70,1.74]")
    size_mb = os.path.getsize(final_glb) / (1024 * 1024)
    if size_mb >= size_limit_mb:
        failures.append(f"tamanho={size_mb:.2f}MB >= {size_limit_mb}MB")
    return {"tris_final": info["tris"], "altura": info["height"],
            "tamanho_mb": round(size_mb, 2), "contract_ok": not failures, "falhas": failures}


def qa_shots(aid, final_glb):
    import shutil
    qa_dir = os.path.join(REPO, "scripts/comfy/qa")
    os.makedirs(qa_dir, exist_ok=True)
    name = f"_qa_{aid}_{os.getpid()}"
    tmp = os.path.join(REPO, "public/models", name + ".glb")
    shutil.copy2(final_glb, tmp)
    try:
        for cam in ("face", "torso", "full"):
            out_png = os.path.join(qa_dir, f"{aid}_{cam}.png")
            args = ["node", "scripts/shot3d.mjs", name, out_png, "--wait=6000"]
            if cam != "full":
                args.append(f"--cam={cam}")
            r = subprocess.run(args, cwd=REPO, capture_output=True, text=True, timeout=600)
            ok = "erros: NENHUM" in (r.stdout or "")
            log(f"    qa {cam}: {'ok' if ok else 'FALHOU'} -> {out_png}")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def finalize_one(raw_path, final_glb, tris, height=1.72, size_limit_mb=8, texture_size=2048, qa=False):
    aid = os.path.basename(final_glb).replace(".glb", "")
    norm = f"/tmp/opencode/fin_{aid}_norm.glb"
    simp = f"/tmp/opencode/fin_{aid}_simp.glb"
    rs = f"/tmp/opencode/fin_{aid}_rs.glb"
    log(f"[{aid}] a) Blender normaliza (sem decimar)...")
    tris_raw = blender_normalize(raw_path, norm, height)
    ratio = min(1.0, max(0.005, round(tris / tris_raw, 5)))
    log(f"[{aid}]    tris_raw={tris_raw} ratio={ratio} (alvo {tris})")
    log(f"[{aid}] b) simplify (--error {SIMPLIFY_ERROR})...")
    sh([GLTF, "simplify", norm, simp, "--ratio", str(ratio), "--error", SIMPLIFY_ERROR])
    log(f"[{aid}] c) resize {texture_size}...")
    sh([GLTF, "resize", simp, rs, "--width", str(texture_size), "--height", str(texture_size)])
    log(f"[{aid}] d) optimize meshopt+webp...")
    os.makedirs(os.path.dirname(final_glb), exist_ok=True)
    sh([GLTF, "optimize", rs, final_glb, "--compress", "meshopt", "--texture-compress", "webp",
        "--texture-size", str(texture_size)])
    metrics = validate_contract(final_glb, tris, height, size_limit_mb)
    metrics.update(tris_raw=tris_raw, ratio=ratio)
    log(f"[{aid}]    tris_final={metrics['tris_final']} altura={metrics['altura']} "
        f"mb={metrics['tamanho_mb']} contract_ok={metrics['contract_ok']} falhas={metrics['falhas']}")
    if qa:
        qa_shots(aid, final_glb)
    return metrics


def asset_kinds():
    try:
        man = json.load(open(MANIFEST))
        return {a["id"]: a.get("kind", "character") for a in man["assets"]}
    except Exception:
        return {}


def update_state(aid, final_glb, metrics):
    try:
        state = json.load(open(STATE))
        if aid in state.get("assets", {}):
            state["assets"][aid].update({
                "final_glb": final_glb,
                "final_mb": metrics["tamanho_mb"],
                "final_tris": metrics["tris_final"],
                "final_contract": metrics["contract_ok"],
            })
            json.dump(state, open(STATE, "w"), indent=1, ensure_ascii=False)
    except Exception as e:
        log(f"[{aid}] aviso: não atualizei o state: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--tris-char", type=int, default=100000)
    ap.add_argument("--tris-prop", type=int, default=5000)
    ap.add_argument("--texture-size", type=int, default=2048, help="máx. de textura (px)")
    ap.add_argument("--raw", default="", help="modo avulso: GLB bruto")
    ap.add_argument("--out", default="", help="modo avulso: GLB final")
    ap.add_argument("--id", default="", help="modo avulso: id (para QA/state)")
    ap.add_argument("--qa", action="store_true")
    args = ap.parse_args()

    kinds = asset_kinds()
    jobs = []
    if args.raw:
        aid = args.id or os.path.basename(args.raw).replace(".glb", "")
        final = args.out or os.path.join(REPO, "public/models/stylized", f"{aid}.glb")
        jobs.append((aid, args.raw, final))
    else:
        state = json.load(open(STATE)) if os.path.exists(STATE) else {"assets": {}}
        wanted = set(args.only.split(",")) if args.only else None
        for aid, info in state.get("assets", {}).items():
            if not info.get("raw_glb"):
                continue
            if wanted and aid not in wanted:
                continue
            jobs.append((aid, os.path.join(COMFY_OUTPUT_3D, info["raw_glb"]),
                         os.path.join(REPO, "public/models/stylized", f"{aid}.glb")))

    if not jobs:
        print("Nenhum asset para processar.")
        sys.exit(0)

    log(f"Processando {len(jobs)} asset(s) | personagens {args.tris_char} tris | props {args.tris_prop} tris")
    ok = fail = 0
    for aid, raw, final in jobs:
        if not os.path.exists(raw):
            log(f"[{aid}] raw não encontrado: {raw} — SKIP")
            fail += 1
            continue
        is_char = kinds.get(aid, "character") == "character"
        tris = args.tris_char if is_char else args.tris_prop
        try:
            m = finalize_one(raw, final, tris, height=1.72 if is_char else 0,
                             size_limit_mb=8 if is_char else 4, texture_size=args.texture_size, qa=args.qa)
            log(f"[{aid}] ✅ CONCLUÍDO")
            if not args.raw:
                update_state(aid, final, m)
            ok += 1
        except Exception as e:
            log(f"[{aid}] ❌ ERRO: {e}")
            fail += 1

    log(f"\n=== FIM: {ok} ok, {fail} com erro ===")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
