#!/usr/bin/env python3
"""Validador de personagens GLB — FarmaCheck.

Checa (via JSON+BIN do GLB, sem abrir o Blender):
  1. clips: Idle/Pain/Weakness/Discomfort/Embarrassed
  2. hierarquia de partes animadas (pelvis/torso/head/armL/armR/legL/legR)
  3. orçamento: tris < 30k, tamanho < 8 MB, altura ~1.7 m
  (A geometria fina do rosto é validada no build, em gen_characters.py —
   as partes fundidas viram 1 mesh por grupo no GLB.)
Uso: python3 validate_character.py <file.glb> [<file.glb> ...]
"""
import json
import struct
import sys

WANT_CLIPS = {'Idle', 'Pain', 'Weakness', 'Discomfort', 'Embarrassed'}
PARTS = {'pelvis', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'}


def parse(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'glTF', f'{path}: não é GLB'
    ln = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + ln]), len(d)


def tris_of(g):
    total = 0
    for m in g['meshes']:
        for p in m['primitives']:
            total += g['accessors'][p['attributes']['POSITION']]['count'] // 3
    return total


def validate(path):
    errs, warns = [], []
    g, size = parse(path)
    names = {n.get('name', '') for n in g['nodes']}

    clips = {a.get('name', '') for a in g.get('animations', [])}
    missing = WANT_CLIPS - clips
    if missing:
        errs.append(f'clips faltando: {sorted(missing)}')

    missing_parts = PARTS - names
    if missing_parts:
        errs.append(f'partes faltando: {sorted(missing_parts)}')

    # altura: eixo Y do glTF (cima), bbox global aproximada (translação + accessor)
    ys = []
    for n in g['nodes']:
        if 'mesh' not in n:
            continue
        acc = g['accessors'][n['mesh'] and g['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']]
        t = n.get('translation', [0, 0, 0])
        ys += [acc['min'][1] + t[1], acc['max'][1] + t[1]]
    height = max(ys) - min(ys) if ys else 0
    if not (1.2 < height < 2.2):
        warns.append(f'altura ~{height:.2f} m (esperado ~1.7)')

    tris = tris_of(g)
    if tris > 30000:
        errs.append(f'{tris} tris > 30k')
    if size > 8 * 1024 * 1024:
        errs.append(f'{size // 1024} KB > 8 MB')

    status = 'OK' if not errs else 'FALHA'
    print(f"{status} {path.split('/')[-1]}  clips={len(clips)} tris={tris} size={size // 1024}KB altura={height:.2f}m")
    for e in errs:
        print('   ✗', e)
    for w in warns:
        print('   ⚠', w)
    return not errs


if __name__ == '__main__':
    ok = all(validate(p) for p in sys.argv[1:])
    sys.exit(0 if ok else 1)
