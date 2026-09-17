# progress.md — log da sessão (14/09/2026)

> Companheiro de `task_plan.md` (fases/próximos passos) e `findings.md` (descobertas).
> Formato: hora aproximada · evento · arquivos.

## Sessão opencode (tarde/noite de 14/09)

- **~17:00** Retomada do crash da IA anterior (07:28). Reconstruído o estado: diretrizes estilizadas,
  SKILL_BANK, re-tune de luz, capa WIP. Validação: `npm run check` + `vite build` OK; QA completo do jogo
  (`scripts/farmacheck_qa.mjs`) sem erros JS; 3 "fails" do QA explicados (timing/design, não regressão).
- **~18:00** **Capa refeita com fidelidade total à arte**: fatiei os desenhos originais (farmacêutica, play,
  livro, globo, bandeiras) e gerei fundo limpo por inpaint harmônico. Botões DOM com física de clique
  (afunda 7 px medidos), som de clique no `pointerdown`, i18n PT/EN, teclado, reduced-motion.
  Arquivos: `index.html` (#capa), `src/styles.css` (F0), `src/ui/capa.js`, `src/audio/sfx.js`, `public/capa/*`.
- **~19:00** **Ciclo de avaliação com subagente revisor (Nemotron 550B, custo zero):**
  - Rodada 1: **8/10** (inline styles frágeis; `:has()` sem fallback; keyframe em JS; cursor; teclado não verificado).
  - Correções: posicionamento → CSS; `.pressing` via JS; keyframes no CSS; auditoria de teclado
    (Tab: iniciar→refs→PT→EN; Space/Enter ok) + **2 bugs achados no caminho**: fundo tabulável → `inert`;
    `TTS.init()` travando ~9 s o boot → leitura adiada.
  - Rodada 2: **10/10**.
- **~19:30** **Auditoria paralela (subagente explorador):** diretriz de 3 itens (arquivamento do realismo /
  nova identidade visual / limpeza do código) → **CUMPRIDO** nos 3, sem pendências.
- **~19:40** **Deploy no DNS**: rebuild do container (`rebuild.sh`) + 2 correções de infra
  (`.dockerignore`; `server/index.mjs` HOST env). Verificado: 200 em `/game/ufggame/` e nos assets novos.
- **~20:00** **Ajuste de tamanho dos botões** (pedido do PO: ≈5 px maiores que a arte): boxes encolhidos
  (455×129 / 382×97 / 410×97) + fontes/margens escaladas 0.9485×. QA da capa: geometria ok, teclado ok.
- **~20:10** **Bugs de gameplay consertados** (pedidos do PO):
  walk-in duplo do paciente; **andar livre WASD restaurado** (zonas 1/2/3 mantidas); autofocus do chat removido;
  hint de controles atualizado (`index.html`). Testes: posição da câmera confirmando W/A + zona 2 + digitação não anda.
- **~20:20** **Pipeline de personagens**: ComfyUI ativo; llama parado (VRAM); **SDXL gerou a referência**
  Pixar `ref_pixar_777_00001_.png` (~8 min). Reescrevi o conversor `submit_wf.py` (o antigo se perdeu no /tmp)
  e corrigi 5 getchas de conversão UI→API (ver `findings.md` §1.2).
- **~20:50** Primeiras submissões falharam rápido (validação); com o log do serviço, corrigido o mapeamento.
- **~21:00** **Job TRELLIS 2 rodando** (`e226cec3-...`) — em execução no momento deste log.
  **NÃO interromper.** Ao terminar: pegar o `.glb` em `output/3d/`, religar `llama-cpp`, pós-processar (Fase G).

## Estado de processos no fim da sessão

| Processo | Estado |
|---|---|
| ComfyUI (systemd :8188) | ✅ ativo — job TRELLIS em execução |
| `llama-cpp` (docker) | ⏸️ parado (protocolo de VRAM) — **religar depois do job** |
| `game_farma` (docker, DNS) | ✅ no ar com fases A+B (capa fiel) — **faltam C+D** (botões menores + fixes de gameplay) |
| Preview local 4174 | opcional (subir com `setsid --fork ... vite preview`) |

## Pendências imediatas (para quem retomar)

1. **Job TRELLIS**: verificar `GET http://127.0.0.1:8188/queue` → ao terminar, procurar `*.glb` novo em
   `/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/3d/`.
2. `docker start llama-cpp` (juiz de visão volta a funcionar).
3. Blender headless: decimar ~15k tris, escala 1.7 m, pivô Y=0 → exportar GLB (ver `SKILL_BANK/SKILL_A`).
4. Screenshot (`scripts/shot3d.mjs`) + juiz (`scripts/vision_judge.py`) → mostrar ao PO.
5. Deploy das fases C+D: `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh`.
6. (Após aprovação do personagem-teste) gerar 2–3 identidades e substituir **em leva** — nunca item a item.

## Arquivos tocados nesta sessão (git status resumido)

```
 M index.html            (capa + hint de controles)
 M src/styles.css        (bloco F0 da capa)
 M src/ui/capa.js        (inert, pressing, som)
 M src/ui/i18n.js?       (não tocado nesta sessão)
 M src/audio/sfx.js      (SFX.click)
 M src/audio/tts.js      (init não-bloqueante)
 M src/core/game.js      (sem autofocus do chat)
 M src/main.js           (mountAvatar sem enter duplo; __farmacheck.camera)
 M src/scene/pov.js      (andar livre WASD)
 M server/index.mjs      (HOST env)
?? .dockerignore          (novo)
?? public/capa/spr_*.webp + inicio_game_clean.webp (novos)
?? task_plan.md, findings.md, progress.md (este handoff)
```
