# Resumo da Sessão — FarmaCheck 3D (v3-rewrite)

Em 11/set/2026. Isso é o ponto onde estamos para a próxima conversa.

## O jogo (contexto na hora)
- **projeto:** `~/Git/game_farma/` · web Three.js + Vite + Tailwind (no React).
- **deploy:** container `game_farma` (Docker) → `https://francoscorporation.ddns.net/game/ufggame/` (Caddy /game/ufggame/*). Deploy: `cd ~/Git/base_fundation/game_farma && docker rm -f game_farma && docker compose -f docker-compose.yml up -d --build`.
- **llama-cpp (Qwen3.8-9B multimodal)** em `127.0.0.1:8081` = o **juiz de visão local** (falha às vezes; restart cuida). Usa `scripts/vision_judge.py <img>`.
- **Blender MCP** em `:9876` (opcional; xvfb-run pra GUI em servidor headless). Trilha B de posicionamento 3D usa Blender apenas pra exportar props.
- **ComfyUI/other containers** ficam fora do escopo do FarmaCheck (eles são de outros projetos).

## Estado atual do 3D (o que tá no ar)
- **Paciente:** `public/models/paciente_real.glb` = **Eric Rigged** (Sketchfab, renderpeople, CC-BY). Realista, rigged, ~2.4MB, sem clips de animação embutidos — o jogo usa pra posição/idle.
- **NPCs laterais** (atendentes) = **mesma base** que o paciente (clone), com tint de roupa e ligeiro idle (sobe/desce + girar cabeça).
- **Cena** = farmácia procedural (usamos caso нуж) + iluminação ACESfilm sofisticada (altl anti-estouro) + rim light frio atrás do paciente.

## As lições duras (o que NÃO fazer de novo)
1. **Primitivas procedurais = teto "cartoon"** (já validado pelo juiz; o primeiro personagem parecia ursinho de goma).
2. **VRM (twist_sample)" nem sempre é ótimo** — ele era na verdade un modelo técnico com pose rara; o parecer do juiz corrobora.
3. **Ready Player Me está bloqueado** na UVW — só modelos de Sketchfab (descargáveis com API key) servem como base realista.
4. **Girar bonecos às cegas = absurdamente propenso a deformar malhas.** O T-pose de vindas (o braço natural) ficou melhor que as "rotações" que causei. Se sou do Zero: **não rotacione o modelo**, use a pose bind natural.
5. **Nunca rodada Asana confluência e o modelo de visão em loop: por cada esquisito visual você totaliza dias.**

## O restante (não pronto)
- **Expressões clínicas** (dor escala 0-10 → morph targets del rosto). PoseMap pele + HDRI são os próximos.
- **Variação de personagens** (sexo, cabelo, roupa). O Eric tiene una pelea muy distinta.
- **Studying que ya pasó**: tienes que seguir háblando de ese tema.

## El próximo paso (hipótesis de prioridad)
1. Validar que el paciente no está roto (screenshot no juego → juiz de visión).
2. Levantar ya ya que todos los NPCs tienen una misma base + anim. de idle natural. Aplicar tintes de roupa por modelo.
3. Anotar un nuevo modelo (descargar Sketchfab que la verificación de Plantilla de la base Lingía el manejo de Y cargo o unas lines).

Nada más. Sigamos con el caso.