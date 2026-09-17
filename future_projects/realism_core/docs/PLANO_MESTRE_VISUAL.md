# 🎯 FarmaCheck — Plano Mestre Visual (objetivo, estratégia e backlog)

> **Data:** 10/09/2026 · **Branch:** `v3-rewrite`
> **Pra quê:** consolidar TUDO em um lugar só — objetivo, a estratégia (assets vs construir),
> o estado atual, o pipeline proposto e TODOS os pontos de melhoria. Serve de entrada
> pra REpassar a um modelo maior/melhor executar as técnicas com mais qualidade.

---

## 1. Objetivo (o que queremos)
Deixar o jogo **maravilhoso visualmente, nível próximo de GTA V** (mid-poly realista),
**leve para a web** (60 fps, budget respirado), com foco PRIMEIRO nos **personagens**.
Cada etapa validada com o **juiz de visão** (llama-cpp multimodal) antes de aceitar.

## 2. Estratégia: ASSETS, NÃO construir do zero
**A verdade dos fatos (já comprovada):** os personagens atuais são `gen_characters.py`
(primitivas Blender) → o juiz deu **CARTOON/RUIM** repetidamente. Primitivas (esferas/
cápsulas/cilindros) têm **teto estrutural**: não geram poros, dedos reais, dobras nem
microexpressão. **Construir do zero NÃO alcança o objetivo.**

**Decisão:** usar **assets prontos** (bases humanas realistas CC0) e trabalhar por cima:
- **Base encontrada:** `vibe_human.glb` (CC0, humano adulto realista, texturas PBR,
  172 bones = esqueleto completo com dedos/rosto, 3.5 MB, ~3k tris). Sem animações/morphs.
- Outras candidatas baixadas: `human2..5.glb` (11–20 MB, mais tri), `Michelle/Soldier/Xbot`
  (three.js), `twist_sample.vrm` (anime), `rpm.glb` (RPM, falha load).

**Técnica (pipeline):**
```
base CC0 realista (.glb com rig + texturas)
  → (Blender ou runtime) retarget das 5 poses clínicas (Idle/Pain/Weakness/Discomfort/Embarrassed)
  → expressões faciais (cada base tem: face bones OU morphs — usar o que tiver)
  → retintar pele/roupa por caso (17 identidades) via material.color/textura
  → otimizar (meshopt + WebP 1024, já no glbLoader.js)
  → integrar no loadGLBFPatient (bone controller já pronto p/ RPM e VRM/Unity)
  → validar com juiz de visão → rebuild + deploy
```
**Trade-off aberto:** `vibe_human.glb` é ótima base (CC0, dedos, PBR) MAS sem anim/morphs
→ precisa de retarget de poses (Blender) e expressão via face-bones. Se for muito custo,
alternativa = base com morphs (VRM) mas anime, ou RPM (realista) se destravar a rede.

## 3. Estado atual (10/09)
| Item | Status |
|---|---|
| Render (AgX, rim light, sheen fake-SSS, sombra de contato) | ✅ |
| Locomoção WASD + zonas 1/2/3 + colisão | ✅ (local; bug remoto §B) |
| Loader meshopt (`glbLoader.js`) + otimização GLB (paciente_real 10.7→783KB) | ✅ (outro agente) |
| Bone controller de pose (RPM `LeftArm` + VRM `J_Bip_*`) | ✅ |
| Base humana realista baixada (`vibe_human.glb` CC0) | ✅ (ainda não integrada) |
| Personagens no jogo com textura real + expressão | ❌ **PENDENTE (foco)** |
| UI: botão com animação de pressão, i18n EN completo | ❌ pendente |

## 4. Backlog de melhorias (completo)

### A. Personagens (PRIORIDADE)
- [ ] Integrar `vibe_human.glb` (ou melhor base) como paciente → ver no jogo.
- [ ] Mapear os 172 bones no bone-controller (dedos/rosto) → poses + respiração.
- [ ] Expressões clínicas (dor → face bones/morphs) + retintar pele/roupa por caso.
- [ ] 17 identidades (paleta + penteado + porte) sobre a base.
- [ ] Validar cada passo com juiz de visão.

### B. Movimento/Input
- [ ] **WASD não funciona remotamente (via DNS externo)** — funciona local. Causa
      provável: só anda após clicar na cena (blur do chat); remoto não clica. Tornar
      movimento robusto + dica visível "clique na cena / WASD".

### C. Interação por proximidade (tecla E)
- [ ] Banner "Pressione E" ao se aproximar de alvo (paciente/PC/mesa).
- [ ] `E` abre: paciente (anamnese), PC (bulário), mesa (TLAC).
- [ ] Ao se afastar do paciente: fechar (ou opcional manter) o chat; voltar + `E` reabre.

### D. UI — tela de início (capa)
- [ ] **Botões com efeito de pressão 3D**: alto-relevo + afundar ao clicar (layer CSS
      por cima do hotspot, transform scale/translate + sombra, e a arte do próprio botão
      já pintada). Ação visual real de "apertou/desceu".
- [ ] **Toggle de idioma PT/EN** com feedback visual (chip marcado destaca, e o EN
      cobre o jogo TODO, não só o shell).

### E. i18n (idioma)
- [ ] Inglês completo (hoje só concha do menu; conteúdo clínico/cases continua PT).

### F. Ambiente (após personagens)
- [ ] Textura real no balcão (madeira), gôndolas (metal), produtos (rótulos).
- [ ] Exterior (prédios/rua) com mais acabamento.
- [ ] Verificar `prop_balcao.glb` etc. — sobrescrevem canvas com material chapado.

## 5. Como proceder (loop)
1. Personagem: integrar base → print → juiz → ajustar → aprovar.
2. Rebuild + deploy no DNS pra ver com os olhos.
3. Depois: UI (capa/botão/i18n), interação (E), movimento (remoto), ambiente.

## 6. Ferramentas prontas
- Juiz de visão: `scripts/vision_judge.py <img> [prompt]` (llama-cpp :8081).
- Validação GLB: `scripts/validate_character.py` · auditoria: `scripts/audit_glb.mjs`.
- Preview com luz do jogo: `public/real-preview.html` + `public/face-preview.html`.
- Blender headless: `/snap/blender/7740/blender -b --python ...` · Blender MCP: `:9876`.
- Optimização: `npx --yes @glacial/gltf-transform-cli@4 optimize <in> <out> --compress meshopt --texture-compress webp --texture-size 1024`.