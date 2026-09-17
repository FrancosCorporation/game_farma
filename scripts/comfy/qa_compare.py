#!/usr/bin/env python3
"""Compara o render FINAL com o render CRU (mesma câmera/pessoa) — detecta facet/regressão.

Uso: python3 scripts/comfy/qa_compare.py <final.png> <raw.png> [--bad <bad.png>]

Métrica: MAE (0-1) em tons de cinza no crop central-superior (rosto).
- MAE(final, cru) BAIXO = final preservou o cru (bom).
- Com --bad: exige MAE(final, cru) < MAE(ruim, cru), senão FALHA (regressão tipo facet).
"""
import argparse
import sys
from PIL import Image, ImageChops, ImageStat


def face_crop(path):
    im = Image.open(path).convert('L')
    w, h = im.size
    return im.crop((int(w * 0.25), int(h * 0.10), int(w * 0.75), int(h * 0.75)))


def mae(a, b):
    d = ImageChops.difference(a, b)
    return sum(ImageStat.Stat(d).mean) / 255.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('final')
    ap.add_argument('raw')
    ap.add_argument('--bad', default='')
    a = ap.parse_args()
    m_final = mae(face_crop(a.final), face_crop(a.raw))
    print(f"MAE(final, cru) = {m_final:.4f}")
    ok = True
    if a.bad:
        m_bad = mae(face_crop(a.bad), face_crop(a.raw))
        print(f"MAE(ruim,  cru) = {m_bad:.4f}")
        ok = m_final < m_bad
    print('VEREDITO:', 'OK (final próximo do cru)' if ok else 'FALHA (final se afastou do cru — possível facet)')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
