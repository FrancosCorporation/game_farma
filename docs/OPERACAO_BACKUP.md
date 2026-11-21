# Backup e restauração local

`scripts/backup_project.sh` cria snapshots do checkout e dos artefatos locais. O destino precisa ficar fora do projeto e não pode existir; o script não sobrescreve backups nem restaura sobre diretórios existentes.

```bash
scripts/backup_project.sh create /caminho/seguro/farmacheck-AAAA-MM-DD.tar.zst
scripts/backup_project.sh verify /caminho/seguro/farmacheck-AAAA-MM-DD.tar.zst
scripts/backup_project.sh restore /caminho/seguro/farmacheck-AAAA-MM-DD.tar.zst /caminho/novo/farmacheck-restaurado
```

O snapshot inclui fontes, documentos, `.planning/`, `ana_work/` e ativos públicos, inclusive arquivos ainda não rastreados pelo Git. Exclui `.git/`, dependências e builds (`node_modules/`, `dist/`), caches e padrões comuns de credenciais (`.env*`, chaves/certificados e arquivos `.token`/`.secrets`). Symlinks no conteúdo incluído fazem a criação falhar. Cada arquivo tem um sidecar SHA-256; snapshots novos também recebem `.manifest.json` e seu `.manifest.json.sha256`, com hashes dos cinco arquivos críticos e o SHA-256 do arquivo compactado. `verify` percorre o arquivo, rejeita caminhos absolutos/`..`/links e valida os sidecars. `restore` extrai para staging num diretório novo, confere os arquivos críticos contra o snapshot — nunca contra o checkout atual — e só então move o staging para o destino. Snapshots antigos sem manifest são compatíveis: o helper extrai os cinco arquivos diretamente do arquivo legado e compara com a restauração.

**Teste local de recuperação em 14/10/2026:** `/media/servidor/nvme_data/scratch/tmp/farmacheck-backup-20261014.tar.zst` (5,0 GB) passou checksum, integridade e checagem de caminhos; a restauração de teste em `farmacheck-restore-verify-20261014/` passou nas cinco comparações. Os dois artefatos permanecem no scratch NVMe desta máquina. Scratch não é retenção durável nem cópia off-host. O projeto ainda não tem política externa de retenção, monitoramento, alertas ou restauração remota configurados.

**Snapshot atualizado após as alterações de 14/10:** `/media/servidor/nvme_data/scratch/tmp/farmacheck-backup-final-20261014.tar.zst` (5,0 GB), SHA-256 `8d797ba66e98dfd41a84eb579835dd8f1f7ddc2000dbc23918e24535aee50f5c`. `create` validou checksum, caminhos e arquivos críticos; `restore` extraiu para `farmacheck-restore-final-20261014/` e comparou os cinco arquivos críticos byte a byte. É outro snapshot no mesmo scratch NVMe, não uma cópia off-host.

**Snapshot pós-FC-034 — 14/10/2026:** `/media/servidor/nvme_data/scratch/tmp/farmacheck-backup-fc034-20261014.tar.zst` (5,0 GB), SHA-256 `f6b945cb0c2fb112005860e5acf07361a679ca410ba1f98c5b7da0d955400ec1`. `create` e `restore` passaram; restauração em `farmacheck-restore-fc034-20261014/`, cinco arquivos críticos byte-idênticos. O backup permanece no scratch NVMe local.

**Snapshot com regressão CLI final — 14/10/2026:** `/media/servidor/nvme_data/scratch/tmp/farmacheck-backup-fc034-verified-20261014.tar.zst` (5,0 GB), SHA-256 `c524cd38181110a94f75ce7fb2358ae50bd3a31dc10984945f5c7a1f516794f7`. A restauração em `farmacheck-restore-fc034-verified-20261014/` passou; os scripts de sync no restore passaram `--check` e o teste CLI `--check`/`--write`. Mantido no mesmo scratch NVMe.

