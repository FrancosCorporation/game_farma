Excelente material de referência — dá para extrair um escopo web muito sólido. Antes do código, duas decisões de arquitetura que tomei como arquiteto:

**Por que Vanilla JS (e não React/R3F):**
1. **Câmera fixa + overlay** — a cena 3D é um "palco" estático; não há Nada que justifique reconciliation do React sobre o canvas.
2. **O "motor manda, a IA atua" (pilar do GDD v3.0) vira código puro**: Fact Gate, KnowledgeState e ScoreEngine são módulos JS determinísticos — sem estado React intermediando.
3. **Acessibilidade real**: chat como DOM nativo (`aria-live`) é o requisito do WCAG — com React isso fica igual, mas com mais peso.
4. **Domínio da equipe + carga**: bundle menor, zero dependência de framework para evoluir.

**O que preservo da v3.0:** Fact Gate (a LLM **nunca vê** fato bloqueado → não vaza), 3 tiers de voz (LLM local → nuvem → templates determinísticos), nota 95% determinística, e a **armadilha clínica** do escopo novo (cliente pede remédio que agrava a condição oculta).

---

## Estrutura do Projeto

```
farmacheck/
├── package.json
├── vite.config.js            # proxy p/ servidor LLM local (evita CORS em dev)
├── tailwind.config.js
├── postcss.config.js
├── index.html                # canvas 3D + overlay de UI (chat, decisão, debriefing)
└── src/
    ├── main.js               # bootstrap
    ├── styles.css
    ├── core/
    │   ├── game.js           # orquestrador / máquina de estados
    │   ├── factGate.js       # classificador de domínios + KnowledgeState
    │   └── scoring.js        # nota determinística (0–100)
    ├── scene/
    │   ├── scene.js          # renderer, câmera 1ª pessoa, luzes, loop
    │   ├── pharmacy.js       # farmácia procedural (balcão, gôndolas, caixas)
    │   └── patient.js        # NPC procedural + hook p/ modelos .glb futuros
    ├── ai/
    │   ├── llm.js            # cliente OpenAI-compatible com streaming
    │   └── prompts.js        # prompt do ator (fat-gated) + preceptor
    ├── audio/
    │   ├── sfx.js            # beep de red flag, ding, buzz (WebAudio)
    │   ├── tts.js            # speechSynthesis (chunked)
    │   └── stt.js            # SpeechRecognition (Ctrl+M)
    └── data/
        └── cases.js          # casos clínicos + hook do gerador no servidor
```

---

## 1. Configuração do Projeto

**`package.json`**
```json
{
  "name": "farmacheck",
  "private": true,
  "version": "0.1.0",
  "description": "FarmaCheck — O Desafio da Anamnese (simulador web 3D de farmácia)",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173"
  },
  "dependencies": {
    "three": "^0.169.0"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.10"
  }
}
```

**`vite.config.js`**
```js
import { defineConfig } from 'vite';

// Em dev, o proxy elimina CORS: o jogo chama /llm/v1/...
// e o Vite repassa ao servidor OpenAI-compatible de vocês.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/llm': {
        target: process.env.LLM_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ''),
      },
    },
  },
  build: { target: 'es2022' },
});
```

**`tailwind.config.js`**
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  theme: { extend: {} },
  plugins: [],
};
```

**`postcss.config.js`**
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

---

## 2. Interface (HTML + Tailwind) — Canvas 3D + Overlay

**`index.html`**
```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FarmaCheck — O Desafio da Anamnese</title>
  <meta name="description" content="Simulador educacional de atendimento farmacêutico. Conteúdo fictício, fins didáticos." />
</head>
<body class="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
  <noscript><p class="p-8">Este jogo requer JavaScript habilitado.</p></noscript>

  <!-- Cenário 3D (fundo) -->
  <canvas id="scene3d" class="fixed inset-0 h-full w-full" aria-hidden="true"></canvas>

  <!-- Camada de UI (primeiro plano) -->
  <div id="ui" class="fixed inset-0 pointer-events-none">
    <div class="vignette"></div>

    <!-- HUD -->
    <header id="hud" class="absolute top-0 inset-x-0 flex items-center justify-between gap-3 px-4 py-2
                           bg-slate-900/70 backdrop-blur border-b border-white/10 pointer-events-auto">
      <h1 class="font-semibold tracking-wide text-sm sm:text-base">
        FarmaCheck <span class="text-teal-300 font-normal">· O Desafio da Anamnese</span>
      </h1>
      <div class="flex items-center gap-3 text-sm">
        <span id="hud-paciente" class="text-slate-300 hidden sm:inline">Expediente encerrado…</span>
        <span id="hud-fase" class="px-2 py-0.5 rounded-full bg-teal-900/70 text-teal-200 border border-teal-400/30 text-xs">—</span>
        <span id="hud-score" class="text-slate-400 text-xs">Pontos 0</span>
        <button id="btn-tts" aria-pressed="true" title="Narrar falas em voz alta" class="btn-ghost text-xs">Narrar</button>
      </div>
    </header>

    <!-- Chat (anamnese) -->
    <section id="chat" class="absolute right-0 top-10 bottom-0 w-full sm:w-[400px] flex flex-col
                              bg-slate-900/60 backdrop-blur-md border-l border-white/10 pointer-events-auto">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <div id="chat-avatar" class="w-9 h-9 rounded-full bg-teal-700 grid place-items-center font-bold shrink-0">?</div>
        <div class="leading-tight min-w-0">
          <div id="chat-nome" class="font-semibold truncate">Aguardando cliente…</div>
          <div id="chat-status" class="text-xs text-teal-300 hidden">
            <span class="inline-flex gap-1 align-middle"><i class="dot"></i><i class="dot"></i><i class="dot"></i></span>
            digitando…
          </div>
        </div>
        <div id="chat-contador" class="ml-auto text-xs text-slate-500 shrink-0">0/30</div>
      </div>

      <div id="chat-log" role="log" aria-live="polite" aria-label="Conversa com o cliente"
           class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 scroll-smooth"></div>

      <div id="chat-chips" class="flex flex-wrap gap-1.5 px-3 pb-1"></div>

      <button id="btn-decisao" hidden
              class="mx-3 mb-1 text-xs text-teal-300 hover:text-teal-200 border border-teal-400/30 rounded-lg px-3 py-1.5">
        Encerrar anamnese e decidir a conduta →
      </button>

      <form id="chat-form" class="p-3 border-t border-white/10 flex gap-2 items-end">
        <button type="button" id="btn-mic" aria-pressed="false" title="Ditar (Ctrl+M)" class="btn-ghost shrink-0">Mic</button>
        <textarea id="chat-input" rows="1" maxlength="500" placeholder="Faça a próxima pergunta…"
                  class="input flex-1 resize-none h-10"></textarea>
        <button type="submit" id="btn-send" class="btn-primary shrink-0">Enviar</button>
      </form>
    </section>

    <!-- Painel de decisão clínica -->
    <section id="decision" hidden class="absolute left-0 top-10 bottom-0 w-full sm:w-[380px] flex flex-col
                                         bg-slate-900/70 backdrop-blur-md border-r border-white/10 pointer-events-auto">
      <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 tabindex="-1" class="font-semibold">Decisão clínica</h2>
        <button id="btn-voltar" class="text-xs text-teal-300 hover:underline">← voltar à anamnese</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-5">
        <fieldset>
          <legend class="text-xs uppercase tracking-wide text-slate-400 mb-2">1 · Sinais de alerta (só o que você investigou)</legend>
          <div id="redflag-list" class="space-y-1.5 text-sm"></div>
        </fieldset>
        <fieldset>
          <legend class="text-xs uppercase tracking-wide text-slate-400 mb-2">2 · Conduta</legend>
          <div id="conduta-cards" class="grid gap-2">
            <button type="button" data-conduta="vender"    aria-pressed="false" class="conduta"><b>Vender o pedido</b><br><span class="text-xs text-slate-400">entregar o que o cliente pediu</span></button>
            <button type="button" data-conduta="sugerir"   aria-pressed="false" class="conduta"><b>Sugerir outro MIP</b><br><span class="text-xs text-slate-400">medicamento isento de prescrição + orientações</span></button>
            <button type="button" data-conduta="encaminhar" aria-pressed="false" class="conduta"><b>Encaminhar à urgência</b><br><span class="text-xs text-slate-400">SAMU 192 / pronto-socorro</span></button>
          </div>
          <div id="mip-box" hidden class="mt-3">
            <div class="text-xs uppercase tracking-wide text-slate-400 mb-1">Prateleira — MIPs</div>
            <div id="mip-list" class="space-y-1.5 text-sm"></div>
            <div class="text-xs uppercase tracking-wide text-slate-400 mb-1 mt-3">Orientações não farmacológicas</div>
            <div id="orient-list" class="space-y-1.5 text-sm"></div>
          </div>
        </fieldset>
        <button id="btn-confirmar" disabled class="btn-primary w-full py-3">Confirmar conduta</button>
      </div>
    </section>

    <!-- Tela inicial -->
    <div id="menu" class="absolute inset-0 grid place-items-center bg-slate-950/85 backdrop-blur pointer-events-auto overflow-y-auto">
      <div class="max-w-xl w-full m-4 p-8 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl">
        <p class="text-teal-300 text-xs uppercase tracking-widest mb-1">Simulador de atendimento farmacêutico</p>
        <h2 class="text-4xl font-black mb-3">FarmaCheck</h2>
        <p class="text-slate-300 text-sm leading-relaxed mb-3">
          Você é a farmacêutica do balcão. Clientes vão chegar pedindo remédios — alguns inofensivos,
          outros <b class="text-amber-300">capazes de agravar uma condição grave e oculta</b>.
          Investigue por anamnese antes de qualquer decisão: vender, orientar ou encaminhar.
        </p>
        <p class="text-xs text-slate-500 mb-5 border-l-2 border-teal-500/40 pl-3">
          Ambiente 100% fictício e educacional. Condutas, marcas e desfechos são ilustrativos —
          não substituem avaliação farmacêutica/médica nem bula.
        </p>
        <details class="mb-5">
          <summary class="cursor-pointer text-sm text-teal-300">Servidor de IA (opcional — OpenAI-compatible)</summary>
          <div class="mt-3 space-y-2 text-sm">
            <label class="block">Endpoint base <input id="cfg-endpoint" class="input" placeholder="/llm/v1 (proxy de desenvolvimento)" /></label>
            <label class="block">Modelo <input id="cfg-model" class="input" placeholder="qwen3-4b" /></label>
            <label class="block">Chave (se exigir) <input id="cfg-key" type="password" class="input" placeholder="—" /></label>
            <div class="flex gap-2 items-center pt-1">
              <button id="btn-testar" class="btn-ghost">Testar conexão</button>
              <span id="cfg-status" class="text-xs text-slate-400"></span>
            </div>
          </div>
        </details>
        <button id="btn-iniciar" class="btn-primary w-full py-3 text-base">Iniciar expediente</button>
        <p class="text-xs text-slate-500 mt-4">Enter envia · Shift+Enter quebra linha · Ctrl+M dita · R repete a última fala · Tab navega</p>
      </div>
    </div>

    <!-- Debriefing / relatório -->
    <div id="debrief" hidden class="absolute inset-0 overflow-y-auto bg-slate-950/90 backdrop-blur pointer-events-auto">
      <article id="debrief-card" class="mx-auto max-w-2xl my-8 p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl">
        <span id="debrief-tag" class="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3">—</span>
        <h2 id="debrief-titulo" tabindex="-1" class="text-2xl font-bold mb-2"></h2>
        <p id="debrief-texto" class="text-slate-300 leading-relaxed mb-5"></p>
        <div id="debrief-pontos" class="text-4xl font-black mb-4"></div>
        <div id="debrief-breakdown" class="space-y-2 mb-5"></div>
        <ul id="debrief-detalhes" class="text-sm space-y-1.5 mb-5"></ul>
        <div id="debrief-preceptor" hidden class="border-t border-white/10 pt-4 text-sm text-slate-300 italic leading-relaxed"></div>
        <p id="debrief-stamp" class="text-[10px] text-slate-500 mt-4"></p>
        <div class="flex flex-wrap gap-3 mt-6 no-print">
          <button id="btn-proximo"  class="btn-primary">Próximo cliente</button>
          <button id="btn-repetir"  class="btn-ghost">Repetir este caso</button>
          <button id="btn-exportar" class="btn-ghost">Exportar relatório</button>
        </div>
      </article>
    </div>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**`src/styles.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }

/* Bolhas de chat */
.bub { max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 1rem; font-size: 0.9rem;
       line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
.bub-farm { align-self: flex-end; background: #0D9488; color: #ecfeff; border-bottom-right-radius: 0.25rem; }
.bub-pac  { align-self: flex-start; background: #f8fafc; color: #1f2937; border-bottom-left-radius: 0.25rem; }
.bub-sys  { align-self: center; font-size: 0.72rem; color: #94a3b8; font-style: italic; text-align: center; max-width: 100%; }
.bub-red  { outline: 2px solid #f59e0b; outline-offset: 1px; }

/* Indicador "digitando" */
@keyframes pulse-dot { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
.dot { width:6px; height:6px; border-radius:9999px; background:#5eead4; display:inline-block; animation:pulse-dot 1.2s infinite; }
.dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}

/* Botões/inputs reutilizáveis */
.btn-primary { background:#0d9488; color:#ecfeff; font-weight:600; border-radius:0.75rem; padding:0.55rem 1.1rem; }
.btn-primary:hover:not(:disabled) { background:#0f766e; }
.btn-primary:disabled { opacity:.4; cursor:not-allowed; }
.btn-ghost { background:rgba(30,41,59,.8); color:#e2e8f0; border:1px solid rgba(255,255,255,.12);
             border-radius:0.6rem; padding:0.45rem 0.8rem; }
.btn-ghost:hover { background:rgba(51,65,85,.9); }
.input { background:#0f172a; border:1px solid rgba(255,255,255,.12); border-radius:0.6rem;
         padding:0.45rem 0.7rem; color:#e2e8f0; width:100%; }
.input:focus { outline:2px solid #2dd4bf; }

/* Painel de decisão */
.conduta { display:block; width:100%; text-align:left; padding:0.6rem 0.9rem; border-radius:0.75rem;
           border:1px solid rgba(255,255,255,.12); background:rgba(30,41,59,.8); }
.conduta[aria-pressed="true"] { border-color:#14b8a6; background:rgba(13,148,136,.25); }
.check-row { display:flex; gap:0.5rem; align-items:flex-start; padding:0.4rem 0.6rem;
             border-radius:0.6rem; background:rgba(30,41,59,.6); cursor:pointer; }
.check-row input { margin-top:0.2rem; accent-color:#14b8a6; }

/* Barras de pontuação */
.scorebar { display:grid; grid-template-columns:150px 1fr 40px; gap:8px; align-items:center; font-size:12px; color:#94a3b8; }
.scorebar .fill { height:8px; border-radius:999px; background:#1e293b; overflow:hidden; }
.scorebar .fill > i { display:block; height:100%; background:#14b8a6; }

.vignette { position:absolute; inset:0; box-shadow:inset 0 0 180px rgba(2,6,23,.55); }

/* Scroll do chat */
#chat-log::-webkit-scrollbar { width:8px; }
#chat-log::-webkit-scrollbar-thumb { background:#334155; border-radius:999px; }

@media (prefers-reduced-motion: reduce) { .dot { animation:none; } }

/* Exportar relatório (imprimir/PDF) */
@media print {
  body > *:not(#ui) { display:none !important; }
  #ui > *:not(#debrief) { display:none !important; }
  #debrief { position:static; overflow:visible; background:#fff !important; }
  #debrief-card { margin:0; max-width:none; background:#fff !important; box-shadow:none; }
  #debrief-card, #debrief-card * { color:#111827 !important; }
  .no-print { display:none !important; }
}
```

