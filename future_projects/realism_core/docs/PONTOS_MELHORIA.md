# 📋 FarmaCheck — Pontos de Melhoria (backlog vivo)

> Data: 10/09/2026 · Branch: `v3-rewrite`
> Fonte: feedback do PO. Ordem NÃO é prioridade — a prioridade atual é
> **PERSONAGENS 3D (realismo)**. Os demais itens entram depois.

---

## A. Personagens 3D (PRIORIDADE ATUAL)
- [ ] **Realismo nível GTA V**: corpo humano real (não cilindro/chibi), dedos
      articulados, olhos/nariz/boca definidos, textura de pele PBR.
- [ ] **Base humana real** com textura — já baixada: `vibe_human.glb` (CC0, 172 bones,
      PBR). Integrar + poses + expressões. (RPM bloqueado; VRM=pixiv é anime.)
- [ ] Retintar pele pra tom humano natural + roupas por caso (R2).
- [ ] 5 poses clínicas (R3) + expressões de dor (R4).
- [ ] Validar cada mudança com o **juiz de visão** (`scripts/vision_judge.py`).

## B. Movimento / Input
- [ ] **WASD não funciona fora do servidor (via DNS remoto)** — funciona local.
      Investigar: foco do canvas vs chat (o WASD só anda depois de clicar na cena;
      remoto o usuário não clica) → tornar o movimento mais robusto/descobrível.
- [ ] Indicar na tela: "clique na cena / WASD para andar".

## C. Interação por proximidade (tecla E)
- [ ] Mostrar **banner "Pressione E"** ao chegar perto de alvo (paciente, computador, mesa).
- [ ] `E` interage: paciente → abre caso/anamnese; computador → bulário; mesa → TLAC.
- [ ] Ao **afastar do paciente**: fechar (ou opcionalmente manter) a caixa de diálogo —
      não conversar à distância. Voltar perto + `E` reabre.

## D. UI — tela de início (capa)
- [ ] **Botões com efeito de pressão 3D**: alto-relevo + "afundar" ao clicar (camada
      visual por cima do hotspot, com transform/scale/shadow), botão sobe e desce como
      se fosse apertado. Ação visual real, não só a foto.
- [ ] **Toggle PT/EN com feedback visual**: chip marcado destaca; trocar de idioma
      reflete na interface de forma visível.

## D. Ambiente (depois dos personagens)
- [ ] Texturas reais no **balcão** (madeira), **gôndolas** (metal), **produtos** (rótulos).
- [ ] Prédios/rua do exterior, chão/arquitetura com mais acabamento.

## E. Observações
- O `prop_balcao.glb` etc. sobrescrevem os canvas procedurais com material chapado
  (juiz viu "balcão liso"). Verificar se vale manter os GLBs de prop ou usar os canvas.
- Juiz de visão: modelo `Qwen3.8-9B` multimodal no llama-cpp :8081 (mmproj na CPU
  via `--no-mmproj-offload`; na VRAM quebra por rocBLAS, precisa reboot do host).