**Limpeza local — 15/10/2026:** as árvores expandidas de teste `farmacheck-restore-*` e o build local `game_farma/dist/` foram removidos por serem saídas recriáveis. Os seis snapshots compactados `farmacheck-backup-*.tar.zst` e seus sidecars `.sha256` foram preservados; as restaurações podem ser repetidas com `scripts/backup_project.sh`.

**Checkpoint autônomo — 17/10/2026:** `/media/servidor/Backup/farmacheck-autonomy-20261017-fc027-checkpoint.tar.zst` (6.681.510.969 bytes; SHA-256 `4bb6e263dcdc7f7d65e4b726547dc01a742977f3d8e4fea395804e6a157b9458`) passou criação, verificação e restauração integral para `farmacheck-autonomy-20261017-fc027-restore-check/`. O volume `/dev/sda1` é um disco SATA separado, mas continua no mesmo host; este checkpoint não é a versão final publicada nem uma cópia off-host. Evidência detalhada: `.planning/2026-10-12-melhoria-integral/implementation/20261017_fc029_backup_recovery_sata/validation.json`.

## Diagnóstico do serviço e do domínio

Use `docker ps`, `docker inspect game_farma --format '{{.State.Health.Status}} {{.Image}}'` e `docker logs --since 15m game_farma`. A partir da porta interna e do valor `PORT` do container:

```bash
docker exec game_farma node -e "Promise.all(['/healthz','/readyz'].map(async p => { const r = await fetch('http://127.0.0.1:' + process.env.PORT + p); console.log(p, r.status, r.headers.get('content-type'), await r.text()); }))"
```

`/healthz` deve responder JSON `{ "status": "ok" }`; `/readyz` deve responder JSON `{ "status": "ready" }`. Um HTTP 200 com `text/html` é a página SPA, não uma confirmação de health. Em 18/10/2026, a rota pública `/healthz` e a prefixada `/game/ufggame/healthz` responderam HTML 200 por fallback; o container ativo também devolveu HTML 200 internamente, apesar de constar `healthy`. Por isso a imagem nova usa `server/healthProbe.mjs` no `HEALTHCHECK`, e o deploy valida JSON internamente. Para rollback a uma imagem antiga, a checagem é nomeada como smoke legado e exige o título FarmaCheck, além da identidade exata da imagem anterior.

Para o endpoint público, confira a página na URL configurada (`PUB_URL`) e o título FarmaCheck; não trate `/healthz` público sob o prefixo da SPA como health. Em 18/10 os resolvedores públicos 8.8.8.8 e 1.1.1.1 resolveram `francoscorporation.ddns.net` para o IP fixo documentado. A consulta do timer de usuário `noip-ddns.timer` não foi possível nesta sessão porque o shell não tinha `DBUS_SESSION_BUS_ADDRESS`/`XDG_RUNTIME_DIR`; não concluí que o updater está ativo.

No ambiente de usuário logado, diagnóstico somente de leitura:

```bash
dig +short francoscorporation.ddns.net @8.8.8.8
dig +short francoscorporation.ddns.net @1.1.1.1
systemctl --user list-timers noip-ddns.timer --no-pager
systemctl --user status noip-ddns.service --no-pager -n 10
journalctl --user -u noip-ddns.service -n 20 --no-pager
tail -20 ~/.local/state/noip-ddns.log
```

Se ambos os resolvedores falharem ou divergirem do IP de saída esperado, inspecione o log/timer antes de agir. A atualização manual configurada é `~/.local/bin/noip-ddns-update`; respeite o limite de uma atualização a cada cinco minutos por host. Nunca imprima, passe na linha de comando ou copie a senha de `~/.config/noip/noip.conf`. Um eventual `nohost` exige corrigir/confirmar o hostname no painel No-IP; reiniciar container não corrige DNS.

Alertas automáticos, retenção externa e cópia off-host ainda não estão configurados. A cópia em `/media/servidor/Backup` fica em outro disco do mesmo host e protege contra falhas do workspace, não contra perda do host. Até existir destino remoto, operador deve verificar periodicamente tamanho, sidecars, manifest e resultado de `verify`; não anuncie retenção/alerta automático.