---

## 3. Cenário 3D Procedural (Three.js)

**`src/scene/scene.js`**
```js
import * as THREE from 'three';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10151c);
  scene.fog = new THREE.Fog(0x10151c, 12, 28);

  // Câmera fixa: farmacêutica atrás do balcão, em primeira pessoa
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.62, 2.7);
  camera.lookAt(0, 1.38, 0);

  // Iluminação "loja de farmácia": ambiente frio + chave quente
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x2a2622, 0.9));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.8);
  key.position.set(2.5, 5.5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
  scene.add(key);
  const fill = new THREE.PointLight(0x9fd8ff, 10, 20);
  fill.position.set(-4, 3.2, -2);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffd9a0, 6, 12);
  warm.position.set(2, 2.6, 1);
  scene.add(warm);

  const tickers = new Set();
  const clock = new THREE.Clock();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!reduceMotion) { // respiração sutil da câmera
      camera.position.y = 1.62 + Math.sin(t * 1.1) * 0.008;
      camera.rotation.z = Math.sin(t * 0.7) * 0.0015;
    }
    tickers.forEach((fn) => fn(dt, t));
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, addTicker: (fn) => tickers.add(fn) };
}
```

**`src/scene/pharmacy.js`**
```js
import * as THREE from 'three';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
const mk = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

// Piso cerâmico procedural (textura via canvas — zero assets externos)
function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ccd3d8'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#a7b1b7'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 7);
  return tex;
}

const BOX_COLORS = [0xf8f9fa, 0x2ec4b6, 0xff9f1c, 0xe07a5f, 0xf4f1de, 0x3d5a80, 0xffffff, 0x0d9488, 0xf28f3b];

function gondola(scene, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry;
  const W = 2.4, D = 0.5, H = 2.1, SHELVES = 4;
  const frame = M(0x5b6770, { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const panel = mk(new THREE.BoxGeometry(0.06, H, D), frame);
    panel.position.set((side * W) / 2, H / 2, 0); g.add(panel);
  }
  const header = mk(new THREE.BoxGeometry(W, 0.28, 0.06), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.25 }));
  header.position.set(0, H + 0.14, 0); g.add(header);

  for (let i = 0; i < SHELVES; i++) {
    const y = 0.45 + i * 0.55;
    const board = mk(new THREE.BoxGeometry(W, 0.05, D), frame, false);
    board.position.set(0, y, 0); g.add(board);
    // Caixas de remédio procedurais (cores e tamanhos variados)
    let cx = -W / 2 + 0.12;
    while (cx < W / 2 - 0.18) {
      const w = 0.09 + Math.random() * 0.09, h = 0.1 + Math.random() * 0.1;
      const box = mk(new THREE.BoxGeometry(w, h, 0.22),
        M(BOX_COLORS[(Math.random() * BOX_COLORS.length) | 0], { roughness: 0.55 }), false);
      box.position.set(cx + w / 2, y + h / 2 + 0.028, 0);
      g.add(box);
      cx += w + 0.015 + Math.random() * 0.06;
    }
  }
  scene.add(g);
}

// Atendentes de fundo (não interativas — ambientação)
function attendant(scene, addTicker, x, z, color) {
  const g = new THREE.Group();
  const body = mk(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), M(color));
  body.position.y = 1.05;
  const head = mk(new THREE.SphereGeometry(0.12, 12, 10), M(0xd9b08c));
  head.position.y = 1.62;
  g.add(body, head);
  g.position.set(x, 0, z); g.rotation.y = 0.5;
  scene.add(g);
  addTicker((dt, t) => { g.position.y = Math.sin(t * 1.3 + x) * 0.012; });
}

export function buildPharmacy(scene, addTicker) {
  // Piso / paredes / teto
  const floor = mk(new THREE.PlaneGeometry(18, 13), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }), false);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wall = M(0xe8e4da);
  const mkWall = (w, h, d, x, y, z) => { const m = mk(new THREE.BoxGeometry(w, h, d), wall, false); m.position.set(x, y, z); scene.add(m); };
  mkWall(18, 3.8, 0.2, 0, 1.9, -6.5); mkWall(0.2, 3.8, 13, -9, 1.9, 0); mkWall(0.2, 3.8, 13, 9, 1.9, 0);
  const ceil = mk(new THREE.BoxGeometry(18, 0.15, 13), M(0xf1f3f5), false);
  ceil.position.set(0, 3.85, 0); scene.add(ceil);

  // Painéis de luz fluorescente
  const lamp = M(0xffffff, { emissive: 0xeaf6ff, emissiveIntensity: 1.5 });
  for (const x of [-5, 0, 5]) for (const z of [-3, 1.5]) {
    const p = mk(new THREE.BoxGeometry(2.6, 0.06, 0.5), lamp, false);
    p.position.set(x, 3.75, z); scene.add(p);
  }

  // Balcão principal
  const base = mk(new THREE.BoxGeometry(4.6, 1.0, 0.75), M(0x2f3e46, { roughness: 0.5 }));
  base.position.set(0, 0.5, 1.55); scene.add(base);
  const top = mk(new THREE.BoxGeometry(4.8, 0.06, 0.95), M(0xd8cdbb, { roughness: 0.3 }));
  top.position.set(0, 1.03, 1.55); scene.add(top);
  const band = mk(new THREE.BoxGeometry(4.6, 0.1, 0.02), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.35 }), false);
  band.position.set(0, 0.86, 1.16); scene.add(band);

  // Monitor de ponto de venda + caixinha do "Sorrisal" (prop diegético)
  const monitor = mk(new THREE.BoxGeometry(0.4, 0.28, 0.05), M(0x1a2027, { roughness: 0.4 }));
  monitor.position.set(-1.4, 1.2, 1.7); monitor.rotation.y = 0.5; scene.add(monitor);
  const sorrisal = new THREE.Group();
  const sBox = mk(new THREE.BoxGeometry(0.12, 0.18, 0.05), M(0xffffff, { roughness: 0.5 }), false);
  const sBand = mk(new THREE.BoxGeometry(0.12, 0.035, 0.052), M(0x0d9488), false);
  sBand.position.y = 0.035; sorrisal.add(sBox, sBand);
  sorrisal.position.set(0.9, 1.15, 1.45); sorrisal.rotation.y = -0.35; scene.add(sorrisal);

  // Porta de entrada (fundo)
  const doorFrame = mk(new THREE.BoxGeometry(1.4, 2.3, 0.12), M(0x37474f));
  doorFrame.position.set(3.2, 1.15, -6.38); scene.add(doorFrame);
  const doorGlass = mk(new THREE.BoxGeometry(1.2, 2.1, 0.06), M(0x9fc4d0, { roughness: 0.1, metalness: 0.3 }), false);
  doorGlass.position.set(3.2, 1.1, -6.3); scene.add(doorGlass);

  // Gôndolas (fundo e laterais)
  gondola(scene, -3.2, -4.6, 0);
  gondola(scene, 0.2, -5.4, 0);
  gondola(scene, -7.8, -2.2, Math.PI / 2);

  // Atendentes de fundo em outros balcões
  attendant(scene, addTicker, -5.2, 1.9, 0x8d99ae);
  attendant(scene, addTicker, 5.2, 1.9, 0xb08968);
}
```

