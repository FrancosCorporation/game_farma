#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_ROOT"' EXIT
FIXTURE="$TEMP_ROOT/repo"
mkdir -p "$FIXTURE/scripts"
cp -- "$SOURCE_ROOT/scripts/backup_project.sh" "$FIXTURE/scripts/backup_project.sh"

CRITICAL_FILES=(
  plan.md
  resumo.md
  src/core/game.js
  docs/elenco_proveniencia.json
  public/patient-review.json
)

write_version() {
  local version="$1"
  local relative
  for relative in "${CRITICAL_FILES[@]}"; do
    mkdir -p "$FIXTURE/$(dirname "$relative")"
    printf '%s:%s\n' "$version" "$relative" > "$FIXTURE/$relative"
  done
}

assert_version() {
  local root="$1"
  local version="$2"
  local relative
  for relative in "${CRITICAL_FILES[@]}"; do
    [[ "$(cat "$root/$relative")" == "$version:$relative" ]] || {
      printf 'versão incorreta em %s (%s)\n' "$root/$relative" "$version" >&2
      exit 1
    }
  done
}

write_version snapshot-A
ARCHIVE="$TEMP_ROOT/snapshot.tar.zst"
"$FIXTURE/scripts/backup_project.sh" create "$ARCHIVE" >/dev/null
[[ -f "$ARCHIVE.manifest.json" ]] || { echo 'manifest novo ausente' >&2; exit 1; }

write_version checkout-B
RESTORED="$TEMP_ROOT/restored-old"
"$FIXTURE/scripts/backup_project.sh" restore "$ARCHIVE" "$RESTORED" >/dev/null
assert_version "$RESTORED" snapshot-A
assert_version "$FIXTURE" checkout-B

# A manifest mutation cannot make a valid archive appear to restore the wrong bytes.
TAMPERED="$TEMP_ROOT/tampered.tar.zst"
cp -- "$ARCHIVE" "$TAMPERED"
cp -- "$ARCHIVE.sha256" "$TAMPERED.sha256"
cp -- "$ARCHIVE.manifest.json" "$TAMPERED.manifest.json"
cp -- "$ARCHIVE.manifest.json.sha256" "$TAMPERED.manifest.json.sha256"
(cd "$TEMP_ROOT" && sha256sum "${TAMPERED##*/}.manifest.json") > "$TAMPERED.manifest.json.sha256"
python3 - "$TAMPERED.manifest.json" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    manifest = json.load(handle)
key = next(iter(manifest["criticalFiles"]))
manifest["criticalFiles"][key] = "0" * 64
with open(path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle)
    handle.write("\n")
PY
if "$FIXTURE/scripts/backup_project.sh" verify "$TAMPERED" >/dev/null 2>&1; then
  echo 'verify aceitou manifest alterado sem atualizar seu checksum' >&2
  exit 1
fi
(cd "$TEMP_ROOT" && sha256sum "${TAMPERED##*/}.manifest.json") > "$TAMPERED.manifest.json.sha256.tmp"
mv -- "$TAMPERED.manifest.json.sha256.tmp" "$TAMPERED.manifest.json.sha256"
if "$FIXTURE/scripts/backup_project.sh" restore "$TAMPERED" "$TEMP_ROOT/tampered-restore" >/dev/null 2>&1; then
  echo 'restore aceitou hash crítico alterado' >&2
  exit 1
fi
[[ ! -e "$TEMP_ROOT/tampered-restore" ]] || { echo 'restore deixou diretório parcial após falha' >&2; exit 1; }
if compgen -G "$TEMP_ROOT/.tampered-restore.restore.*" >/dev/null; then
  echo 'restore deixou staging temporário após falha' >&2
  exit 1
fi

# A snapshot format that predates manifests still restores against its own archive bytes.
LEGACY="$TEMP_ROOT/legacy.tar.zst"
tar --zstd --create --file "$LEGACY" --directory "$FIXTURE" .
(cd "$TEMP_ROOT" && sha256sum "${LEGACY##*/}") > "$LEGACY.sha256"
write_version checkout-C
"$FIXTURE/scripts/backup_project.sh" restore "$LEGACY" "$TEMP_ROOT/restored-legacy" >/dev/null
assert_version "$TEMP_ROOT/restored-legacy" checkout-B
assert_version "$FIXTURE" checkout-C

echo 'PASS backup restore: snapshot anterior, manifest crítico e compatibilidade legada'
