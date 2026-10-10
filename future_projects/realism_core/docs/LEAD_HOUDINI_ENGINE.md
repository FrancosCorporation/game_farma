# Lead: Houdini Engine for Unreal (PO, 29/09)

**Repo:** https://github.com/sideeffects/HoudiniEngineForUnreal (oficial SideFX, 1.6k stars)

## O que é
Plugin oficial que traz o workflow **procedural do Houdini** (Houdini Digital Assets — HDAs)
pra dentro do **Unreal Engine 5** (5.6–5.8, Houdini 22): o artista ajusta parâmetros no
editor UE e o Houdini "cozinha" a geometria em thread separada, sem bake. Integração com
o PCG do UE desde 5.7. Plugin gratuito e open-source.

## Avaliação honesta pro FarmaCheck (29/09/2026)
- **Hoje (jogo web three.js): aplicabilidade DIRETA zero** — o plugin é para Unreal,
  e o FarmaCheck roda no navegador.
- **Se a Trilha B/realism_core migrar pra Unreal** (caminho já mapeado nos planos com
  MetaHuman/Chaos Cloth): aí sim o Houdini Engine vira a ferramenta procedural pra
  ambientes (farmácias procedurais, scattering de props, layout de gôndolas por
  parâmetro), personagens e VFX.
- **Custos/dependências que travam adoção imediata:** exige licença do Houdini
  (Apprentice = grátis só p/ estudo, com watermark; Indie ~US$269/ano p/ uso comercial)
  + ter um projeto Unreal de pé. O plugin sozinho não serve pra nada.
- **Alternativa atual p/ o jogo web que já temos:** se o objetivo é gerar
  cenário/props procedurais, o Houdini CORE (sem plugin UE) exporta glTF direto —
  mas o custo da licença não se justifica enquanto o pipeline Gemini→Hunyuan3D→
  Blender (skill `gamefarma_pipeline_online_3d`) entrega os assets de graça.

## Quando reabrir este lead
Quando (a) o PO decidir migrar o jogo/uma versão pra Unreal, OU (b) precisarmos de
geração procedural de CENÁRIOS inteiros (não apenas personagens) em lote. Aí:
instalar UE 5.8 + Houdini (licença definida) + este plugin (binários da aba Releases).

---
# Lead: Browser Agents visuais (PO, 29/09 — seguindo a saga Mixamo/Gemini)

**Links:** https://github.com/AsHura-Wnd/browser-agent (Vision Lite) ·
https://github.com/inematds/agent-browser

## O que são
Agentes de browser que **vêem a tela** (VLM local via Ollama) + Playwright + **Set-of-Marks**
(badges numerados sobre os elementos clicáveis) + **verificação pré/pós-ação** (diff de
estado: URL, DOM, inputs) + detecção de loop.

## Veredito pro nosso pipeline (29/09)
- **As IDEIAS valem ouro** e resolvem exatamente o que hoje foi doloroso:
  1. **Set-of-Marks**: numerar os elementos num screenshot antes de perguntar ao juiz
     "qual marker?" — mata o erro de coordenada cega (minha saga dos marcadores do Mixamo!).
  2. **Verify-loop**: foto → ação → foto → diff = o método do PO ("tira foto e verifica"),
     systematizado como arquiterura.
  3. Detecção de loop (não repetir ação falida 10× — meu loop de reenvio de código!).
- **Os projetos em si: imaturos** (1 star, 12 commits) — NÃO adotar como dependência.
- **Ação**: incorporar as 3 ideias na skill `gamefarma_pipeline_online_3d` como técnica
  (SOM no screenshot + verify-loop obrigatório + limite de retries). Nossa stack já tem
  Playwright + vision_judge (llama-cpp) — só falta a disciplina do SOM e do diff.

---
# Lead: Meshy 3D Agent (PO, 29/09 — O MAIS RELEVANTE)

**Repo:** https://github.com/meshy-dev/meshy-3d-agent (oficial Meshy, 96 stars, MIT)
**CLI:** `npm i -g meshy-cli@0.4.0` → `meshy auth login` (OAuth browser, sem colar key)

## Por quê
Substitui/complementa o pipeline manual (Gemini→site chinês→Mixamo/Blender):
imagem→GLB texturizado + **RIGGING E ANIMAÇÃO via CLI** — o mesmo agente que a gente
é. O rig deles atacaria exatamente o gargalo de hoje (o auto-rigger do Mixamo rejeita
Hunyuan V3.1). Conta Meshy do PO já existe (Ana 282k de 22/09 lá dentro).

## Custo
Free tier = créditos limitados/mês (geração nova inclui download); Pro R$108/mês.
Testar com UMA geração free antes de considerar adoção.

## Plano de teste (próxima personagem — Marina)
1. `npm i -g meshy-cli@0.4.0 && meshy auth login` (login browser na conta do PO)
2. Skill `meshy-3d-generation` instalada no opencode (o repo tem formato skill pronto)
3. Imagem do Gemini → `meshy make` (image-to-3d + rig + preview) → GLB
4. Se o rig vier bom: pular o transplante Blender; se vier sem rig: transplant como hoje
5. Comparar tempo/qualidade vs pipeline Hunyuan → documentar na skill oficial