**`src/scene/patient.js`** — NPC procedural com respiração, posturas semiológicas e o **hook de substituição por `.glb`** (pipeline foto → 3D):

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const M = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

// Posturas semiológicas (lerp suave entre elas)
const POSES = {
  idle:         { torso: 0.00, head: 0.03, armLx: 0.10, armLz: 0.10, armRx: 0.10, armRz: -0.10 },
  mao_no_peito: { torso: 0.05, head: 0.16, armLx: 0.10, armLz: 0.12, armRx: -1.25, armRz: -0.60 },
  curvado:      { torso: 0.34, head: 0.44, armLx: -0.30, armLz: 0.12, armRx: -0.30, armRz: -0.12 },
  cabeca_baixa: { torso: 0.10, head: 0.55, armLx: 0.10, armLz: 0.10, armRx: 0.10, armRz: -0.10 },
};
export const POSE_FRASE = {
  mao_no_peito: 'aperta o peito com a mão',
  curvado: 'se curva, como se o corpo pesasse',
  cabeca_baixa: 'abaixa a cabeça, visivelmente cansado',
};

export class PatientAvatar {
  constructor(scene) {
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.matSkin = M(0xd9a066); this.matShirt = M(0x8b8378);
    this.matPants = M(0x37414b); this.matHair = M(0x4a4a4a);
    this.cur = { ...POSES.idle }; this.target = POSES.idle; this.walking = null;

    const root = this.root = new THREE.Group();

    // Pernas (pivô no quadril para caminhar)
    this.legL = new THREE.Group(); this.legL.position.set(0.105, 0.86, 0);
    this.legR = new THREE.Group(); this.legR.position.set(-0.105, 0.86, 0);
    for (const leg of [this.legL, this.legR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.075, 0.6, 4, 8), this.matPants);
      mesh.position.y = -0.42;
      const shoe = mk(new THREE.BoxGeometry(0.11, 0.07, 0.2), M(0x22262a));
      shoe.position.set(0, -0.82, 0.04);
      leg.add(mesh, shoe); root.add(leg);
    }

    // Torso (pivô no quadril → postura)
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.9, 0);
    const torsoMesh = mk(new THREE.CapsuleGeometry(0.17, 0.34, 6, 12), this.matShirt);
    torsoMesh.position.y = 0.32; this.torso.add(torsoMesh);

    // Cabeça (pivô no pescoço)
    this.headPivot = new THREE.Group(); this.headPivot.position.set(0, 0.62, 0);
    this.headBaseY = 0.62;
    const head = mk(new THREE.SphereGeometry(0.125, 16, 12), this.matSkin); head.position.y = 0.09;
    const hair = mk(new THREE.SphereGeometry(0.132, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), this.matHair);
    hair.position.y = 0.095;
    const eyeL = mk(new THREE.SphereGeometry(0.016, 8, 6), M(0x22262a)); eyeL.position.set(-0.045, 0.11, 0.115);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.045;
    this.headPivot.add(head, hair, eyeL, eyeR);
    this.torso.add(this.headPivot);

    // Braços (pivô no ombro → mão no peito etc.)
    this.armL = new THREE.Group(); this.armL.position.set(-0.235, 0.5, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.235, 0.5, 0);
    for (const arm of [this.armL, this.armR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), this.matShirt);
      mesh.position.y = -0.27;
      const hand = mk(new THREE.SphereGeometry(0.06, 8, 6), this.matSkin);
      hand.position.y = -0.52;
      arm.add(mesh, hand); this.torso.add(arm);
    }
    root.add(this.torso);
    root.visible = false;
    scene.add(root);
  }

  setStyle(a = {}) {
    this.matShirt.color.set(a.camisa ?? 0x8b8378);
    this.matPants.color.set(a.calca ?? 0x37414b);
    this.matHair.color.set(a.cabelo ?? 0x4a4a4a);
    this.matSkin.color.set(a.pele ?? 0xd9a066);
  }
  setPose(name) { if (POSES[name]) this.target = POSES[name]; }

  enter(aparencia) {
    this.setStyle(aparencia); this.setPose('idle');
    this.root.visible = true;
    return this.walk(new THREE.Vector3(3.0, 0, -5.0), new THREE.Vector3(0, 0, 0.6), 2.4);
  }
  leave() {
    return this.walk(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(3.0, 0, -5.0), 2.0)
      .then(() => { this.root.visible = false; });
  }
  walk(from, to, dur) {
    return new Promise((res) => {
      this.walking = { from, to, dur, t: 0, res };
      this.root.position.copy(from);
    });
  }

  update(dt, t) {
    const k = Math.min(1, dt * 4);
    for (const key in this.cur) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    this.torso.rotation.x = this.cur.torso;
    this.headPivot.rotation.x = this.cur.head;
    this.armL.rotation.set(this.cur.armLx, 0, this.cur.armLz);
    this.armR.rotation.set(this.cur.armRx, 0, this.cur.armRz);

    if (!this.reduceMotion) { // respiração (semiologicamente legível)
      const b = Math.sin(t * 2.1);
      this.torso.scale.set(1 + b * 0.018, 1, 1 + b * 0.014);
      this.headPivot.position.y = this.headBaseY + Math.sin(t * 2.1) * 0.004;
    }

    if (this.walking) {
      const w = this.walking; w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      const e = p * p * (3 - 2 * p);
      this.root.position.lerpVectors(w.from, w.to, e);
      if (p < 1) {
        this.root.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
        const step = Math.sin(w.t * 7);
        this.legL.rotation.x = step * 0.45; this.legR.rotation.x = -step * 0.45;
        if (!this.reduceMotion) this.root.position.y = Math.abs(Math.sin(w.t * 7)) * 0.025;
      } else {
        this.root.rotation.y += (0 - this.root.rotation.y) * Math.min(1, dt * 6);
        if (Math.abs(this.root.rotation.y) < 0.05) {
          this.legL.rotation.x = this.legR.rotation.x = 0;
          this.root.position.y = 0;
          const done = w.res; this.walking = null; done();
        }
      }
    }
  }
}

/**
 * PIPELINE FOTO → 3D (gate futuro):
 * 1. Fotos do objeto/pessoa → fotogrametria (Meshy / Luma / Polycam) → .glb
 * 2. Retopologia (< 30k tris) + rig Mixamo (esqueleto compartilhado)
 * 3. Animações nomeadas: Idle, Pain, Embarrassed, Discomfort, Weakness
 * 4. Salvar em /public/models/<caso>.glb e trocar em main.js:
 *    const avatar = await loadGLBFPatient('/models/nelson.glb', scene).catch(() => new PatientAvatar(scene));
 * Mesmo contrato do procedural: enter/leave/setPose/update — fallback automático.
 */
