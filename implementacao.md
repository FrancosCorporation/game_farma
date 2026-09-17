# Resumo — Geração 3D ComfyUI (FarmaCheck)

## ✅ O que foi feito

### Infraestrutura ComfyUI arrumada
| Item | Status |
|---|---|
| Serviço ComfyUI | `sudo systemctl restart comfyui.service` |
| Workflow Trellis 2 bf16 | ✅ **FUNCIONA** no gfx1031 (proved empiricamente) |
| Workflow Pixal3D bf16 | ❌ **QUEBRA** (int8 convrot: `torch._int_mm` incompatível gfx1031) |
| Modelos bf16 baixados | `pixal3d_bf16.safetensors` (11GB), `trellis_2_bf16.safetensors` (10.3GB) |

### Auto-classes no conversor
Editei `/tmp/opencode/submit_wf.py` pra trocar automaticamente:
- `int8_convrot` → `bf16` (agora sempre usa bf16, que funciona)
- `\\` → `/` (corrigir caminhos)
- SeedState a partir de `properties.seedState`

### Geração que FUNCIONOU
| Saída | Tamanho | Descrição |
|---|---|---|
| `trellis2_00001.glb` | 6MB | Malha 3D real (100k vértices = ~50k tris) |
| `trellis2_00002.glb` | 6MB | Mesh de teste gerada com sucesso |
| `trellis2_00002.glb` (mais recente) | 6.0MB | ✅ última gerada hoje |

**Arquivos finais:** `/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/3d/`

---

## ❌ O que deu errado (e já resolvido)
| Erro | Causa | Resolução |
|---|---|---|
| `HIP out of memory` | CPU VAE na RAM + swap cheio | `sed 's/--cpu-vae/--fp16-vae'` + `-cpu-vae` removido |
| `HIPBLAS_STATUS_INVALID_VALUE` | Modelo int8 quebra no gfx1031 | Usar só `bf16` (que funciona) |
| Fila travada com 22GB RAM | job bumbo preso | `systemctl restart comfyui.service` |

---

## 📁 Arquivos importantes (Onde estão)

```
/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/models/diffusion_models/3D/pixal3d_bf16.safetensors        ← 11GB (BF16 funciona)
/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/models/diffusion_models/3D/trellis_2_bf16.safetensors      ← 10GB (BF16 funciona)
/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/models/diffusion_models/3D/pixal3d_int8_convrot.safetensors ← ❌ Não use
/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/models/diffusion_models/3D/trellis_2_int8_convrot.safetensors ← ❌ Não use
/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/3d/           ← arquivos .glb gerados
/home/servidor/Git/game_farma/SKILL_BANK/                                  ← bagunças do projeto
/tmp/opencode/submit_wf.py                                                  ← script do ComfyUI pronto
```

---

## ⚙️ Como usar a partir daqui

Para gerar um 3D do zero (você mesmo chama):

```bash
cd /tmp/opencode
nohup python3 submit_wf.py \
  "/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/user/default/workflows/1. Trellis 2 - Image to 3D Model - Low VRAM.json" \
  ref_test.png nome_do_job > /tmp/opencode/desenho.log 2>&1 &
```

Ou no próximo opencode: reconecta no ComfyUI BT e bora.

---

## 📋 Próximos passos (se você quiser)

Caminho ideal depois do teste básico:
1. 🔹 **Passar pro Blender** o `.glb` gerado (importar, ver a malhha) — já DEMONSTRADO no script acima
2. 🔹 **Remesh otimizado** caso queira tris mais contados (abaixo de 50k pra game)
3. 🔹 **Textura e UP** — os modelos bf16 não incluem textura nativa de alta resolução
4. 🔹 **Animar** — pelo Blender usando armadura (isso é trabalho posterior)

**Diferença:** Trellis 2 (rápido) vs Pixal3D (mais detalhes, mas o int8 dele *не quebrada na gfx1031*)

---

*Criado em `/home/servidor/Git/game_farma/implementacao.md` — precisa chamar: passar o caminho completo ao abrir outro opencode.*
