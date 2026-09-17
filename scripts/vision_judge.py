#!/usr/bin/env python3
"""Juiz de visão — FarmaCheck pipeline 3D realista.

Envia um screenshot (jogo ou preview GLB) para o modelo de visão local
(Qwen3.8-9B multimodal, llama-cpp :8081) e pede avaliação crítica de
proporções/face/material/iluminação — o loop "melhorar → print → julgar".

Uso: python3 scripts/vision_judge.py <imagem.png> [prompt-customizado]
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

ENDPOINT = "http://127.0.0.1:8081/v1/chat/completions"
MODEL = "Qwen3.8-9B"

DEFAULT_PROMPT = (
    "Você é um diretor de arte de jogos 3D (referência: personagens mid-poly "
    "estilo GTA V). Descreva com detalhe o que está visível na imagem e seja "
    "CRÍTICO: 1) proporções do corpo e da cabeça; 2) qualidade do rosto "
    "(olhos, nariz, boca, cabelo); 3) materiais/pele (plástico? convencente?); "
    "4) iluminação e integração na cena; 5) liste os 3 maiores defeitos e a "
    "sugestão concreta para cada um. Termine com um veredito curto: "
    "REALISTA / QUASE / CARTOON / RUIM."
)


def main():
    img_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/modelo.png"
    prompt = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PROMPT

    with open(img_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}],
        "max_tokens": 1500,
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            d = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code}: {e.read().decode()[:500]}")
        sys.exit(1)
    except Exception as e:
        print(f"ERRO: {type(e).__name__}: {str(e)[:300]}")
        sys.exit(1)

    msg = d["choices"][0]["message"]
    print(f"# Juiz de visão ({time.time()-t0:.1f}s)\n")
    print("=== content ===")
    print(msg.get("content") or "(vazio)")
    rc = msg.get("reasoning_content")
    if rc:
        print("\n=== reasoning (resumo) ===")
        print(rc[:1200])


if __name__ == "__main__":
    main()