#!/usr/bin/env bash
# Reproducible deploy. Default is a read-only plan; production and sandbox apply are explicit.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_URL="${PUB_URL:-https://francoscorporation.ddns.net/game/ufggame/}"
NETWORK_NAME="${GAME_FARMA_NETWORK:-base_fundation_app_network}"
CONTAINER_NAME="${GAME_FARMA_CONTAINER_NAME:-game_farma}"
IMAGE_REPOSITORY="${GAME_FARMA_IMAGE_REPO:-game_farma}"
PORT_VALUE="${GAME_FARMA_PORT:-4174}"
HEALTH_ATTEMPTS="${GAME_FARMA_HEALTH_ATTEMPTS:-6}"
HEALTH_INTERVAL="${GAME_FARMA_HEALTH_INTERVAL:-5}"
MODE="dry-run"
SKIP_SANDBOX_BUILD="${GAME_FARMA_SKIP_BUILD:-}"
LLM_ENV_ARGS=()
if [[ -n "${NVIDIA_API_KEY:-}" ]]; then LLM_ENV_ARGS+=(--env NVIDIA_API_KEY); fi
if [[ -n "${NVIDIA_MODEL:-}" ]]; then LLM_ENV_ARGS+=(--env NVIDIA_MODEL); fi
if [[ -n "${LLAMA_BASE_URL:-}" ]]; then LLM_ENV_ARGS+=(--env LLAMA_BASE_URL); fi
if [[ -n "${LLAMA_MODEL:-}" ]]; then LLM_ENV_ARGS+=(--env LLAMA_MODEL); fi

usage() {
  cat <<'USAGE'
Uso:
  bash scripts/deploy.sh --dry-run
  CONFIRM_GAME_FARMA_PRODUCTION=YES bash scripts/deploy.sh --apply
  CONFIRM_GAME_FARMA_SANDBOX=YES \
    GAME_FARMA_CONTAINER_NAME=game_farma_test_local \
    GAME_FARMA_IMAGE_REPO=game_farma_test_local \
    GAME_FARMA_NETWORK=game_farma_test_local \
    PUB_URL=http://127.0.0.1:49100/ bash scripts/deploy.sh --sandbox

--dry-run é o padrão e não chama Docker nem altera produção.
--apply constrói a imagem deste repositório, valida um container isolado,
faz o corte com healthcheck público e recria a imagem anterior em caso de falha.
--sandbox exercita o mesmo ciclo somente com container/rede/imagens game_farma_test_*
e health URL local (127.0.0.1 ou localhost); exige confirmação sandbox separada.
USAGE
}

case "${1:---dry-run}" in
  --dry-run) MODE="dry-run" ;;
  --apply) MODE="apply" ;;
  --sandbox) MODE="sandbox" ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

RELEASE_ID="${GAME_FARMA_RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$ ]]; then
  echo "GAME_FARMA_RELEASE_ID inválido; use letras, números, ponto, _ ou -." >&2
  exit 2
fi

IMAGE_TAG="${IMAGE_REPOSITORY}:release-${RELEASE_ID}"
ROLLBACK_TAG="${IMAGE_REPOSITORY}:rollback-${RELEASE_ID}"
LATEST_TAG="${IMAGE_REPOSITORY}:latest"
STAGE_NAME="${CONTAINER_NAME}_stage_${RELEASE_ID//[^A-Za-z0-9_-]/_}_$$"

if [[ ! "$PORT_VALUE" =~ ^[0-9]{1,5}$ ]] || ((PORT_VALUE < 1 || PORT_VALUE > 65535)); then
  echo "GAME_FARMA_PORT inválida; use um porto entre 1 e 65535." >&2
  exit 2
fi
if [[ ! "$HEALTH_ATTEMPTS" =~ ^[0-9]{1,2}$ ]] || ((HEALTH_ATTEMPTS < 1 || HEALTH_ATTEMPTS > 12)); then
  echo "GAME_FARMA_HEALTH_ATTEMPTS inválido; use um inteiro entre 1 e 12." >&2
  exit 2
fi
if [[ ! "$HEALTH_INTERVAL" =~ ^[0-9]{1,2}$ ]] || ((HEALTH_INTERVAL < 0 || HEALTH_INTERVAL > 60)); then
  echo "GAME_FARMA_HEALTH_INTERVAL inválido; use um inteiro entre 0 e 60." >&2
  exit 2
fi

