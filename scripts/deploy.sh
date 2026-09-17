#!/usr/bin/env bash
# Deploy de produção do game_farma (FarmaCheck) com healthcheck + rollback automático.
# Uso: bash scripts/deploy.sh
# URL: https://francoscorporation.ddns.net/game/ufggame/
set -euo pipefail

PUB="${PUB_URL:-https://francoscorporation.ddns.net/game/ufggame/}"

if docker image inspect game_farma:latest >/dev/null 2>&1; then
  docker tag game_farma:latest game_farma:previous || true
  echo "🏷️  imagem anterior marcada como game_farma:previous"
fi

bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh

ok=0
for i in 1 2 3 4 5 6; do
  sleep 5
  code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$PUB" || echo 000)
  if [ "$code" = "200" ]; then ok=1; break; fi
  echo "   healthcheck tentativa $i: HTTP $code"
done

if [ "$ok" = "1" ]; then
  echo "✅ Deploy OK (healthcheck = 200) → $PUB"
else
  echo "❌ Healthcheck falhou — rollback para game_farma:previous"
  docker rm -f game_farma >/dev/null 2>&1 || true
  docker run -d --name game_farma --network base_fundation_app_network \
    -e HOST=0.0.0.0 -e PORT=4174 game_farma:previous
  exit 1
fi
