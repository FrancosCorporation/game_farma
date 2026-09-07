# ✅ FarmaCheck Web — Tracker de Implementação

> Fonte da verdade do progresso. Planejamento → [`PLANEJAMENTO_GAME.md`](./PLANEJAMENTO_GAME.md)

---

## M0 — Setup (limpeza + infra)

- [x] Excluir container `ollama-cpu`
- [ ] Subir llama.cpp (ROCm) na GPU com `Qwen3.5-9B-Q8_0.gguf` (endpoint no menu do jogo)
- [x] Scaffold Vite + Three.js (`package.json`, `vite.config.js`, `index.html`)
- [x] Configurar `.opencode/opencode.json`
- [x] Unity removido do projeto (commit de limpeza pendente no git)
- [x] Texturas procedurais via canvas (piso, parede, madeira, letreiro, caixas)

## M1 — Core Engine

- [x] `src/core/factGate.js` (classificação de domínios + KnowledgeState)
- [x] `src/core/scoring.js` (nota 0–100 determinística + estrelas)
- [x] `src/ai/llm.js` (cliente OpenAI-compatible, streaming SSE, 3 tiers)
- [x] `src/ai/prompts.js` (prompt do ator fat-gated + preceptor)
- [x] `src/audio/sfx.js` · `tts.js` (voz 3 níveis) · `stt.js`
- [x] `src/data/cases.js` (11 casos-base: Nelson, Marina + 9 novos)
- [x] `src/core/game.js` (orquestrador/máquina de estados + fases)

## M2 — Cena 3D

- [x] `src/scene/scene.js` (renderer, câmera, luzes, post-processing)
- [x] `src/scene/pharmacy.js` (farmácia procedural: balcão, gôndolas, letreiro, vitrine)
- [x] `src/scene/patient.js` (avatar procedural: rosto, posturas, respiração, blink, walk)
- [x] `src/scene/fx.js` (bloom, poeira, vinheta, transições fade, pulse de red flag)

## M3 — UI/UX

- [x] Menu inicial (cena 3D ao fundo + config LLM + seleção de fases)
- [x] HUD (fase, paciente, pontos, narrar)
- [x] Chat de anamnese (bolhas, chips, typing, contador 0/30)
- [x] Painel de decisão (red flags, condutas, MIPs)
- [x] Debriefing (nota, breakdown, desfecho, preceptor, estrelas)
- [x] Design system (paleta teal/âmbar, glassmorphism, reduced-motion)

## M4 — Fases + Progressão

- [x] `src/core/progression.js` (fases, estrelas, rank, unlock, localStorage)
- [x] Fase 1 · Aprendiz de Balcão (3 casos + tutorial implícito)
- [x] Fase 2 · Plantão da Tarde (5 casos)
- [x] Fase 3 · Emergência Silenciosa (5 casos)
- [x] Modo Expediente Livre (infinito, via `/api/case/next`)
- [x] Persistência `localStorage` + melhor nota por caso

## M5 — Gerador de Casos IA

- [x] `server/index.mjs` (serve `dist/` + `POST /api/case/next`)
- [x] Schema de caso + validação no `fetchNextCase` (cliente/servidor)
- [ ] Prompt de geração estrita (llama.cpp / Qwen3.5-9B) — quando subir o servidor LLM
- [x] Fallback determinístico (`seededPickCaseIds`)

## M6 — Juice & Polish

- [x] Partículas de poeira, pulse de bloom, transições fade
- [x] Acessibilidade (`aria-live`, teclado, foco, contraste)
- [x] Exportar relatório (imprimir/PDF)
- [x] `prefers-reduced-motion` e mobile responsivo

## M7 — QA

- [x] Smoke test via Playwright (`/tmp/opencode/farmacheck_smoke.mjs`)
- [ ] Performance budget refinado (bundle 600 KB → code-split three.js em chunk)
- [x] Teste de fluxo completo: menu → fase → debrief

## M8 — Build / Deploy / Skills

- [x] `npm run build` + servir via `server/index.mjs`
- [ ] Registrar novas skills em `site_corp/banco_skills/`:
  - [x] `threejs-farmacia-procedural-web`
  - [x] `fact-gate-restricao-epistemica`
  - [x] `npc-voice-active-web` (voz pré-gravada + geração na hora)
- [ ] Handoff final (README do jogo + como rodar)

## Pendências não bloqueantes

- Subir llama.cpp na :8081 (ou configurar endpoint no menu) para voz LLM em tempo real
- `npm run voicegen` (com TTS_URL ou TTS_CMD) para gerar as vozes pré-gravadas dos NPCs
- Validação clínica dos casos com a PO (Jhuly) antes de congelar