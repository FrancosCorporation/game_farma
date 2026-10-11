STATUS ATUAL (10/10/2026): trajetória e passada estão validadas no runtime isolado, mas a qualidade visual da caminhada ainda não está aprovada. Não publicar nem ativar o candidato.

MODELO ATIVO: `ana_clasica` (aprovada), em `src/app.js`, cache-bust `v=38`; produção/DNS permanece no rollback seguro.

MELHOR CANDIDATO DE DIAGNÓSTICO: `ana_work/ana_283k_reweighted_lowerleg_clean.glb`. O gate Walk/Idle, a topologia e o QA de chegada passam; a reponderação reduziu as pontas severas. Continua reprovado porque a malha-fonte já tem pose-base com braços dobrados e mãos erguidas, e o Idle preserva esse gesto. Uma transferência experimental das rotações de braços de `ana_coriza` não resolveu a postura.

DIREÇÃO: obter/re-posear uma fonte 3D com A-pose confortável para o bind (cotovelos quase estendidos) e Idle de braços relaxados; riggear e animar essa mesma malha. Um modelo de linguagem maior não corrige a pose/bind no GLB. Nenhuma geração externa foi iniciada nesta rodada.

QA: `npm run qa:character-walk:runtime -- <url-local> <glb-candidato>` PASS no candidato quanto à rota/pé/Idle; `npm run qa:character-walk -- <glb>` PASS estruturalmente; `npm run qa:character-topology -- <glb>` PASS sem faces renderizadas degeneradas/duplicadas. Esses gates não substituem a aprovação visual dos braços.

DNS: https://francoscorporation.ddns.net/game/ufggame/ — não alterado nesta etapa.

MIXAMO: nenhum upload enviado nesta rodada; a integração Browser/Chrome autenticada não está disponível nesta sessão. Não contornar autenticação com Playwright/CDP externo. Se for necessário auto-rig externo, reconectar o Browser em Settings → Computer use.

SKILL: `SKILL_BANK/SKILL_J_PERSONAGEM_WEB_WALK.md`; aprovar pose-base/Idle antes de investir em transferência de pesos, clips ou otimização.
