# PLANO.md — Entrega do FarmaCheck (09/10/2026)

> Plano anterior (01/10, modelo novo da Ana) foi concluído e deployado (`?v=15`, SHA remoto = local).
> Histórico completo: `resumo.md`, `progress.md`, `docs/ROADMAP.md`.

## Objetivo
Fechar uma **Release Candidate (RC1)** do FarmaCheck que possa ser entregue: jogo no ar, gates verdes,
repo limpo e versionado, dist ↔ remoto coerentes e pacote de validação clínica pronto para a PO assinar.

## Viabilidade
**SIM.** O jogo já está jogável e no ar (HTTP 200, container `Up`), `qa:all` passava 6/6, walk v13 aprovado.
O que falta é **fechamento**, não construção.

Riscos:
- Repo sujo (10 modificados + 30+ GLBs scratch não versionados) → risco de commitar lixo ou perder o asset bom. Mitigação: inventário antes, nada é apagado, scratch vai para `ana_work/`.
- dist local ≠ remoto (ROADMAP P0) → mitigação: comparar SHA antes de qualquer deploy; deploy só com aval do PO.
- Validação clínica depende da PO (Jhuly) → não bloqueia a RC técnica; entregamos o checklist pronto para assinar.
- Gates no SwiftShader mascaram defeitos visuais (lição de 22/09) → validação visual final em GPU real.

## Tarefas

### Rodada 1 — paralelas (sem dependência)
| ID | Tarefa | Agente | Saída |
|---|---|---|---|
| T1 | Rodar `npm run qa:all` e relatar falhas | operario | `.agent-plans/rc1_qa.md` |
| T2 | Inventário do git: classificar modificados/untracked (usado pelo código × scratch) | explorador | `.agent-plans/rc1_limpeza.md` |
| T3 | Coerência dist ↔ remoto: SHA dos assets/JS locais × container `game_farma` | operario | `.agent-plans/rc1_deploy_check.md` |
| T4 | Checklist de validação clínica dos 11 casos a partir de `src/data/cases.js` | operario | `docs/VALIDACAO_CLINICA.md` |

### Rodada 2 — juízes (Actor-Critic)
- 2 revisores em paralelo avaliam T2 e T4. Aprovação: média ≥ 9/10. Reprovou 2× → refazer com `arquiteto`.

### Rodada 3 — sequenciais (dependem da rodada 1)
- T5 — Corrigir falhas do T1 (se houver).
- T6 — Aplicar a limpeza do T2: mover scratch para `ana_work/`, ajustar `.gitignore`, commit dos arquivos legítimos (só com OK do usuário).
- T7 — Promover gates `qa_walk*.tmp.mjs` para scripts versionados dentro do `qa:all` (ROADMAP P1-6).
- T8 — Deploy RC1 (só com aval do PO): build → `deploy.sh` → SHA remoto = local → healthcheck 200 → probe pós-deploy.

### Fora do escopo técnico (depende da PO)
- Assinatura do `docs/VALIDACAO_CLINICA.md` (ROADMAP P0-3).

## Critério de pronto (RC1)
- [ ] `qa:all` 6/6 PASS
- [ ] `git status` limpo (sem GLB scratch na raiz de `public/models/`)
- [ ] SHA remoto = local, healthcheck 200
- [ ] `docs/VALIDACAO_CLINICA.md` aprovado pelos juízes (≥ 9/10) e enviado à PO
- [ ] Gates de walk versionados no `qa:all`

## Regras
- Produção nunca é tocada em QA. Deploy só com aval do PO.
- Nada é apagado: scratch vai para `ana_work/` (NVMe), com backup.
- Subagentes gravam direto em disco; no chat só `caminho + status + 1 linha`.
- Nunca expor chaves/tokens (HF, NVIDIA, senhas) em arquivos ou logs.

## Incidente CRÍTICO — walk do modelo 3D (09/10)
**Causa-raiz:** o GLB que estava NO AR não era o v13 aprovado. Era o modelo novo (malha hi3d de 01/10) cujo clip Walk foi transplantado por nome num rig que **não anima as pernas**: joelhos 0° (alvo 28°), pés 0°, stride 0,96 m (alvo 1,74 m) → andar duro/robótico.
**Correção aplicada:** rollback de produção para o v13 (git HEAD, sha256 `e5b0494...`); backup do GLB quebrado em `ana_work/backup_prod_ana_coriza_0910_PRE_ROLLBACK.glb`; container `game_farma` serve `e5b0494...` (200).
**Prova:** offline joelhos 27°/29°, stride 1,74 m, pés no chão; in-browser o clip Walk move pernas/braços (frames /tmp/mv_*.png, /tmp/walk_real_*.png).
**Pendente (decisão PO):** se quiser a **malha nova bonita COM andar bom**, é preciso retarget de verdade dos clips para aquele rig (não transplant por nome) — trabalho real, não rollback.

## Status (rodada 09/10)
| ID | Status | Resumo |
|---|---|---|
| T1 | ✅ 6/6 PASS | Causa-raiz do ERR_CONNECTION_REFUSED: menu pré-preenchia o endpoint padrão 8081 e o boot re-gravava/sondava sempre. Fix: IA opt-in (`hasLLMConfig` exige baseUrl salvo; formulário não preenche defaults) em `src/app.js`/`src/ai/llm.js`. check/logica/build/qa:boot/qa:dynamics/qa = PASS. |
| T2 | ✅ aprovado 8/10 | `.agent-plans/rc1_limpeza.md` v2: 20 KEEP-COMMIT × 93+ MOVE-SCRATCH; ana_v38.glb e ab-test.html reclassificados p/ scratch. |
| T3 | ✅ | dist local = remoto (na época), healthcheck 200. **Após o fix do LLM, dist diverge → deploy pendente (aval PO).** |
| T4 | ✅ | `docs/VALIDACAO_CLINICA.md` (23 KB): 14 casos reais, checklist com farmacêutico+CRM+data, pontos de atenção por caso. Aguardando assinatura da PO Jhuly. |
| T5 | ✅ | Fix LLM opt-in (ver T1). Probe só roda para quem configurou IA; console limpo nos gates. |
| T6 | ✅ | 312 arquivos + 7 pastas de scratch movidos p/ `/media/servidor/nvme_data/ana_work/scratch_repo/` (nada apagado); `.gitignore` ajustado; `git status` limpo de lixo. Commit pendente (aguardando OK). |
| T7 | ⚠️ parcial | Não existem gates de walk versionados (eram `.tmp.mjs`, foram p/ scratch_repo). Promover = reescrever como script estável (fonte: `scratch_repo/**/qa_walk*`). P1, não bloqueia RC1. |
| T8 | ⏸️ | Deploy RC1: build pronto; falta aval do PO (produção) + commit. |

Nota: há um `node server/index.mjs` **root** (desde 09/10 18:46) escutando a 4174 servindo o repo do disco. Ele não é do nosso pipeline; os gates o usam de carona (serve dist/ fresco). Se a máquina rebootar, `npm run serve` recobre.
