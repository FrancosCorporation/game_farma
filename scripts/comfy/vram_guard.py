"""Point-in-time preflight for this host's dedicated AMD GPU; no service mutations."""
import argparse
import math
import re
from pathlib import Path

GIB = 1024 ** 3


def positive_gib(value):
    try:
        number = float(value)
    except (ValueError, TypeError):
        raise argparse.ArgumentTypeError('o mínimo de VRAM deve ser um número positivo finito')
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError('o mínimo de VRAM deve ser um número positivo finito')
    return number


def read_gpu_vram(sysfs_root=Path('/sys/class/drm')):
    """Read (total, used, free) bytes from the largest dedicated DRM card."""
    best_total = 0
    best_used = 0
    for card in Path(sysfs_root).glob('card*'):
        if not re.fullmatch(r'card\d+', card.name):
            continue
        total_path = card / 'device' / 'mem_info_vram_total'
        used_path = card / 'device' / 'mem_info_vram_used'
        if not total_path.is_file():
            continue
        try:
            total = int(total_path.read_text().strip())
            if total == 0:  # Integrated devices without dedicated VRAM.
                continue
            used = int(used_path.read_text().strip())
        except (ValueError, OSError) as error:
            raise SystemExit(f'Não foi possível conferir VRAM de {card.name}; nenhum envio realizado.') from error
        if total < 0 or not 0 <= used <= total:
            raise SystemExit(f'VRAM inconsistente em {card.name}; nenhum envio realizado.')
        if total > best_total:
            best_total, best_used = total, used
    if best_total == 0:
        raise SystemExit('VRAM dedicada não identificada; nenhum envio realizado. Confira a GPU do host.')
    return best_total, best_used, best_total - best_used


def require_free_vram(minimum_gib, sysfs_root=Path('/sys/class/drm')):
    minimum_gib = positive_gib(minimum_gib)
    total, used, free = read_gpu_vram(sysfs_root)
    available_gib = free / GIB
    if available_gib < minimum_gib:
        raise SystemExit(
            f'VRAM insuficiente: {available_gib:.2f} GiB livres; mínimo {minimum_gib:g} GiB. '
            'Aguarde a GPU ficar disponível. Nenhum envio realizado e outros serviços não foram alterados.'
        )
    return total, used, free