export async function loadGLBFPatient(url, scene) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name] = mixer.clipAction(clip);
  const poseMap = { idle: 'Idle', mao_no_peito: 'Pain', curvado: 'Weakness', cabeca_baixa: 'Discomfort' };
  let active = null;
  return {
    setStyle() {},
    setPose(name) {
      const clip = clips[poseMap[name] || 'Idle'];
      if (clip && clip !== active) { active?.stop(); active = clip; active.reset().play(); }
    },
    async enter(a) { model.visible = true; this.setPose('idle'); },
    async leave() { model.visible = false; },
    update(dt) { mixer.update(dt); },
  };
}
```

---

## 4. A Camada de IA (Fact Gate + LLM + Prompts)

**`src/core/factGate.js`**
```js
// O motor decide o que a IA pode saber. A LLM nunca vê fato bloqueado → não vaza.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const DOMAIN_TESTS = [
  ['duracao',      /(quanto tempo|ha quanto|desde quando|quando comecou|quantos dias|quantas horas)/],
  ['localizacao',  /(onde|em que lugar|no peito|torax|coracao|epigastr|garganta|estomago)/],
  ['caracter',     /(como (e|esta|sente)|que tipo|aperta|queima|ardor|pontada|fisgada|peso|capacete|pulsa)/],
  ['irradiacao',   /(irradia|espalha|vai para|passa para|braco|mandibula|queixo|ombro|costas)/],
  ['intensidade',  /(intensidade|de zero|de 0 a|nota de|quao forte|forte|aguenta)/],
  ['fatores',      /(piora|melhora|deitado|deitar|comida|comer|gordura|esforco|escada|esforcar)/],
  ['associados',   /(suor|sua|nausea|enjoo|vomito|falta de ar|respirar|engolir|tosse|coriza|tontura|desmaio|placa|pus|amigdal|pescoço|linfonodo|bolinha)/],
  ['febre',        /(febre|temperatura|calor no corpo|termometro|escalafrio)/],
  ['historico',    /(hiperten|pressao|diabet|colesterol|fuma|cigarro|tabag|coracao|cardiaco|infarto|doencas|historico|saude)/],
  ['medicamentos', /(remedio|medicacao|toma|tomando|comprimido|uso continuo|antibiotico|amoxicilina)/],
  ['alergias',     /(alerg|intoleran|reacao adversa)/],
  ['episodios',    /(outras vezes|ja teve|ja sentiu|antes|de vez em quando|recorrente|sempre|outra vez)/],
  ['genero',       /(idade|quantos anos)/],
];

export const DOMAIN_LABELS = {
  duracao: 'duração do quadro', localizacao: 'localização da queixa', caracter: 'característica da queixa',
  irradiacao: 'irradiação', intensidade: 'intensidade', fatores: 'fatores de melhora/piora',
  associados: 'sintomas associados', febre: 'febre', historico: 'histórico e comorbidades',
  medicamentos: 'medicamentos em uso', alergias: 'alergias', episodios: 'episódios anteriores', genero: 'idade',
};

export function classify(text) {
  const q = norm(text);
  return DOMAIN_TESTS.filter(([, re]) => re.test(q)).map(([d]) => d);
}

export class KnowledgeState {
  constructor(caseDef) {
    this.case = caseDef;
    this.revealed = new Map();     // tag → fato (ordem de inserção = ordem de revelação)
    this.askedDomains = new Set();
    this.attempts = new Map();     // contagem de abordagens p/ fatos relutantes
    this.turnsWithoutNews = 0;
    this.revealVoluntarios();
  }
  revealVoluntarios() {
    for (const f of this.case.fatos) if (f.nivel === 'voluntario') this.revealed.set(f.tag, f);
  }
  ask(text, domains) {
    const q = norm(text);
    const novos = [], evasivas = [];
    for (const f of this.case.fatos) {
      if (this.revealed.has(f.tag) || !domains.includes(f.dominio)) continue;
      if (f.nivel === 'relutante') {
        const direta = f.gatilho ? new RegExp(f.gatilho, 'i').test(q) : false;
        const tentativas = (this.attempts.get(f.tag) || 0) + 1;
        this.attempts.set(f.tag, tentativas);
        if (direta || tentativas >= 2) { this.revealed.set(f.tag, f); novos.push(f); }
        else evasivas.push(f);
      } else {
        this.revealed.set(f.tag, f); novos.push(f);
      }
    }
    domains.forEach((d) => this.askedDomains.add(d));
    if (!novos.length && !evasivas.length) this.turnsWithoutNews++;
    else this.turnsWithoutNews = 0;
    return { novos, evasivas };
  }
  recent(n, exclude = []) {
    const ex = new Set(exclude.map((f) => f.tag));
    return [...this.revealed.values()].filter((f) => !ex.has(f.tag)).slice(-n);
  }
}
```

**`src/ai/prompts.js`**
```js
// Prompt do ATOR (T1/T2): pequeno, à prova de modelo 4B, e FAT-GATED —
// só entra nele o que o motor liberou. Sobrevive da v3.0 §2.
export function buildActorSystemPrompt(caso, knowledge, novos, evasivas) {
  const p = caso.persona;
  const L = [];
  L.push(`Você é ${p.nome}, ${p.idade} anos. ${p.resumo}.`);
  L.push(`CENÁRIO: você está no balcão de uma farmácia e quer comprar ${caso.pedido}.`);
  L.push(`Você já disse ao chegar: "${caso.abertura}"`);
  L.push('REGRAS (obedeça rigorosamente):');
  L.push('- Responda em 1 a 3 frases curtas, português popular do Brasil, sem jargão médico.');
  L.push('- Use APENAS as informações permitidas abaixo. NUNCA invente sintomas, números ou fatos.');
  L.push('- Nunca se autodiagnostique, nunca sugira remédios, nunca mencione "infarto" ou doenças.');
  L.push('- Continue querendo comprar o que pediu, com naturalidade.');
  L.push('- Se perguntarem o que fazer, responda: "a senhora não é que estudou pra isso?"');
  if (evasivas.length) {
    L.push(`NESTE TURNO você ainda não quer contar o detalhe. Desvie com algo como: "${evasivas[0].falaEvasiva}"`);
  } else if (novos.length) {
    L.push('INFORMAÇÕES PERMITIDAS AGORA (incorpore com naturalidade):');
    novos.forEach((f) => L.push(`- ${f.falaLeiga}`));
    const anteriores = knowledge.recent(4, novos);
    if (anteriores.length) {
      L.push('Já revelado antes (não repita à toa, só se fizer sentido):');
      anteriores.forEach((f) => L.push(`- ${f.falaLeiga}`));
    }
  } else {
    L.push(`INFORMAÇÕES PERMITIDAS AGORA: nenhuma nova. Reaja sem dar informação clínica nova e volte ao seu pedido, ex.: "${p.falaForaDominio}"`);
  }
  return L.join('\n');
}

// T3 — voz determinística (offline / fallback). falaLeiga é a fonte única dos 3 tiers.
export function templateReply(caso, knowledge, novos, evasivas) {
  if (evasivas.length) return evasivas[0].falaEvasiva;
  if (novos.length) return novos.map((f) => f.falaLeiga).join(' ');
  if (knowledge.turnsWithoutNews >= 2) return caso.persona.falaRepetida;
  return caso.persona.falaForaDominio;
}

// PRECEPTOR (1 chamada/partida): recebe a nota JÁ COMPUTADA e apenas humaniza o relatório.
export function buildEvaluatorMessages(caso, decisao, result, logText) {
  return [
    { role: 'system', content:
`Você é um preceptor de farmácia clínica, tom calmo e construtivo. Recebe o RESULTADO JÁ COMPUTADO
de uma simulação e escreve o feedback em português do Brasil (máx. 180 palavras, 3 blocos):
1) o que o aluno fez bem (máx. 3 pontos); 2) o que faltou investigar; 3) recomendação prática.
Regras: NUNCA recalcule ou questione a nota; não prescreva doses; linguagem respeitosa.` },
    { role: 'user', content: JSON.stringify({
      caso: caso.id, decisao, nota: result.total,
      detalhes: { anamnese: result.anamnese, redflags: result.redflags, risco: result.risco,
                  conduta: result.conduta, comunicacao: result.comunicacao,
                  dominios_faltantes: result.missedDomains, redflags_faltantes: result.missedRed,
                  erros_criticos: result.criticals },
      log: logText,
    }) },
  ];
}
```

**`src/ai/llm.js`**
```js
const LS_KEY = 'farmacheck:llm';
export function loadLLMConfig() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
export function saveLLMConfig(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

// Cliente OpenAI-compatible com streaming (funciona com llama.cpp --server, LM Studio, Ollama, vLLM…)
export class LLMClient {
  constructor(cfg = {}) {
    this.baseUrl = cfg.baseUrl || '/llm/v1'; // proxy Vite em dev; em prod, URL do servidor
    this.model = cfg.model || 'farmacheck-actor';
    this.apiKey = cfg.apiKey || '';
    this.temperature = cfg.temperature ?? 0.8;
    this.maxTokens = cfg.maxTokens ?? 96;
    this.ok = null; // null = desconhecido; false = fora do ar (usa T3)
  }
  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }
  async probe() {
    try { const r = await fetch(`${this.baseUrl}/models`, { headers: this.headers() }); this.ok = r.ok; }
    catch { this.ok = false; }
    return this.ok;
  }
  async chat(messages, { onToken, temperature, maxTokens, timeoutMs = 30000 } = {}) {
    const body = {
      model: this.model, messages, stream: true,
      temperature: temperature ?? this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    if (!res.body?.getReader) { // servidor sem stream
      const j = await res.json();
      return { text: j.choices?.[0]?.message?.content || '' };
    }
    // SSE: tokens chegam ao vivo ("paciente digitando…")
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const tok = j.choices?.[0]?.delta?.content;
          if (tok) { text += tok; onToken?.(tok, text); }
        } catch { /* fragmento parcial — ignora */ }
      }
    }
    if (!text.trim()) throw new Error('LLM vazio');
    return { text };
  }
}
```

---

## 5. Dados Clínicos (rascunho — pendente validação da PO)

**`src/data/cases.js`**
```js
// ⚠️ CONTEÚDO CLÍNICO = RASCUNHO TÉCNICO. Validação e assinatura da PO são bloqueantes
// (checklist §14 do GDD v3.0). Marcas e condutas são ilustrativas.

