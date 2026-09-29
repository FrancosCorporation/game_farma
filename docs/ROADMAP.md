# ROADMAP & estrutura de trabalho — FarmaCheck (game_farma)

> **Fonte única de coordenação.** Atualizado **26/09/2026** (sessão de dinâmica/jogabilidade).
> Complementa (não substitui): `progress.md` (log append-only), `findings.md` (armadilhas),
> `docs/Escopo_official_v4_novo_game_farma.md` (escopo), `docs/DIRETRIZES_ARTE_ESTILIZADA.md` (arte),
> `MASTER_PLAN.md` (pipeline de assets — válido só nas partes não superadas pela revisão de 14/09).

## 0. Regras de colaboração (multi-sessão / multi-agente)

1. **Um dono por arquivo por rodada** — mapa em §3. Precisa tocar arquivo de outra cadeia?
   Registre no `progress.md`, avise o dono e valide depois.
2. `progress.md` e `findings.md` são **append-only** — nunca reescreva/limpe blocos de outra sessão.
3. **Deploy só com aval do PO**, via `bash scripts/deploy.sh` (healthcheck + rollback automático).
   Sessão de conteúdo/dinâmica **não publica** por conta própria.
4. Antes de dizer "pronto": rode **`npm run qa:all`** (ou o gate da sua área, §5) e cite a evidência
   (comando + resultado). Sem evidência = não está pronto.
5. **Não commite alterações de outra sessão** (corrida de index). Commite por paths específicos:
   `git add src/core/game.js src/core/progression.js src/core/achievements.js …`
6. Cache do browser mente: verificação visual pós-build exige `clearBrowserCache`
   (runbook em `progress.md` Rodada 10 / `findings.md`).
7. `*.tmp.mjs` na raiz são **descartáveis**; quando um deles vira critério de aceite,
   promova para `scripts/` com nome estável (ex.: `qa_walk.tmp.mjs` → `scripts/qa_walk.mjs`).

## 1. Estado atual por área (26/09/2026)

| Área | Estado | Evidência |
|---|---|---|
| Boot/capa/cena | ✅ estável | `npm run qa:boot`, `npm run qa` 18/18 |
| Avatar/Ana (W1) | 🔄 **em cirurgia pela sessão paralela**: walk mocap (v13) + nova fonte `ana_kimodo_walk.glb` sendo gerada; idle/braço com scripts `fix_ana_*` | `public/models/ana_kimodo_walk.glb` (22:22), `qa_walk_angles.tmp.mjs`; PO relatou passada longa/câmera lenta (`[patient] cadência ×0.56`) |
| Dinâmica/jogabilidade (W2) | ✅ **v1 entregue**: combo ×1,0–2,0, 12 conquistas, rank, checklist de anamnese, atalhos 1/2/3, chips consumidos | `npm run test:logica` (48 asserts), `npm run qa:dynamics` 23/23 |
| Conteúdo clínico (W3) | ⏳ 11 casos escritos, **pendente validação da PO**; scoring v2 pronto | `src/data/cases.js`, `src/core/scoring.js` |
| IA/LLM (W4) | ✅ modo plantão determinístico sem IA; IA opcional (llama-server) + tradução PT→EN | `src/ai/*`, `npm run qa` sem erros JS |
| Infra/deploy (W5) | ⚠️ dist local ≠ remoto (outra sessão republicou 26/09 00:36); `public/models/` já enxuto (24 MB — limpeza dos `_raw_*` feita) | `curl -sI .../models/ana_coriza.glb` |
| QA/estrutura (W6) | ✅ gates + `qa:all` (um comando) + testes de regra em node puro | `scripts/test_dynamics.mjs`, `qa_dynamics.mjs`, `qa_all.mjs` |

## 2. Workstreams

| # | Workstream | Objetivo | Dono | Gate da área |
|---|---|---|---|---|
| **W1** | Avatar/Ana (walk, idle, braço, GLB) | andar natural (passada e cadência humanas, sem skating) e idle sem artefato | sessão paralela | `qa_walk_angles.tmp.mjs` (+ medidor de passada, §5) |
| **W2** | Dinâmica/jogabilidade | loop com incentivo (combo/rank/conquistas), feedback de anamnese, atalhos e legibilidade do progresso | esta sessão | `npm run test:logica` + `npm run qa:dynamics` |
| **W3** | Conteúdo clínico | 11 casos validados pela PO (doses, contraindicações, desfechos) | **PO (Jhuly)** | revisão clínica + `npm run qa` (fluxo) |
| **W4** | IA/LLM & idiomas | plantão determinístico impecável; IA opcional e bilíngue sem vazar segredo | a definir | `npm run qa` (sem erros JS) + revisão de prompts |
| **W5** | Infra/deploy | dist ↔ remoto coerentes, deploy com rollback, CI | a definir | `bash scripts/deploy.sh` + healthcheck 200 |
| **W6** | QA/estrutura | gates reprodutíveis por área + um comando para tudo | esta sessão | `npm run qa:all` |

## 3. Mapa de donos de arquivo (anti-colisão)