if [[ "$MODE" == "sandbox" ]]; then
  if [[ "${CONFIRM_GAME_FARMA_SANDBOX:-}" != "YES" ]]; then
    echo "Sandbox bloqueado: confirme com CONFIRM_GAME_FARMA_SANDBOX=YES." >&2
    exit 2
  fi
  if [[ "$CONTAINER_NAME" != game_farma_test_* \
     || "$IMAGE_REPOSITORY" != game_farma_test_* \
     || "$NETWORK_NAME" != game_farma_test_* ]]; then
    echo "Sandbox bloqueado: container, repositório de imagem e rede devem começar com game_farma_test_." >&2
    exit 2
  fi
  if [[ ! "$PUBLIC_URL" =~ ^http://(127\.0\.0\.1|localhost):([0-9]{1,5})(/[^[:space:]]*)?$ ]]; then
    echo "Sandbox bloqueado: PUB_URL deve usar http://127.0.0.1:<porto>/ ou http://localhost:<porto>/ ." >&2
    exit 2
  fi
  if ((${BASH_REMATCH[2]} < 1 || ${BASH_REMATCH[2]} > 65535)); then
    echo "Sandbox bloqueado: a porta de PUB_URL deve estar entre 1 e 65535." >&2
    exit 2
  fi
  if [[ -n "$SKIP_SANDBOX_BUILD" && "$SKIP_SANDBOX_BUILD" != "YES" ]]; then
    echo "Sandbox bloqueado: GAME_FARMA_SKIP_BUILD aceita somente YES ou vazio." >&2
    exit 2
  fi
elif [[ "$MODE" == "apply" && "${CONFIRM_GAME_FARMA_PRODUCTION:-}" != "YES" ]]; then
  echo "Deploy bloqueado: confirme produção com CONFIRM_GAME_FARMA_PRODUCTION=YES." >&2
  exit 2
fi
if [[ "$MODE" != "sandbox" && "$SKIP_SANDBOX_BUILD" == "YES" ]]; then
  echo "GAME_FARMA_SKIP_BUILD=YES só pode ser usado em --sandbox." >&2
  exit 2
fi
if [[ "$MODE" == "apply" && "$PUBLIC_URL" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?(/|$) ]]; then
  echo "Deploy bloqueado: URL de health de produção não pode apontar para loopback." >&2
  exit 2
fi

if [[ "$MODE" == "dry-run" ]]; then
  cat <<PLAN
Plano de deploy (nenhuma alteração executada):
  Modo:         $MODE
  Código:       $PROJECT_ROOT
  Dockerfile:   $PROJECT_ROOT/Dockerfile
  Imagem nova:  $IMAGE_TAG
  Rollback:     $ROLLBACK_TAG
  Container:    $CONTAINER_NAME
  Rede:         $NETWORK_NAME
  URL pública:  $PUBLIC_URL
  Etapas:       build versionado → readiness JSON interna → troca → smoke da página pública
  Segurança:    --apply exige CONFIRM_GAME_FARMA_PRODUCTION=YES; --sandbox exige prefixos isolados e CONFIRM_GAME_FARMA_SANDBOX=YES
PLAN
  exit 0
fi

for required_command in docker curl; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Comando obrigatório ausente: $required_command" >&2
    exit 2
  fi
done

if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Container $CONTAINER_NAME não existe; recusando primeiro deploy implícito." >&2
  exit 2
fi
if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Rede Docker ausente: $NETWORK_NAME" >&2
  exit 2
fi
if [[ "$SKIP_SANDBOX_BUILD" == "YES" ]]; then
  if [[ "$MODE" != "sandbox" ]] || ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    echo "Imagem pré-construída não existe para este sandbox: $IMAGE_TAG" >&2
    exit 2
  fi
  if docker image inspect "$ROLLBACK_TAG" >/dev/null 2>&1; then
    echo "Tag de rollback já existe; escolha GAME_FARMA_RELEASE_ID novo." >&2
    exit 2
  fi
elif docker image inspect "$IMAGE_TAG" >/dev/null 2>&1 || docker image inspect "$ROLLBACK_TAG" >/dev/null 2>&1; then
  echo "Tag versionada já existe; escolha GAME_FARMA_RELEASE_ID novo." >&2
  exit 2
fi

PREVIOUS_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$CONTAINER_NAME")"
if [[ -z "$PREVIOUS_IMAGE_ID" ]]; then
  echo "Não foi possível identificar a imagem atual; deploy cancelado." >&2
  exit 2
fi

wait_internal_health() {
  local container_name="$1"
  local attempt
  for ((attempt=1; attempt<=HEALTH_ATTEMPTS; attempt++)); do
    if docker exec "$container_name" node server/healthProbe.mjs >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

wait_legacy_rollback_smoke() {
  local container_name="$1"
  docker exec "$container_name" node -e \
    "fetch('http://127.0.0.1:'+(process.env.PORT||4174)+'/').then(async r=>process.exit(r.ok&&(await r.text()).includes('<title>FarmaCheck')?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

wait_public_smoke() {
  local attempt
  for ((attempt=1; attempt<=HEALTH_ATTEMPTS; attempt++)); do
    if curl --fail --silent --show-error --max-time 20 "$PUBLIC_URL" 2>/dev/null | grep --fixed-strings '<title>FarmaCheck' >/dev/null; then
      return 0
    fi
    echo "Smoke público da página FarmaCheck falhou na tentativa $attempt."
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

rollback_to_previous() {
  echo "Healthcheck falhou; recriando imagem anterior $ROLLBACK_TAG em $CONTAINER_NAME."
  docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true
  if ! docker run --detach --restart unless-stopped --name "$CONTAINER_NAME" \
      --network "$NETWORK_NAME" -e HOST=0.0.0.0 -e "PORT=$PORT_VALUE" \
      -e NODE_ENV=production "${LLM_ENV_ARGS[@]}" "$ROLLBACK_TAG"; then
    echo "ERRO: não foi possível iniciar o rollback automático." >&2
    return 1
  fi
  if ! wait_legacy_rollback_smoke "$CONTAINER_NAME" || ! wait_public_smoke; then
    echo "ERRO: rollback iniciou, mas seu healthcheck também falhou." >&2
    return 1
  fi
  RESTORED_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$CONTAINER_NAME")"
  if [[ "$RESTORED_IMAGE_ID" != "$PREVIOUS_IMAGE_ID" ]]; then
    echo "ERRO: rollback iniciou imagem diferente da imagem anterior exata." >&2
    return 1
  fi
  docker tag "$ROLLBACK_TAG" "$LATEST_TAG"
  echo "Rollback restaurou a imagem anterior exata e passou o smoke legado de página."
}

echo "Marcando imagem atual como $ROLLBACK_TAG"
docker tag "$PREVIOUS_IMAGE_ID" "$ROLLBACK_TAG"

if [[ "$SKIP_SANDBOX_BUILD" == "YES" ]]; then
  echo "Usando imagem pré-construída do sandbox: $IMAGE_TAG"
else
  echo "Construindo $IMAGE_TAG com o Dockerfile deste repositório"
  docker build --file "$PROJECT_ROOT/Dockerfile" --tag "$IMAGE_TAG" "$PROJECT_ROOT"
fi

echo "Executando smoke isolado do build"
docker run --detach --name "$STAGE_NAME" --network none \
  --restart no -e HOST=0.0.0.0 -e "PORT=$PORT_VALUE" -e NODE_ENV=production \
  "${LLM_ENV_ARGS[@]}" "$IMAGE_TAG" >/dev/null
if ! wait_internal_health "$STAGE_NAME"; then
  docker logs "$STAGE_NAME" || true
  docker rm --force "$STAGE_NAME" >/dev/null 2>&1 || true
  echo "Smoke interno falhou; container game_farma não foi alterado." >&2
  exit 1
fi
docker rm --force "$STAGE_NAME" >/dev/null

echo "Substituindo container $CONTAINER_NAME"
if ! docker rm --force "$CONTAINER_NAME" >/dev/null; then
  echo "Não foi possível remover o container atual; deploy foi cancelado." >&2
  exit 1
fi
if ! docker run --detach --restart unless-stopped --name "$CONTAINER_NAME" \
    --network "$NETWORK_NAME" -e HOST=0.0.0.0 -e "PORT=$PORT_VALUE" \
    -e NODE_ENV=production "${LLM_ENV_ARGS[@]}" "$IMAGE_TAG"; then
  rollback_to_previous
  exit 1
fi

if ! wait_internal_health "$CONTAINER_NAME" || ! wait_public_smoke; then
  rollback_to_previous
  exit 1
fi

docker tag "$IMAGE_TAG" "$LATEST_TAG"
echo "Deploy pronto: readiness JSON interna e smoke público passaram: $IMAGE_TAG → $PUBLIC_URL (container $CONTAINER_NAME)"
