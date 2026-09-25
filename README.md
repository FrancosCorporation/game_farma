# game_farma — FarmaCheck

Simulador web 3D (Three.js/Vite) de atendimento farmacêutico. O jogo roda **sem IA**
(modo plantão determinístico) e melhora se houver um servidor LLM OpenAI-compatible
local — ex.: `llama-server` em `http://127.0.0.1:8081/v1` (configurável no menu).

## Rodar (desenvolvimento, sem build)

```bash
npm install
npm start          # Vite em http://127.0.0.1:5173
```

## Rodar o build de produção (com API do Expediente Livre)

```bash
npm run build      # gera dist/
npm run serve      # server/index.mjs em http://127.0.0.1:4174
```

`server/index.mjs` serve o `dist/` **e** expõe `POST /api/case/next` (caso sorteado
para o modo Expediente Livre). Variáveis: `PORT` (default 4174) e `HOST` (default
127.0.0.1; em container use `0.0.0.0`).

## Rodar com Docker

```bash
docker compose up --build      # http://localhost:4174
```

O container é `game_farma_local` (porta host 4174) — o nome `game_farma` pertence ao
deploy de produção via Caddy, para não colidir.

## Verificações

```bash
npm run check      # sintaxe de todos os módulos (src/, server/, scripts/)
npm run qa:boot    # gate de boot: capa clicável + cena + anamnese  (precisa do jogo servido)
npm run qa         # QA completo: capa → menu → fase → chat → decisão → debriefing
npm run verify     # check + build
```

Os gates de navegador exigem o jogo servido (uma das duas opções acima) e usam
Playwright/Chromium headless. Sem GPU real o WebGL cai para SwiftShader: os tempos
desses testes são piso de sanidade, não benchmark.

