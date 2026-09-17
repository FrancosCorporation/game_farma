# ANÁLISE — Neo_Studio_V2 (MoodPixel) para o game_farma (FarmaCheck)

**Data:** 2026-09-13 · **Fonte:** https://github.com/MoodPixel/Neo_Studio_V2
**Veredito:** ✅ **ÚTIL — como fábrica de assets (adjacente ao jogo), NÃO dentro do runtime.**

## O que é o Neo Studio V2
Workspace criativo local-first (Python/FastAPI + web UI, GPL-3.0, ativo — último push 31/08/2026) que orquestra SEUS backends:
- **Imagem:** ComfyUI / Forge Neo / Grok Imagine — geração, inpaint, upscale, ControlNet, LoRA stack, ADetailer.
- **Vídeo:** pipelines ComfyUI (LTX, WAN) — img2vid, interpolação, upscale.
- **Voz (Neo Voice Engine):** TTS local com Chatterbox / **Qwen3-TTS** (isolado em venv próprio), clone de voz, diálogo multi-speaker, batch.
- **Prompt & Captioning:** prompt builder, biblioteca de prompts, caption em lote.
- **Roleplay + Assistant com memória/RAG:** forja de personagens, cenas, histórias, continuidade.

⚠️ Ele **não traz modelos nem backends** — é um painel de controle. Windows-first (`.bat`), mas roda em Linux via venv manual.

## O que o game_farma já tem (e onde o Neo encaixa)

| Necessidade do FarmaCheck | Estado hoje | Onde o Neo Studio ajuda |
|---|---|---|
| Personagens/props 3D (.glb) | TRELLIS.2 local (`trellis_2_bf16.safetensors`, 9.8GB) + Blender MCP `:9876` + skill `SKILL_A_PIPELINE_3D_UNIVERSAL` | **Referências/conceitos 2D** para alimentar img→3D (Neo gera a imagem de referência via ComfyUI; TRELLIS converte em 3D) |
| Texturas PBR | pipeline Blender (decimação/materiais) | **Geração de texture sheets / variações** via workspace de Imagem |
| Vozes de NPC (pt-BR) | `npc-voice-active-web` (T2 OpenAI-compat, cache) | **Voice Engine com Qwen3-TTS/Chatterbox** pode virar o backend T2, com timbres por personagem e batch |
| Narrativa/diálogos NPC | fact-gate (KnowledgeState) | **Roleplay/Assistant com memória** para prototipar falas e consistência de personagem offline |
| Cutscenes/vídeos curtos | — | Vídeo LTX/WAN via ComfyUI (se instalado) |

## Ressalvas (importantes!)
1. **Disputa de GPU:** RX 6750 XT tem 12GB e o protocolo do projeto (`ideia_3d_fast_ia_learn.md`) já exige pausar containers/descarregar llama para 3D. Neo Studio + ComfyUI vão competir pela mesma VRAM — usar **fora** das sessões de geração 3D ou com o mesmo protocolo de isolamento.
2. **Windows-first:** scripts `.bat` não servem; instalação em Linux = venv manual (`requirements.txt`, `uvicorn`). Nada impeditivo, mas é setup dedicado.
3. **Não entra no runtime do jogo:** é ferramenta de produção (asset factory), como o Blender MCP. Nada de acoplar ao `src/` ou ao container `game_farma`.
4. **Janela de qualidade:** repo pequeno (5★, 1 Issue, 95 commits) — projeto jovem; usar isolado e versionado (`git clone` + tag/commit travado).

## Recomendação prática
1. Clonar em `/home/servidor/Git/Neo_Studio_V2` (fora do game_farma), venv em `.venv`, rodar com uvicorn na porta livre (ex.: 7865).
2. Conectar ao **ComfyUI existente** do ambiente (o site_corp já tem pipeline ComfyUI — ver `PLANO_COMFYUI_OTIMIZADO.md`).
3. Usar 1º para: referências de personagem (img→TRELLIS), texture sheets e vozes NPC (Qwen3-TTS pt-BR).
4. Respeitar o protocolo de VRAM do `ideia_3d_fast_ia_learn.md` em qualquer sessão de geração.

## Próximo passo (fila do usuário)
Processar o vídeo https://www.youtube.com/watch?v=T270nV_ANKg (possível tutorial do Neo Studio) e transformar em skill no banco, cobrindo: instalação Linux + conexão com os backends locais + os 3 usos acima.
