#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CONFIRM_PATIENT_REVIEW_DEPLOY:-}" != "YES" ]]; then
  echo "Defina CONFIRM_PATIENT_REVIEW_DEPLOY=YES para publicar a vitrine de revisão." >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${PATIENT_REVIEW_CONTAINER:-game_farma}"
PUBLIC_BASE="${PATIENT_REVIEW_PUBLIC_BASE:-https://francoscorporation.ddns.net/game/ufggame/}"
RELEASE_ID="$(date -u '+%Y%m%dT%H%M%SZ')"
ROLLBACK_CONTAINER="${CONTAINER}-review-rollback-${RELEASE_ID}"
BASE_TAG="game_farma:review-base-${RELEASE_ID}"
RELEASE_TAG="game_farma:patient-review-${RELEASE_ID}"
WORK="$(mktemp -d "/tmp/patient-review-overlay-${RELEASE_ID}.XXXXXX")"
STAGE="patient-review-stage-${RELEASE_ID}"
NETWORK=""
IMAGE_NAME=""
BASE_IMAGE=""
RESTART_POLICY="unless-stopped"
OLD_STOPPED=0
OLD_DISCONNECTED=0
OLD_RENAMED=0
NEW_STARTED=0
TAG_MOVED=0
DEPLOY_SUCCEEDED=0

cleanup() {
  local exit_status=$?
  trap - EXIT
  set +e
  docker rm -f "$STAGE" >/dev/null 2>&1
  if (( DEPLOY_SUCCEEDED == 0 )); then
    if (( NEW_STARTED == 1 )); then
      docker rm -f "$CONTAINER" >/dev/null 2>&1
    fi
    if (( OLD_RENAMED == 1 )); then
      docker rename "$ROLLBACK_CONTAINER" "$CONTAINER" >/dev/null 2>&1
      docker network connect --alias "$CONTAINER" "$NETWORK" "$CONTAINER" >/dev/null 2>&1
      docker start "$CONTAINER" >/dev/null 2>&1
    elif (( OLD_STOPPED == 1 )); then
      if (( OLD_DISCONNECTED == 1 )); then
        docker network connect --alias "$CONTAINER" "$NETWORK" "$CONTAINER" >/dev/null 2>&1
      fi
      docker start "$CONTAINER" >/dev/null 2>&1
    fi
    if (( TAG_MOVED == 1 )); then docker tag "$BASE_TAG" "$IMAGE_NAME" >/dev/null 2>&1; fi
    if (( OLD_RENAMED == 1 || OLD_STOPPED == 1 || NEW_STARTED == 1 )); then
      echo "Publicação interrompida; rollback aplicado para o container anterior." >&2
    fi
  fi
  rm -rf "$WORK"
  exit "$exit_status"
}
trap cleanup EXIT
umask 077

for command_name in docker node curl npm; do
  command -v "$command_name" >/dev/null || { echo "Comando necessário indisponível: $command_name" >&2; exit 69; }
done
[[ -f "$ROOT/dist/patient-review.html" && -f "$ROOT/dist/patient-review.json" ]] || {
  echo "Execute npm run build antes de publicar." >&2
  exit 66
}
docker inspect "$CONTAINER" >/dev/null
[[ "$(docker inspect "$CONTAINER" --format '{{.State.Status}}')" == "running" ]] || {
  echo "O container $CONTAINER não está rodando." >&2
  exit 69
}
[[ "$(docker inspect "$CONTAINER" --format '{{json .Mounts}}')" == "[]" ]] || {
  echo "O container atual possui mounts; a rotina de rollback exige uma revisão manual." >&2
  exit 69
}
PORT_BINDINGS="$(docker inspect "$CONTAINER" --format '{{json .HostConfig.PortBindings}}')"
[[ "$PORT_BINDINGS" == "null" || "$PORT_BINDINGS" == "{}" ]] || {
  echo "O container atual publica portas; a rotina de troca exige uma revisão manual." >&2
  exit 69
}

BASE_IMAGE="$(docker inspect "$CONTAINER" --format '{{.Image}}')"
IMAGE_NAME="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
NETWORK="$(docker inspect "$CONTAINER" --format '{{.HostConfig.NetworkMode}}')"
RESTART_POLICY="$(docker inspect "$CONTAINER" --format '{{.HostConfig.RestartPolicy.Name}}')"
[[ -n "$NETWORK" && "$NETWORK" != "default" && "$NETWORK" != "none" ]] || {
  echo "Rede de produção inesperada: $NETWORK" >&2
  exit 69
}
[[ -n "$IMAGE_NAME" && -n "$BASE_IMAGE" ]] || { echo "Imagem base não identificada." >&2; exit 69; }
docker tag "$BASE_IMAGE" "$BASE_TAG"
docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$WORK/container.env"
docker inspect "$CONTAINER" --format '{{range $key, $value := .Config.Labels}}{{printf "%s=%s\n" $key $value}}{{end}}' > "$WORK/container.labels"

mkdir -p "$WORK/context/dist"
node --input-type=module - "$ROOT/dist" "$WORK/context/dist" <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [sourceRoot, destinationRoot] = process.argv.slice(2);
const registry = JSON.parse(readFileSync(join(sourceRoot, 'patient-review.json'), 'utf8'));
assert.equal(registry.schema, 1);
assert.equal(registry.patients.length, 14, 'o elenco deve conter 14 pacientes');
assert.equal(registry.patients.filter((patient) => patient.model).length, 14, 'todos os pacientes precisam de um modelo');