export const CASES = [
{
  id: 'nelson_infarto', version: 1, temRedFlag: true, titulo: 'A queimação teimosa',
  persona: {
    nome: 'Seu Nelson', idade: 58,
    resumo: 'aposentado, simpático e apressado, tende a minimizar tudo ("deve ser a azia de sempre"), fala popular',
    voz: { rate: 0.92, pitch: 0.75 },
    aparencia: { camisa: 0x8b8378, calca: 0x37414b, cabelo: 0x9a9a9a, pele: 0xd9a066 },
    falaForaDominio: 'Ah moça, é só o Sorrisal mesmo, é rapidinho, ainda tenho pressa.',
    falaRepetida: 'Já falei tudo... é a minha azia velha de sempre. O senhor tem o Sorrisal aí atrás?',
  },
  pedido: 'Sorrisal (AAS 500 mg efervescente) — "para a azia"',
  abertura: 'Bom dia! Me dá um Sorrisal? Tô com uma queimação no peito desde cedo que não passa... a minha azia de sempre, mas essa tá teimosa.',
  fatos: [
    { tag: 'queimacao', dominio: 'localizacao', valor: true, nivel: 'voluntario', redFlag: false, rotulo: 'Queimação/pressão precordial', falaLeiga: 'É aqui, no meio do peito, uma queimação... mas hoje tá mais um peso, sabe?' },
    { tag: 'inicio_h2', dominio: 'duracao', valor: true, nivel: 'voluntario', redFlag: false, rotulo: 'Início há ~2h', falaLeiga: 'Começou umas duas horas atrás, depois do café da manhã.' },
    { tag: 'caracter_opressivo', dominio: 'caracter', valor: true, nivel: 'extraivel', redFlag: true, rotulo: 'Caráter opressivo', falaLeiga: 'É estranho... mais um aperto, um peso, do que queimação propriamente.' },
    { tag: 'irradiacao_braco', dominio: 'irradiacao', valor: true, nivel: 'extraivel', redFlag: true, rotulo: 'Irradia p/ braço esq. e mandíbula', postura: 'mao_no_peito', gatilho: '(irradia|espalha|brao|queixo|mandibula|ombro)', segredo: '(brao esquerdo|queixo|mandibula)', falaLeiga: 'Agora que a senhora pergunta... escorre pro braço esquerdo e dá uma dorzada na ponta do queixo.' },
    { tag: 'suores_frios', dominio: 'associados', valor: true, nivel: 'extraivel', redFlag: true, rotulo: 'Sudorese fria', falaLeiga: 'Tô suando frio, sim... achava que era o calor.' },
    { tag: 'dispneia', dominio: 'associados', valor: true, nivel: 'extraivel', redFlag: true, postura: 'curvado', rotulo: 'Dispneia ao esforço', falaLeiga: 'Subir a escada de casa me deixa sem fogo há uns dias.' },
    { tag: 'nausea', dominio: 'associados', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'Náusea leve', falaLeiga: 'Um enjoo leve... acho que é o café.' },
    { tag: 'piora_comida_neg', dominio: 'fatores', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Não relaciona com alimentação/decúbito', falaLeiga: 'Com comida? Não notei diferença não... nem deitado melhora nem piora.' },
    { tag: 'esforco_piora', dominio: 'fatores', valor: true, nivel: 'extraivel', redFlag: true, rotulo: 'Piora ao esforço', falaLeiga: 'Pegar o balde de água lá de baixo deixou tudo apertado, viu.' },
    { tag: 'has', dominio: 'historico', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'HAS mal controlada', falaLeiga: 'Tenho pressão alta, mas ando tomando o remédio por conta, quando lembro.' },
    { tag: 'tabagismo', dominio: 'historico', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'Tabagista há 40 anos', falaLeiga: 'Fumo desde os dezoito, mas é pouco, um maço por dia.' },
    { tag: 'episodios_previos', dominio: 'episodios', valor: true, nivel: 'extraivel', redFlag: false, rotulo: '"Azia" recorrente autotratada', falaLeiga: 'De vez em quando dá essa azia, tomo um Sorrisal e passa. Essa não passou.' },
    { tag: 'medicacao_hoje', dominio: 'medicamentos', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'Sem medicação hoje', falaLeiga: 'Hoje não tomei nada, nem o da pressão.' },
    { tag: 'alergias_neg', dominio: 'alergias', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Alergias: nega', falaLeiga: 'Alergia? Que eu saiba não, nunca deu nada.' },
  ],
  checklistDominios: ['duracao', 'localizacao', 'caracter', 'irradiacao', 'fatores', 'associados', 'historico', 'medicamentos', 'alergias', 'episodios'],
  redFlagDominios: ['caracter', 'irradiacao', 'associados', 'fatores'],
  condutaGabarito: { tipo: 'encaminhar', mips: [], naoFarm: [] },
  prateleira: [
    { id: 'aas', nome: 'Sorrisal 500 mg (o pedido — AAS efervescente)' },
    { id: 'antiacido', nome: 'Antiácido (hidróxido de Al/Mg)' },
    { id: 'omeprazol', nome: 'Omeprazol 20 mg (MIP)' },
  ],
  orientacoes: ['Explicar a suspeita e acionar SAMU 192', 'Aconselhar não dirigir', 'Acompanhar até a chegada do socorro'],
  errosCriticos: [
    { id: 'vender_pedido', teste: (d) => d.conduta === 'vender', msg: 'Vendeu o medicamento sem investigar/encaminhar: quadro compatível com síndrome coronariana aguda exige encaminhamento imediato — não manejo de azia.' },
    { id: 'mip_sem_encaminhar', teste: (d) => d.conduta === 'sugerir', msg: 'Sugeriu MIP sem encaminhamento: tratar como dispepsia um quadro de dor torácica opressiva com irradiação atrasa o socorro.' },
  ],
  consequencias: {
    vender: { desfecho: 'fatal', titulo: 'Duas horas depois…', texto: 'O Sorrisal não resolveu nada — a "azia" era o começo de um infarto. Sozinho em casa, o aperto virou agonia, e o SAMU chegou tarde. Uma pergunta simples — "essa dor vai para o braço?" — teria mudado tudo. A anamnese é um ato clínico: quando ela falta, o balcão vira apenas uma loja.' },
    sugerir: { desfecho: 'grave', titulo: 'A azia que não era azia', texto: 'O antiácido aliviou por vinte minutos. Quando a dor voltou, veio dobrada; um familiar o levou ao pronto-socorro às pressas. Sobreviveu ao infarto extenso, mas com parte do coração perdida — e com a lembrança da farmácia que lhe vendeu alívio em vez de encaminhamento.' },
    encaminhar: { desfecho: 'bom', titulo: 'A pergunta que salvou uma vida', texto: 'Você investigou caráter, irradiação e sintomas associados, reconheceu a síndrome coronariana aguda e chamou o SAMU. No hospital, o ECG confirmou o infarto em evolution — o cateterismo aconteceu a tempo. Dias depois, Seu Nelson voltou só para agradecer (e prometer parar de fumar... "quem sabe").' },
  },
  chips: [
    { label: 'Há quanto tempo?', q: 'Há quanto tempo começou isso?' },
    { label: 'Onde dói?', q: 'Onde exatamente o senhor sente isso?' },
    { label: 'Como é a dor?', q: 'Como é essa sensação? Aperta? Queima?' },
    { label: 'Irradia?', q: 'Essa dor espalha ou vai para algum lugar?' },
    { label: 'Piora com comida?', q: 'Piora quando come ou quando deita?' },
    { label: 'Outros sintomas?', q: 'Tem suores, enjoo ou falta de ar?' },
    { label: 'Remédios?', q: 'Toma algum remédio? Tem pressão alta?' },
    { label: 'Já teve antes?', q: 'Já sentiu isso outras vezes?' },
  ],
},
{
  id: 'marina_amoxicilina', version: 1, temRedFlag: false, titulo: 'O antibiótico garantido',
  persona: {
    nome: 'Marina', idade: 29,
    resumo: 'desenvolvedora, objetiva e um pouco impaciente, "pesquisou no Google e já sabe o que tem"',
    voz: { rate: 1.05, pitch: 1.15 },
    aparencia: { camisa: 0x4a7a8c, calca: 0x2b3440, cabelo: 0x2b2b2b, pele: 0xc98a5b },
    falaForaDominio: 'Então... você tem a amoxicilina ou não? O antibiótico resolve isso em dois dias.',
    falaRepetida: 'Eu já li sobre meus sintomas, é isso mesmo. Só falta o remédio.',
  },
  pedido: 'Amoxicilina 500 mg (comprimidos) — "garganta inflamada"',
  abertura: 'Oi! Me dá uma amoxicilina? Tô com a garganta inflamada há dois dias, e antibiótico resolve rápido, né?',
  fatos: [
    { tag: 'dor_garganta', dominio: 'localizacao', valor: true, nivel: 'voluntario', redFlag: false, rotulo: 'Odinofagia', falaLeiga: 'É a garganta toda que arde, principalmente quando engolo.' },
    { tag: 'inicio_2d', dominio: 'duracao', valor: true, nivel: 'voluntario', redFlag: false, rotulo: 'Início há 2 dias', falaLeiga: 'Começou há dois dias, acordei com ela raspando.' },
    { tag: 'caracter_leve', dominio: 'caracter', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'Queimação leve a moderada', falaLeiga: 'É uma queimação, dá pra aguentar, mas cansa.' },
    { tag: 'febre_neg', dominio: 'febre', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Febre: negada', falaLeiga: 'Febre não senti não, acho que tá normal.' },
    { tag: 'virais', dominio: 'associados', valor: true, nivel: 'extraivel', redFlag: false, rotulo: 'Coriza e tosse seca associadas', falaLeiga: 'Também tô com o nariz escorrendo e uma tosse seca chata.' },
    { tag: 'placas_neg', dominio: 'associados', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Sem placas/pus (relato)', falaLeiga: 'Pus? Acho que não, olhei no espelho, só está vermelhinha.' },
    { tag: 'disfagia_neg', dominio: 'associados', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Sem dificuldade p/ engolir ou respirar', falaLeiga: 'Engolir dói um pouquinho, mas normal. Respirar tá de boa.' },
    { tag: 'linfonodos_neg', dominio: 'associados', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Sem adenomegalia (relato)', falaLeiga: 'Bolinha no pescoço não senti nenhuma.' },
    { tag: 'medicacao_neg', dominio: 'medicamentos', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Sem medicação prévia', falaLeiga: 'Não tomei nada ainda, por isso quero logo o antibiótico.' },
    { tag: 'alergias_neg', dominio: 'alergias', valor: false, nivel: 'extraivel', redFlag: false, rotulo: 'Alergias: nega', falaLeiga: 'Alergia não tenho, que eu saiba.' },
  ],
  checklistDominios: ['duracao', 'localizacao', 'caracter', 'associados', 'febre', 'medicamentos', 'alergias'],
  redFlagDominios: ['febre', 'associados'], // watchlist: investigar negativos também vale
  condutaGabarito: { tipo: 'manejo', mips: ['dipirona'], naoFarm: ['líquidos e alimentos mornos', 'repouso vocal'] },
  prateleira: [
    { id: 'amoxicilina', nome: 'Amoxicilina 500 mg (o pedido — exige receita)' },
    { id: 'dipirona', nome: 'Dipirona 500 mg (analgésico/antitérmico)' },
    { id: 'spray', nome: 'Spray anestésico tópico para garganta' },
  ],
  orientacoes: ['líquidos e alimentos mornos', 'repouso vocal', 'explicar o curso viral (7–10 dias)', 'retorno se piorar/febre'],
  errosCriticos: [
    { id: 'vender_sem_receita', teste: (d) => d.conduta === 'vender', msg: 'Venda de antimicrobiano sem receita: proibida e clinicamente inadequada para faringite viral sem sinais de alerta — risco de eventos adversos e resistência.' },
  ],
  consequencias: {
    vender: { desfecho: 'grave', titulo: 'A receita que não existia', texto: 'A amoxicilina saiu do balcão sem receita e sem indicação. A faringite — viral — seguiu seu curso como faria de qualquer forma; dias depois, um exantema fez Marina procurar o pronto-socorro, onde a pergunta foi: "quem te deu antibiótico para isso?".' },
    sugerir: { desfecho: 'bom', titulo: 'Gripe é viral: sintomático e paciência', texto: 'Você negou a amoxicilina com uma explicação clara, indicou analgesia e cuidados, e marcou o critério de retorno. Três dias depois a garganta melhorou sozinha — como viroses fazem. A farmácia resolveu o que era dela.' },
    encaminhar: { desfecho: 'neutro', titulo: 'Encaminhamento desnecessário', texto: 'Sem sinais de alerta, a conduta esperada era manejo sintomático na farmácia. Ninguém sofreu, mas a urgência ganhou mais um caso que ela não precisava — e Marina saiu sem a orientação que resolveria o problema.' },
  },
  chips: [
    { label: 'Há quanto tempo?', q: 'Há quanto tempo está assim?' },
    { label: 'Febre?', q: 'Está com febre? Mediu a temperatura?' },
    { label: 'Como é a dor?', q: 'Como é a dor? Queima? Pontada?' },
    { label: 'Outros sintomas?', q: 'Tem tosse, coriza ou algo mais?' },
    { label: 'Engolir?', q: 'Sente dificuldade para engolir ou respirar?' },
    { label: 'Remédios?', q: 'Toma algum remédio? Já tomou algo para a garganta?' },
    { label: 'Alergia?', q: 'Tem alergia a algum medicamento?' },
  ],
},
];

// Hook do gerador de casos no servidor de vocês (LLM gera perfis aleatórios no mesmo schema)
export async function fetchNextCase(serverURL) {
  if (!serverURL) return null;
  try {
    const r = await fetch(`${serverURL}/cases/next`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!r.ok) return null;
    const c = await r.json();
    const ok = c && c.id && c.persona?.nome && Array.isArray(c.fatos) && c.condutaGabarito && c.consequencias;
    return ok ? c : null;
  } catch { return null; }
}
```

---

## 6. Avaliação Determinística + Áudio + Orquestrador

**`src/core/scoring.js`**
```js
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function heuristicaComunicacao(history, caso) {
  const all = history.map((m) => norm(m.content)).join(' ');
  let pts = 3;
  if (/(bom dia|boa tarde|boa noite|ola|oi )/.test(all)) pts++;
  const nome = norm(caso.persona.nome).split(' ').find((w) => w.length > 3);
  if (nome && all.includes(nome)) pts++;
  return Math.min(5, pts);
}

export function scoreCase(caso, knowledge, decisao, history) {
  const asked = [...knowledge.askedDomains];
  const miss = (list) => list.filter((d) => !asked.includes(d));
  const missedDomains = miss(caso.checklistDominios);
  const missedRed = miss(caso.redFlagDominios);

  const anamnese = Math.round(35 * (1 - missedDomains.length / caso.checklistDominios.length));
  const redflags = Math.round(20 * (1 - missedRed.length / Math.max(1, caso.redFlagDominios.length)));

  // Risco (10): acertou os sinais de alerta apontados (só pode apontar o que revelou)
  const reveladasRF = caso.fatos.filter((f) => f.redFlag && f.valor && knowledge.revealed.has(f.tag)).map((f) => f.tag);
  const apontadas = decisao.redFlags;
  let risco;
  if (!caso.temRedFlag) risco = apontadas.length === 0 ? 10 : 4;
  else {
    const acertos = reveladasRF.filter((t) => apontadas.includes(t)).length;
    const falsosPos = apontadas.filter((t) => !reveladasRF.includes(t)).length;
    risco = Math.round(10 * Math.max(0, (reveladasRF.length ? acertos / reveladasRF.length : 1) - falsosPos * 0.25));
  }

  // Conduta (30)
  const gab = caso.condutaGabarito;
  let conduta = 0;
  if (decisao.conduta === gab.tipo) conduta += 15;
  if (gab.tipo === 'manejo') {
    const alvo = gab.mips.length || 1;
    conduta += Math.round(15 * gab.mips.filter((m) => decisao.mips.includes(m)).length / alvo);
  } else if (decisao.conduta === gab.tipo) conduta += 15;

  const comunicacao = heuristicaComunicacao(history, caso);
  let total = anamnese + redflags + risco + conduta + comunicacao;
  const criticals = caso.errosCriticos.filter((e) => e.teste(decisao)).map((e) => e.msg);
  if (criticals.length) total = Math.min(total, 50); // erro crítico → nota ≤ 50

  return { total, anamnese, redflags, risco, conduta, comunicacao, missedDomains, missedRed, criticals, reveladasRF };
}
```

**`src/audio/sfx.js`**
```js
let ctx = null;
const ensure = () => { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); } return ctx; };
function tone(freq, dur = 0.15, type = 'sine', gain = 0.07, delay = 0) {
  const c = ensure(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
export const SFX = {
  ensure,
  pop: () => tone(520, 0.06, 'triangle', 0.03),
  chime: () => { tone(659, 0.12, 'sine', 0.06); tone(880, 0.18, 'sine', 0.06, 0.12); },
  redFlag: () => { tone(392, 0.22, 'square', 0.05); tone(311, 0.3, 'square', 0.05, 0.18); }, // beep grave de 2 tons
  ding: () => { tone(880, 0.1, 'sine', 0.07); tone(1318, 0.2, 'sine', 0.07, 0.09); },
  buzz: () => tone(110, 0.5, 'sawtooth', 0.06),
};
```

**`src/audio/tts.js`**
```js
// speechSynthesis fatiado ≤180 chars (contorna o bug de truncamento do Chrome)
function splitChunks(text, max = 180) {
  const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
  const out = []; let cur = '';
  for (const s of parts) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
export const TTS = {
  enabled: true, voice: null,
  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /pt[-_]BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  speak(text, { rate = 1, pitch = 1 } = {}) {
    if (!this.enabled || !('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    for (const chunk of splitChunks(text)) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = 'pt-BR'; if (this.voice) u.voice = this.voice;
      u.rate = rate; u.pitch = pitch;
      speechSynthesis.speak(u);
    }
  },
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
};
```

**`src/audio/stt.js`**
```js
export function createDictation(inputEl) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-mic');
  if (!SR) { if (btn) btn.hidden = true; return { supported: false }; }
  const rec = new SR();
  rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
  let on = false;
  rec.onresult = (e) => {
    let final = '';
    for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) final += e.results[i][0].transcript;
    if (final) inputEl.value = (inputEl.value + ' ' + final).trim();
  };
  const off = () => { on = false; btn?.setAttribute('aria-pressed', 'false'); };
  rec.onend = off; rec.onerror = off;
  const toggle = () => {
    if (on) { rec.stop(); return; }
    try { rec.start(); on = true; btn?.setAttribute('aria-pressed', 'true'); } catch { /* já ativo */ }
  };
  btn?.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggle(); }
  });
  return { supported: true, toggle };
}
```

**`src/core/game.js`** — o orquestrador completo:
```js
import { classify, KnowledgeState, norm, DOMAIN_LABELS } from './factGate.js';
import { buildActorSystemPrompt, templateReply, buildEvaluatorMessages } from '../ai/prompts.js';
import { scoreCase } from './scoring.js';
import { TTS } from '../audio/tts.js';
import { SFX } from '../audio/sfx.js';
import { createDictation } from '../audio/stt.js';
import { POSE_FRASE } from '../scene/patient.js';

const $ = (id) => document.getElementById(id);
const MAX_TURNS = 30;

export class Game {
  constructor({ avatar, cases }) {
    this.avatar = avatar; this.cases = cases; this.llm = null;
    this.state = 'MENU'; this.points = 0; this.lastIdx = -1;
    this.busy = false; this.conduta = null; this.usedChips = new Set();

    this.el = {};
    for (const id of ['chat-log','chat-input','chat-form','chat-chips','chat-nome','chat-avatar','chat-status',
      'chat-contador','hud-paciente','hud-fase','hud-score','btn-decisao','decision','redflag-list','mip-box',
      'mip-list','orient-list','btn-voltar','btn-confirmar','debrief','debrief-tag','debrief-titulo','debrief-texto',
      'debrief-pontos','debrief-breakdown','debrief-detalhes','debrief-preceptor','debrief-stamp','btn-tts'])
      this.el[id] = $(id);

    this.bind();
    this.dictation = createDictation(this.el['chat-input']);
  }

  bind() {
    this.el['chat-form'].addEventListener('submit', (e) => { e.preventDefault(); this.onSubmit(); });
    this.el['chat-input'].addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.onSubmit(); }
    });
    this.el['chat-chips'].addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]');
      if (b) { this.el['chat-input'].value = b.dataset.q; this.onSubmit(); }
    });
    this.el['btn-decisao'].addEventListener('click', () => this.goDecision());
    this.el['btn-voltar'].addEventListener('click', () => this.backToAnamnese());
    $('conduta-cards').addEventListener('click', (e) => {
      const b = e.target.closest('[data-conduta]');
      if (b) this.selectConduta(b.dataset.conduta);
    });
    this.el['btn-confirmar'].addEventListener('click', () => this.confirmDecision());
    $('btn-proximo').addEventListener('click', () => this.nextPatient());
    $('btn-repetir').addEventListener('click', () => this.startCase(this.case));
    $('btn-exportar').addEventListener('click', () => window.print());
    this.el['btn-tts'].addEventListener('click', () => {
      TTS.enabled = !TTS.enabled;
      this.el['btn-tts'].setAttribute('aria-pressed', String(TTS.enabled));
      if (!TTS.enabled) TTS.stop();
    });
    document.addEventListener('keydown', (e) => { // R = repetir última fala
      if (e.key.toLowerCase() === 'r' && document.activeElement !== this.el['chat-input'] && this.lastPatientLine)
        TTS.speak(this.lastPatientLine, this.case?.persona.voz);
    });
  }

  setFase(f) { this.el['hud-fase'].textContent = f; }

  // ---------- ciclo de partida ----------
  async nextPatient() {
    this.el.debrief.hidden = true;
    const cfg = JSON.parse(localStorage.getItem('farmacheck:llm') || '{}');
    let c = await import('../data/cases.js').then((m) => m.fetchNextCase(cfg.serverURL));
    if (!c) {
      let i; do { i = (Math.random() * this.cases.length) | 0; } while (this.cases.length > 1 && i === this.lastIdx);
      this.lastIdx = i; c = this.cases[i];
    }
    this.startCase(c);
  }

  async startCase(caseDef) {
    this.case = caseDef; this.state = 'CHEGADA';
    this.knowledge = new KnowledgeState(caseDef);
    this.history = []; this.turn = 0; this.busy = false; this.conduta = null;
    this.usedChips = new Set(); this.lastPatientLine = '';
    this.seed = Math.floor(Math.random() * 1e6);

    this.el.debrief.hidden = true;
    this.el.decision.hidden = true;
    this.el['btn-decisao'].hidden = true;
    this.el['chat-log'].innerHTML = '';
    this.el['chat-chips'].innerHTML = '';
    this.el['chat-nome'].textContent = `${caseDef.persona.nome}, ${caseDef.persona.idade} anos`;
    this.el['chat-avatar'].textContent = caseDef.persona.nome.replace(/^Dona? ?/i, '')[0] || '?';
    this.el['chat-contador'].textContent = `0/${MAX_TURNS}`;
    this.el['hud-paciente'].textContent = `Cliente: ${caseDef.persona.nome}`;
    this.setFase('Chegada');
    this.el['chat-input'].disabled = false;
    SFX.chime();

    await this.avatar.enter(caseDef.persona.aparencia);
    this.state = 'ANAMNESE'; this.setFase('Anamnese');
    this.addBubble('paciente', caseDef.abertura);
    TTS.speak(caseDef.abertura, caseDef.persona.voz);
    this.lastPatientLine = caseDef.abertura;
    this.renderChips();
    this.el['btn-decisao'].hidden = false;
    this.el['chat-input'].focus();
  }

  renderChips() {
    const box = this.el['chat-chips']; box.innerHTML = '';
    for (const c of this.case.chips) {
      if (this.usedChips.has(c.label)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.q = c.q; b.textContent = c.label;
      b.className = 'text-xs rounded-full border border-teal-400/30 text-teal-200 px-2.5 py-1 hover:bg-teal-900/50';
      box.appendChild(b);
    }
  }

  // ---------- turno de anamnese (o pipeline v3.0 §1 em JS) ----------
  addBubble(kind, text) {
    const el = document.createElement('div');
    el.className = kind === 'paciente' ? 'bub bub-pac' : 'bub bub-farm';
    el.textContent = text;
    this.el['chat-log'].appendChild(el);
    this.scrollLog();
    SFX.pop();
    return el;
  }
  addSystem(text, red = false) {
    const el = document.createElement('div');
    el.className = 'bub bub-sys' + (red ? ' bub-red' : '');
    el.textContent = text;
    this.el['chat-log'].appendChild(el);
    this.scrollLog();
  }
  scrollLog() { this.el['chat-log'].scrollTop = this.el['chat-log'].scrollHeight; }
  showTyping(on) { this.el['chat-status'].classList.toggle('hidden', !on); }

  async onSubmit() {
    const text = this.el['chat-input'].value.trim();
    if (!text || this.busy || this.state !== 'ANAMNESE') return;
    this.el['chat-input'].value = '';
    this.addBubble('farmaceutico', text);
    this.history.push({ role: 'user', content: text });
    this.busy = true; this.showTyping(true);
    this.turn++;
    this.el['chat-contador'].textContent = `${this.turn}/${MAX_TURNS}`;

    const domains = classify(text);
    const { novos, evasivas } = this.knowledge.ask(text, domains);
    novos.forEach((f) => this.onFactRevealed(f));

    const reply = await this.generateReply(novos, evasivas);
    this.showTyping(false);
    this.history.push({ role: 'assistant', content: reply });
    this.lastPatientLine = reply;
    TTS.speak(reply, this.case.persona.voz);
    this.busy = false;
    if (this.turn >= MAX_TURNS) this.goDecision();
    else this.el['chat-input'].focus();
  }

  onFactRevealed(f) {
    if (f.redFlag && f.valor) {
      SFX.redFlag(); // beep 100% correto: vem do evento do motor, nunca do texto
      this.addSystem(`Sinal de alerta: ${f.rotulo}`, true);
    } else if (f.valor === false) {
      this.addSystem(`Investigado — ${f.rotulo} (negado)`);
    }
    if (f.postura) {
      this.avatar.setPose(f.postura);
      this.addSystem(`${this.case.persona.nome} ${POSE_FRASE[f.postura]}.`);
    }
  }

  async generateReply(novos, evasivas) {
    const live = this.addBubble('paciente', ''); // bolha que preenche ao vivo (streaming)
    let out = '';
    try {
      if (!this.llm || this.llm.ok === false) throw new Error('llm indisponível');
      const sys = buildActorSystemPrompt(this.case, this.knowledge, novos, evasivas);
      const msgs = [{ role: 'system', content: sys }, ...this.history.slice(-9)];
      const { text } = await this.llm.chat(msgs, {
        onToken: (tok, full) => { out = full; live.textContent = full; this.scrollLog(); },
      });
      out = text;
    } catch { out = ''; }

    // Guarda anti-alucinação (§16.4): citou segredo bloqueado → template
    if (!out.trim() || this.guardLeaks(out)) out = templateReply(this.case, this.knowledge, novos, evasivas);
    live.textContent = out;
    this.scrollLog();
    return out;
  }

  guardLeaks(text) {
    const q = norm(text);
    return this.case.fatos.some(
      (f) => f.segredo && !this.knowledge.revealed.has(f.tag) && new RegExp(f.segredo, 'i').test(q)
    );
  }

  // ---------- decisão ----------
  goDecision() {
    if (this.state !== 'ANAMNESE' || this.busy) return;
    this.state = 'DECISAO'; this.setFase('Decisão');
    this.el['chat-input'].disabled = true;
    this.el['chat-chips'].innerHTML = '';
    this.el['btn-decisao'].hidden = true;

    // Restrição epistêmica: só aparecem os fatos REVELADOS (negativos pertinentes incluídos)
    const list = this.el['redflag-list']; list.innerHTML = '';
    for (const f of this.case.fatos) {
      if (!this.knowledge.revealed.has(f.tag) || !(f.redFlag || f.valor === false)) continue;
      const label = document.createElement('label');
      label.className = 'check-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = f.tag;
      const span = document.createElement('span');
      span.textContent = f.rotulo + (f.valor ? '' : ' (negado)');
      label.append(cb, span);
      list.appendChild(label);
    }

    document.querySelectorAll('#conduta-cards [data-conduta]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    this.el['mip-box'].hidden = true;
    this.el['btn-confirmar'].disabled = true;
    this.conduta = null;
    this.el.decision.hidden = false;
    this.el.decision.querySelector('h2').focus();
  }

  backToAnamnese() {
    this.state = 'ANAMNESE'; this.setFase('Anamnese');
    this.el.decision.hidden = true;
    this.el['chat-input'].disabled = false;
    this.renderChips();
    this.el['chat-input'].focus();
  }

  selectConduta(kind) {
    this.conduta = kind;
    document.querySelectorAll('#conduta-cards [data-conduta]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.conduta === kind)));

    const mipBox = this.el['mip-box'];
    if (kind === 'sugerir') {
      mipBox.hidden = false;
      const fill = (boxId, items, valueKey) => {
        const box = this.el[boxId]; box.innerHTML = '';
        for (const item of items) {
          const label = document.createElement('label'); label.className = 'check-row';
          const cb = document.createElement('input'); cb.type = 'checkbox';
          cb.value = valueKey === 'id' ? item.id : item;
          const span = document.createElement('span'); span.textContent = item.nome || item;
          label.append(cb, span); box.appendChild(label);
        }
      };
      fill('mip-list', this.case.prateleira, 'id');
      fill('orient-list', this.case.orientacoes, 'nome');
      this.el['btn-confirmar'].textContent = 'Confirmar: orientar e dispensar MIP';
    } else {
      mipBox.hidden = true;
      this.el['btn-confirmar'].textContent =
        kind === 'vender' ? 'Confirmar: vender o pedido' : 'Confirmar: encaminhar à urgência';
    }
    this.updateConfirm();
  }

  updateConfirm() {
    const needMip = this.conduta === 'sugerir' &&
      this.el['mip-list'].querySelector('input:checked') === null;
    this.el['btn-confirmar'].disabled = !this.conduta || needMip;
  }

  async confirmDecision() {
    if (!this.conduta) return;
    this.state = 'AVALIANDO'; this.setFase('Avaliando');
    const decisao = {
      conduta: this.conduta,
      mips: [...this.el['mip-list'].querySelectorAll('input:checked')].map((i) => i.value),
      orient: [...this.el['orient-list'].querySelectorAll('input:checked')].map((i) => i.value),
      redFlags: [...this.el['redflag-list'].querySelectorAll('input:checked')].map((i) => i.value),
    };
    const result = scoreCase(this.case, this.knowledge, decisao, this.history);
    this.points += result.total;
    this.el['hud-score'].textContent = `Pontos ${this.points}`;

    const outcome = this.case.consequencias[this.conduta];
    this.avatar.leave();
    this.state = 'DEBRIEFING'; this.setFase('Relatório');
    this.renderDebrief(outcome, result);
    if (outcome.desfecho === 'bom') SFX.ding(); else SFX.buzz();
    TTS.speak(`${outcome.titulo}. ${outcome.texto}`);

    // Preceptor (LLM, best-effort — falhou? o relatório já está pronto)
    this.el['debrief-preceptor'].hidden = true;
    this.el['debrief-preceptor'].textContent = '';
    if (this.llm && this.llm.ok) {
      try {
        const log = this.history.map((m) => (m.role === 'user' ? 'FARMACÊUTICO: ' : 'PACIENTE: ') + m.content).join('\n');
        const { text } = await this.llm.chat(buildEvaluatorMessages(this.case, decisao, result, log),
          { maxTokens: 320, temperature: 0.3 });
        this.el['debrief-preceptor'].textContent = text;
        this.el['debrief-preceptor'].hidden = false;
      } catch { /* template já cobre */ }
    }
  }

  renderDebrief(outcome, result) {
    const tag = this.el['debrief-tag'];
    const styles = {
      fatal: 'bg-red-900/60 text-red-200', grave: 'bg-amber-900/60 text-amber-200',
      bom: 'bg-teal-900/60 text-teal-200', neutro: 'bg-slate-700/60 text-slate-200',
    };
    tag.className = 'inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ' + (styles[outcome.desfecho] || styles.neutro);
    tag.textContent = { fatal: 'DESFATE FATAL', grave: 'DESEFECHO GRAVE', bom: 'BOM DESEFECHO', neutro: 'CONDUÇÃO QUESTIONÁVEL' }[outcome.desfecho] || 'DESEFECHO';
    tag.textContent = { fatal: 'DESFECHO FATAL', grave: 'DESFECHO GRAVE', bom: 'BOM DESFECHO', neutro: 'CONDUÇÃO QUESTIONÁVEL' }[outcome.desfecho] || 'DESFECHO';

    this.el['debrief-titulo'].textContent = outcome.titulo;
    this.el['debrief-texto'].textContent = outcome.texto;
    this.el['debrief-pontos'].textContent = `${result.total} / 100`;

    const rows = [
      ['Anamnese essencial', result.anamnese, 35], ['Investigação de alertas', result.redflags, 20],
      ['Diagnóstico de risco', result.risco, 10], ['Conduta clínica', result.conduta, 30],
      ['Comunicação', result.comunicacao, 5],
    ];
    this.el['debrief-breakdown'].innerHTML = rows.map(([nome, v, max]) => `
      <div class="scorebar">
        <span>${nome}</span>
        <span class="fill"><i style="width:${Math.round((v / max) * 100)}%"></i></span>
        <span class="text-right">${v}/${max}</span>
      </div>`).join('');

    const det = this.el['debrief-detalhes']; det.innerHTML = '';
    const li = (txt, cls) => { const e = document.createElement('li'); e.textContent = txt; e.className = cls || ''; det.appendChild(e); };
    if (result.missedDomains.length)
      li(`Deveria ter perguntado sobre: ${result.missedDomains.map((d) => DOMAIN_LABELS[d] || d).join(', ')}.`, 'text-amber-300');
    if (result.missedRed.length)
      li(`Sinais de alerta não investigados: ${result.missedRed.map((d) => DOMAIN_LABELS[d] || d).join(', ')}.`, 'text-amber-300');
    result.criticals.forEach((c) => li(`ERRO CRÍTICO — ${c}`, 'text-red-400 font-semibold'));
    if (!result.missedDomains.length && !result.missedRed.length && !result.criticals.length)
      li('Anamnese completa e conduta adequada. Atendimento-modelo.', 'text-teal-300');

    this.el['debrief-stamp'].textContent =
      `caso ${this.case.id} v${this.case.version} · seed ${this.seed} · FarmaCheck web 0.1 · condutas ilustrativas — validar bula e protocolos vigentes`;
    this.el.debrief.hidden = false;
    this.el.debrief.querySelector('h2').focus();
  }
}
```

**`src/main.js`**
```js
import './styles.css';
import { createScene } from './scene/scene.js';
import { buildPharmacy } from './scene/pharmacy.js';
import { PatientAvatar } from './scene/patient.js';
import { Game } from './core/game.js';
import { TTS } from './audio/tts.js';
import { SFX } from './audio/sfx.js';
import { LLMClient, loadLLMConfig, saveLLMConfig } from './ai/llm.js';
import { CASES } from './data/cases.js';

const $ = (id) => document.getElementById(id);

// Palco 3D + farmácia procedural + NPC
const api = createScene($('scene3d'));
buildPharmacy(api.scene, api.addTicker);
const avatar = new PatientAvatar(api.scene);
api.addTicker((dt, t) => avatar.update(dt, t));

TTS.init();
const game = new Game({ avatar, cases: CASES });

// Config do servidor de IA (persistida em localStorage)
const saved = loadLLMConfig();
$('cfg-endpoint').value = saved.baseUrl || '';
$('cfg-model').value = saved.model || '';
$('cfg-key').value = saved.apiKey || '';
const readCfg = () => ({
  baseUrl: $('cfg-endpoint').value.trim() || undefined,
  model: $('cfg-model').value.trim() || undefined,
  apiKey: $('cfg-key').value.trim() || undefined,
});
$('btn-testar').addEventListener('click', async () => {
  saveLLMConfig(readCfg());
  $('cfg-status').textContent = 'Testando…';
  const c = new LLMClient(loadLLMConfig());
  $('cfg-status').textContent = (await c.probe())
    ? 'Conectado ✓' : 'Sem resposta — o jogo rodará no modo plantão (determinístico)';
});

$('btn-iniciar').addEventListener('click', () => {
  SFX.ensure();
  saveLLMConfig(readCfg());
  game.llm = new LLMClient(loadLLMConfig());
  game.llm.probe(); // health-check em paralelo
  $('menu').hidden = true;
  game.nextPatient();
});
```

---

## Como Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

**Funciona imediatamente sem servidor de IA** — o tier 3 (templates determinísticos baseados em `falaLeiga`) responde o paciente. Com o servidor de vocês no ar (`llama.cpp --server`, LM Studio, Ollama…) na porta 8000, a voz do paciente vira LLM com streaming token-a-token. `npm run build` gera o bundle para hospedar no servidor de vocês.

## O que já está embutido (e o que vem)

| Entregue agora | Próximo milestone |
|---|---|
| Fact Gate + KnowledgeState (restrição epistêmica: só revela com pergunta) | Prontuário vivo (SOAP) alimentado pelo `KnowledgeState` |
| 3 tiers de voz (LLM local → nuvem → template) + guarda anti-vazamento | Medidor de Confiança p/ fatos relutantes |
| Beep de red flag via evento do motor (nunca por scan de texto) | Casos-espelho + semente de variação fixável |
| Nota 0–100 determinística (erro crítico → cap 50) + preceptor LLM opcional | CSV do professor (`;`, decimal vírgula) |
| TTS/STT (Ctrl+M), `aria-live`, teclado completo, `prefers-reduced-motion` | Endpoint `/cases/next` no servidor (hook já pronto em `fetchNextCase`) |
| Hook `.glb` (foto → Meshy/Luma/Polycam → rig Mixamo → `loadGLBFPatient`, fallback procedural) | Draco + prateleira diegética |

## Banco de Skills (registro inicial)

Seguindo a convenção de vocês, sugiro registrar/criar: `banco_skills/threejs-cena-procedural/`, `banco_skills/llm-openai-compatible-web/`, `banco_skills/fact-gate-restricao-epistemica/` e `banco_skills/wcag-audio-first/` — cada uma com o SKILL.md documentando o padrão usado aqui, para que a IA consulte antes de tocar nesses módulos.

## ⚠️ Pendência bloqueante (herdada do §14)

Todo o conteúdo clínico em `cases.js` é **rascunho técnico** — precisa da validação e assinatura da PO (Jhuly) antes de congelar. Um ponto específico para a pauta dela: no caso Nelson, o jogo trata "vender e liberar" como erro fatal (o desfecho é o IAM não socorrido, não o AAS em si — protocolos de suspeita de SCA envolvem acionar o SAMU; a validação deve decidir se a narrativa menciona AAS por orientação telefônica). Os MIPs, doses e distratores seguem a mesma regra.

Quer que eu avance no próximo módulo — prontuário vivo (SOAP) ou o endpoint `/cases/next` com o prompt de geração de casos aleatórios para o servidor?



voce pode olhar todo o resto mais ele precisa ser web a implementação ! olha dentro dessa pasta inteira nesse caso podemos utilizar também o llama-cpp se nao tiver nada renderizando na GPU!