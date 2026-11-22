# Correções do jogo — candidato local de 22/11/2026

## Origem e integridade

| Arquivo | SHA-256 |
|---|---|
| `correçoes jogo.pdf` | `5a2f6dab37701ca81f3dc2b572126e2c99a50c481dab723a2866aca43fd549db` |
| `public/models/candidates/marina_patient_v001.glb` | `0d075417ed9f947a3fd942eba647441aee3f36b69e253e466753e621a23fd321` |
| `src/scene/patient.js` | `a2261b7d3084481ea796a992e6e86fdfe424c343a5a2df52b4fb1792f8ca3d5f` |
| `src/ui/dsf.js` | `a3ad74fc07d071895d0406efb1be9500c2ebf26cea8c87119658bb740e40b7b9` |
| `src/core/dsfStorage.js` | `6707e857fbeaf8ca9160b3baad55b6d923a9e35af1dbd4fba3ba9144a3824cda` |
| `src/app.js` | `cf785aba72df436766b1e80f5b9da6372b6a43e6f3f333d74e704d7b530aed41` |
| `src/ai/llm.js` | `aa7608168a116142e62db1a5614806d45a67c1effa5eb69c8ea855c8247f54c7` |
| `server/index.mjs` | `d2cfe86744d74ef4629bfc0c74980be913fcb2e4939123c31a818fb0e02b400f` |

## Verificações

- `CAST_PROVENANCE_MODE=checkout npm run verify`: passou novamente após as mudanças de IA, DSF, pontuação e interface.
- `node scripts/qa_dsf_preview_security.mjs`: salvamento, reabertura, edição, persistência e texto seguro passaram.
- `node scripts/qa_accessibility_panels.mjs`: desktop/celular, PT/EN passaram.
- `SMOKE_RESULT_OVERRIDE=negativo SMOKE_URL=http://127.0.0.1:4173/ npm run qa:flow:matrix`: quatro fluxos passaram no preview. A mesma matriz passou 4/4 no contêiner candidato em `http://127.0.0.1:49112/` (log `docs/evidencias/qa-flow-container-20261122.log`). O valor foi temporário e exclusivo de QA.
- Smoke focal após confirmar a conduta: DSF emitida com texto breve recebeu +10, em vez de zero; o gabarito clínico completo continua valendo +30.
- Caminhada real em Chromium: na ANAMNESE `walking=false`, `walkRunning=false`, `idleRunning=true`.
- Proxy local llama.cpp: `/api/llm/primary/models` e `/chat/completions` retornaram HTTP 200 com texto gerado. O padrão foi ajustado para descobrir o modelo ativo do contêiner `llama-cpp`.
- Fallback NVIDIA no contêiner candidato com Mariana e modelo local indisponível: resposta nova em 985 ms, SHA-256 `48965ea436836123530729ca9b7e0caef50ded9f338baedd8ba22bb5fa1d898a`; evidência `docs/evidencias/nvidia-mariana-20261122.json`.

O QA de boot no host atingiu ANAMNESE em desktop e celular; a asserção de console limpo falhou porque o host não possui o sintetizador de voz instalado. No contêiner candidato, `qa:boot` passou em desktop e celular, com áudio e console limpo (`docs/evidencias/qa-boot-container-20261122.json`).

## Fechamento e publicação

O usuário esclareceu que as opções de sinais de alarme não devem antecipar “negado” e que a correção ocorre no relatório final. O caso Mariana continua com NS1 sem positividade/negatividade clínica inventada. A tela do teste mostra apenas que ele foi realizado. O teste focal verificou que uma marcação incorreta desconta 3 pontos e só é explicada depois de confirmar a conduta.

- Verify integral: `docs/evidencias/verify-20261122.log` (PASS).
- Matriz final sem valor NS1 injetado: `docs/evidencias/qa-flow-neutral-matrix-20261122.log` (4/4 PASS).
- Fluxo na URL pública: `docs/evidencias/qa-flow-public-20261122.log` (PASS).
- Fallback NVIDIA na URL pública: `docs/evidencias/nvidia-mariana-public-20261122.json` (HTTP 200, resposta gerada para Mariana).
- Imagem publicada: `game_farma:release-20261122-correcoes-final`, `sha256:0191a7bc55d9975a754848e9c5259c4da8595640c8093d7ad68310e8e8241b8a`.
- URL pública: `https://francoscorporation.ddns.net/game/ufggame/`. HTML e chunks JS/CSS do documento idênticos ao build local. `/healthz` e `/readyz` HTTP 200; contêiner healthy.
