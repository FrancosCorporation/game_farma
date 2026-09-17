#!/usr/bin/env python3
"""Finaliza o ComfyUI e devolve a RAM ao sistema (sem sudo).

Uso: python3 scripts/comfy/free_ram.py [--threshold-gb 8]

- POST /free {unload_models, free_memory} -> descarrega modelos e libera VRAM/cache
- Mede RSS+swap do serviço; se continuar acima do limite -> kill -9
  (systemd Restart=on-failure ressuscita o serviço limpo)
- Relatório antes/depois (RSS, swap do processo, VRAM da GPU)

Usar SEMPRE que terminarem os processos e não houver mais trabalho com o ComfyUI.
"""
import argparse
import json
import os
import subprocess
import time
import urllib.request

COMFY = "http://127.0.0.1:8188"
VRAM_USED = "/sys/class/drm/card1/device/mem_info_vram_used"


def http(path, payload=None, timeout=30):
    url = COMFY + path
    if payload is None:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read()
            return json.loads(body) if body else None
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        return json.loads(body) if body else None


def mainpid():
    return subprocess.run(["systemctl", "show", "comfyui", "-p", "MainPID", "--value"],
                          capture_output=True, text=True).stdout.strip()


def stats(pid):
    rss = swap = 0
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    rss = int(line.split()[1]) // 1024
                elif line.startswith("VmSwap:"):
                    swap = int(line.split()[1]) // 1024
    except Exception:
        pass
    vram = 0
    try:
        with open(VRAM_USED) as f:
            vram = int(f.read()) // (1024 * 1024)
    except Exception:
        pass
    return rss, swap, vram


def ready(timeout=10):
    try:
        http("/system_stats", timeout=timeout)
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold-gb", type=float,
                    default=float(os.environ.get("FREE_RAM_THRESHOLD_GB", "8")),
                    help="RSS acima disso após /free dispara restart do serviço "
                         "(configurável pela env FREE_RAM_THRESHOLD_GB; default 8)")
    args = ap.parse_args()

    pid = mainpid()
    rss, swap, vram = stats(pid)
    print(f"[free-ram] antes: RSS {rss} MB | swap {swap} MB | VRAM {vram} MB (pid {pid})")

    if ready():
        try:
            http("/free", {"unload_models": True, "free_memory": True}, timeout=60)
            print("[free-ram] /free ok (unload_models + free_memory)")
        except Exception as e:
            print(f"[free-ram] /free falhou: {e}")
        time.sleep(5)
        rss, swap, vram = stats(pid)
        print(f"[free-ram] pós-/free: RSS {rss} MB | swap {swap} MB | VRAM {vram} MB")
    else:
        print("[free-ram] ComfyUI não responde — indo direto para restart")

    if rss > args.threshold_gb * 1024:
        print(f"[free-ram] RSS ainda alto (> {args.threshold_gb:.0f} GB) — reiniciando (kill -9)")
        subprocess.run(["pkill", "-P", pid], check=False)
        time.sleep(1)
        subprocess.run(["kill", "-9", pid], check=False)
        t0 = time.time()
        while time.time() - t0 < 180:
            time.sleep(5)
            if ready():
                break
        npid = mainpid()
        time.sleep(5)
        rss2, swap2, vram2 = stats(npid)
        print(f"[free-ram] serviço de volta em {round(time.time()-t0)}s (pid {npid}): "
              f"RSS {rss2} MB | swap {swap2} MB | VRAM {vram2} MB ✓")
    else:
        print("[free-ram] RAM liberada sem restart ✓")


if __name__ == "__main__":
    main()