| Caminho | Cadeia | Regra |
|---|---|---|
| `src/scene/patient.js`, `src/scene/pov.js`, `src/scene/pharmacy.js`, `public/models/*.glb`, `scripts/fix_ana_*.mjs` | W1 | **só a sessão W1**; W2 não toca |
| `src/core/game.js` | W2 | W4 pode precisar (i18n/prompts) → combinar antes |
| `src/core/progression.js`, `src/core/achievements.js`, `scripts/test_dynamics.mjs`, `scripts/qa_dynamics.mjs` | W2 | exclusivo |
| `src/core/scoring.js`, `src/core/factGate.js`, `src/data/cases*.js` | W3 | mudança só com aval da PO |
| `src/ui/i18n.js`, `index.html`, `src/styles.css` | W2 (UI) | **append em blocos rotulados** (`---- Dinâmica de plantão ----`) |
| `src/ai/*`, `src/audio/*` | W4 | avisar W2 se mexer em texto de UI |
| `server/`, `Dockerfile`, `docker-compose.yml`, `scripts/deploy.sh`, `.github/workflows/` | W5 | deploy só com PO |
| `docs/ROADMAP.md` (este), `scripts/qa_all.mjs`, `scripts/check-syntax.mjs` | W6 | atualizar o estado em §1 ao fechar rodada |
| `progress.md`, `findings.md` | todos | **append-only** |

## 4. Backlog priorizado (com critério de aceite)

### P0 — destrava o jogo / decide entrega
| # | Item | Dono | Critério de aceite |
|---|---|---|---|
| 1 | **Passada/cadência da Ana** (PO: "pé muito longe do outro") | W1 | passo in-game **0,50–0,60 m**, cadência **95–120 passos/min**, RATIO implicado/extras **0,9–1,1** (sem skating), pé não penetra o chão (toe minY ≥ −0,01 m), `qa_walk_angles` verde |
| 2 | **dist ↔ remoto coerentes** | W5 | `sha256` do GLB remoto = `dist/`, healthcheck 200 em `/game/ufggame/`, registro no `progress.md` |
| 3 | **Validação clínica dos 11 casos** | PO (Jhuly) | checklist assinado por caso (dose, contraindicação, desfecho, DSF) — congela `cases.js` |

### P1 — mais jogo (dinâmica)
| # | Item | Dono | Critério de aceite |
|---|---|---|---|
| 4 | **Metas por fase + fila de clientes** | W2 | HUD mostra `casos feitos/total` da fase; meta cumprida → desbloqueio/recompensa; caso avança/termina sem travar; `qa:dynamics` estendido |
| 5 | **Pressão de tempo / paciência do cliente** | W2 | contador visível na chegada; desfecho "cliente desiste" registrado no scoring (nova métrica) e no debrief; `npm run qa` continua verde |
| 6 | **Promover gates `tmp` → versionados** | W6 | `scripts/qa_walk.mjs` e `scripts/qa_walk_stride.mjs` (a partir dos `tmp_*`), entram no `qa:all` |
| 7 | **Anti-vazamento de segredos pela IA** | W4 | 3 casos com IA ligada sem `segredo` no texto; guarda `guardLeaks` com teste automatizado |

### P2 — polimento
| # | Item | Dono | Critério de aceite |
|---|---|---|---|
| 8 | Onboarding guiado (dicas por passo do 1º caso) + conquista "fase completa" | W2 | fluxo do 1º caso guiado; `qa:dynamics` cobre |
| 9 | CI de verdade (`check + test:logica + build` em push/PR) | W5 | workflow verde no GitHub Actions (`.github/workflows/qa.yml` existe — conferir cobertura) |
| 10 | Painel de QA no menu (modo dev, `?dev=1`) | W6 | últimos resultados dos gates visíveis, sem custo em produção |

## 5. Gates de validação

| Comando | Cobre | Precisa de servidor | Tempo aprox. |
|---|---|---|---|
| `npm run check` | sintaxe de `src/`, `server/`, `scripts/` (62 arq.) | não | 2 s |
| `npm run test:logica` | regras da dinâmica: combo, pontos, conquistas, rank, persistência (48 asserts) | não | 1 s |
| `npm run build` | bundle Vite (dist/) | não | 6–9 s |
| `npm run qa:boot` | capa clicável → menu → cena → anamnese (desktop + celular) | sim | ~2 min |
| `npm run qa:dynamics` | painel do menu, HUD de combo, chips, cobertura, atalhos, debrief | sim | ~1,5 min |
| `npm run qa` | fluxo completo: capa → menu → fase → chat → bulário/TLAC → decisão → debrief (18 checks) | sim | ~3–5 min |
| **`npm run qa:all`** | **tudo acima em sequência + resumo com tempos** (`--fast` = só estáticos) | sim (p/ os 3 de browser) | ~8 min |

**Medidor de passada (W1)**: `node tmp_stride_ingame.tmp.mjs [URL]` — passo/straddle/swing em
metros de mundo + cadência + foot slide, dirigindo o mixer deterministicamente (não depende do
fps do headless). `node tmp_walk_diag2.mjs [glb]` faz o mesmo offline (FK), comparando clips.

## 6. Armadilhas conhecidas (top-6 — detalhes em `findings.md`)

1. **SwiftShader** no headless: 2–3 fps → gates de browser medem sanidade, não performance.
2. **Cache do browser** mascara correções de GLB: limpar cache antes de validar visualmente.
3. **Unidades do rig**: bones em cm com `Armature.scale=0.01`, mesh em metros; `[patient]` loga
   `size`/`scale` — conferir antes de concluir qualquer coisa de escala.
4. **Blender não mapeia `scene` props → `asset.extras`** (walkAdvance/walkSpeed exigem patch binário).
5. **`progress.md`/`findings.md` append-only** — reescrever apaga o histórico das outras sessões.
6. **Fila de sessões**: dois agentes no mesmo repo → conferir `git status`/`log` antes de commitar
   e nunca `git add -A`.