const selected = new Set([
  'patient-review.html', 'patient-review.js', 'patient-review.css',
  'patient-review-3d.js', 'patient-review.json',
]);
for (const patient of registry.patients) {
  const modelPath = `models/${patient.model}.glb`;
  const file = join(sourceRoot, modelPath);
  assert.ok(existsSync(file), `${patient.id}: arquivo GLB ausente`);
  const data = readFileSync(file);
  assert.equal(data.toString('ascii', 0, 4), 'glTF', `${patient.id}: arquivo não é um GLB`);
  const digest = createHash('sha256').update(data).digest('hex');
  assert.equal(registry.modelSha256[modelPath], digest, `${patient.id}: hash diferente do manifesto`);
  selected.add(modelPath);
  for (const reference of patient.references || []) {
    assert.ok(existsSync(join(sourceRoot, reference)), `${patient.id}: referência ausente ${reference}`);
    selected.add(reference);
  }
}

for (const relativePath of selected) {
  const source = join(sourceRoot, relativePath);
  const destination = join(destinationRoot, relativePath);
  assert.ok(existsSync(source), `recurso da revisão ausente: ${relativePath}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
cpSync(join(sourceRoot, 'vendor/three'), join(destinationRoot, 'vendor/three'), { recursive: true });
console.log(`Payload da revisão verificado: ${registry.patients.length} pacientes, ${selected.size} recursos e hashes íntegros.`);
NODE

cat > "$WORK/context/Dockerfile" <<EOF
FROM $BASE_TAG
COPY dist/ /app/dist/
EOF
docker build --pull=false --tag "$RELEASE_TAG" "$WORK/context"

cat > "$WORK/smoke.mjs" <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = process.argv[2].replace(/\/$/, '');
const checkAsset = async (path, expectedHash) => {
  const response = await fetch(`${base}/${path}`);
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  assert.ok(data.length > 0, `${path}: resposta vazia`);
  if (expectedHash) {
    assert.equal(data.toString('ascii', 0, 4), 'glTF', `${path}: servidor devolveu conteúdo que não é GLB`);
    assert.equal(createHash('sha256').update(data).digest('hex'), expectedHash, `${path}: SHA-256 diferente`);
  }
};

const page = await fetch(`${base}/patient-review.html`);
assert.equal(page.status, 200, 'página de revisão');
assert.match(await page.text(), /14 pacientes têm modelo 3D/);
const response = await fetch(`${base}/patient-review.json`);
assert.equal(response.status, 200, 'manifesto de revisão');
const registry = await response.json();
assert.equal(registry.patients.length, 14);
assert.equal(registry.patients.filter((patient) => patient.model).length, 14);
for (const patient of registry.patients) {
  const path = `models/${patient.model}.glb`;
  await checkAsset(path, registry.modelSha256[path]);
  for (const reference of patient.references || []) await checkAsset(reference);
}
console.log(`Smoke HTTP aprovado: página, manifesto, 14 GLBs e referências de ${registry.patients.length} pacientes.`);
NODE

PORT_VALUE="$(sed -n 's/^PORT=//p' "$WORK/container.env" | tail -1)"
PORT_VALUE="${PORT_VALUE:-4174}"
docker run --detach --name "$STAGE" --network none --restart no --env-file "$WORK/container.env" \
  --label-file "$WORK/container.labels" "$RELEASE_TAG" >/dev/null
docker cp "$WORK/smoke.mjs" "$STAGE:/tmp/patient-review-smoke.mjs" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$STAGE" node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  if (( attempt == 30 )); then echo "Container de smoke não ficou pronto." >&2; exit 70; fi
  sleep 2
done
docker exec "$STAGE" node /tmp/patient-review-smoke.mjs "http://127.0.0.1:$PORT_VALUE"
docker rm -f "$STAGE" >/dev/null

# Preserve the image name used by the existing production service while keeping
# the exact prior image available for rollback under BASE_TAG.
docker tag "$RELEASE_TAG" "$IMAGE_NAME"
TAG_MOVED=1
docker stop --time 15 "$CONTAINER" >/dev/null
OLD_STOPPED=1
docker network disconnect "$NETWORK" "$CONTAINER"
OLD_DISCONNECTED=1
docker rename "$CONTAINER" "$ROLLBACK_CONTAINER"
OLD_RENAMED=1
docker run --detach --name "$CONTAINER" --network "$NETWORK" --network-alias "$CONTAINER" \
  --restart "$RESTART_POLICY" --env-file "$WORK/container.env" --label-file "$WORK/container.labels" \
  "$IMAGE_NAME" >/dev/null
NEW_STARTED=1

for attempt in $(seq 1 45); do
  if docker exec "$CONTAINER" node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  if (( attempt == 45 )); then echo "Novo container não ficou pronto; rollback será executado." >&2; exit 70; fi
  sleep 2
done

node "$WORK/smoke.mjs" "$PUBLIC_BASE"
npm --prefix "$ROOT" run qa:patient-review -- "$PUBLIC_BASE" "$WORK/public-browser-qa"

DEPLOY_SUCCEEDED=1
echo "Vitrine publicada e validada em $PUBLIC_BASE"
echo "Container anterior preservado para rollback: $ROLLBACK_CONTAINER"
echo "Imagem da revisão: $RELEASE_TAG"
