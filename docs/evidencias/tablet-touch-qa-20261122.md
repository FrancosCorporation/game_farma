# QA touch e responsividade — release 1.3.0

Data: 22/11/2026  
URL: `https://francoscorporation.ddns.net/game/ufggame/`  
Commit: `f88204c` (`Corrige fullscreen no menu para tablets`)  
Imagem: `game_farma:release-20261122-tablet-fullscreen-v130`  
Digest: `sha256:c11186da12ad745a5a29c63e3c37d7f4cc4199e93204b30715371b697c5276b7`

## Resultado

- Build local e cópia de assets públicos: PASS; os 14 hashes de modelos de revisão conferem.
- Deploy: readiness interno e smoke público PASS.
- O botão de tela cheia aparece no menu em tablet touch com 1280×800.
- Tela cheia entra e sai, mantém o botão acessível, e o direcional responde a toque mantido.
- O retorno ao balcão funciona.
- Layout dentro da tela e direcional sem sobreposição com conversa/ações: PASS em tablet paisagem 1024×768, celular retrato 390×844 e celular paisagem 844×390.
- 19 verificações funcionais/de layout passaram. O roteiro registrou uma resposta HTTP 404 no console sem revelar a URL solicitada; por isso, o gate de console limpo não passou. Isso não impediu os fluxos nem o healthcheck.

O roteiro de QA disponível também seleciona qualidade sem abrir o painel de configurações do menu. Para esta execução, foi usado um arquivo temporário que primeiro abriu esse painel. A URL do jogo e o código do jogo não foram alterados por essa adaptação.

Os relatórios e capturas estão em `docs/evidencias/tablet-touch-qa-20261122/production/`. A validação é por Chromium com emulação touch, não por aparelho físico.
