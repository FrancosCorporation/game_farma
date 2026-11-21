#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROGRAM="${0##*/}"
CRITICAL_FILES=(
  plan.md
  resumo.md
  src/core/game.js
  docs/elenco_proveniencia.json
  public/patient-review.json
)

fail() {
  printf 'ERRO: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso:
  scripts/backup_project.sh create <arquivo.tar.zst>
  scripts/backup_project.sh verify <arquivo.tar.zst>
  scripts/backup_project.sh restore <arquivo.tar.zst> <diretório-novo>

O arquivo precisa ficar fora do checkout. A restauração recusa diretórios já existentes.
EOF
}

safe_archive_members() {
  tar --zstd -tf "$1" | python3 -c '
import pathlib, sys
required = {"./plan.md", "./resumo.md", "./src/core/game.js", "./docs/elenco_proveniencia.json", "./public/patient-review.json"}
seen = set()
for line in sys.stdin.buffer:
    name = line.decode("utf-8", "surrogateescape").rstrip("\n")
    path = pathlib.PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        print(f"caminho inseguro no arquivo: {name!r}", file=sys.stderr)
        raise SystemExit(1)
    seen.add(name)
missing = required - seen
if missing:
    print("arquivos críticos ausentes: " + ", ".join(sorted(missing)), file=sys.stderr)
    raise SystemExit(1)
'
  if tar --zstd -tvf "$1" | awk 'substr($0, 1, 1) == "l" || substr($0, 1, 1) == "h" { found = 1 } END { exit found ? 0 : 1 }'; then
    fail 'o arquivo contém links; restauração recusada'
  fi
}

archive_manifest_path() {
  printf '%s.manifest.json' "$1"
}

validate_archive_manifest() {
  local archive="$1"
  local expected_archive_sha="$2"
  local manifest
  manifest="$(archive_manifest_path "$archive")"
  [[ -f "$manifest" ]] || return 0 # Legacy snapshots use archive-member comparison on restore.
  [[ -f "$manifest.sha256" ]] || fail 'checksum do manifest ausente'
  (cd "${manifest%/*}" && sha256sum "${manifest##*/}") | cmp -- - "$manifest.sha256" || fail 'checksum do manifest diverge'
  python3 - "$manifest" "$expected_archive_sha" <<'PY'
import json
import re
import sys

path, expected_archive_sha = sys.argv[1:]
required = {
    "./plan.md",
    "./resumo.md",
    "./src/core/game.js",
    "./docs/elenco_proveniencia.json",
    "./public/patient-review.json",
}
try:
    with open(path, encoding="utf-8") as handle:
        manifest = json.load(handle)
except (OSError, json.JSONDecodeError) as error:
    print(f"manifest inválido: {error}", file=sys.stderr)
    raise SystemExit(1)

if manifest.get("version") != 1:
    print("versão de manifest não suportada", file=sys.stderr)
    raise SystemExit(1)
if manifest.get("archiveSha256") != expected_archive_sha:
    print("manifest não pertence ao hash do arquivo", file=sys.stderr)
    raise SystemExit(1)
files = manifest.get("criticalFiles")
if not isinstance(files, dict) or set(files) != required:
    print("manifest não lista exatamente os arquivos críticos", file=sys.stderr)
    raise SystemExit(1)
if any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value) for value in files.values()):
    print("manifest contém SHA-256 inválido", file=sys.stderr)
    raise SystemExit(1)
PY
}

write_archive_manifest() {
  local archive="$1"
  local output="$2"
  local archive_sha="$3"
  local snapshot_dir="$4"
  python3 - "$snapshot_dir" "$output" "$archive_sha" "${CRITICAL_FILES[@]}" <<'PY'
import hashlib
import json
import os
import sys

snapshot_dir, output, archive_sha, *files = sys.argv[1:]
manifest = {
    "version": 1,
    "archiveSha256": archive_sha,
    "criticalFiles": {},
}
for relative in files:
    path = os.path.join(snapshot_dir, relative)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    manifest["criticalFiles"][f"./{relative}"] = digest.hexdigest()
with open(output, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
}

verify_restored_files() {
  local archive="$1"
  local target="$2"
  local manifest
  manifest="$(archive_manifest_path "$archive")"
  if [[ -f "$manifest" ]]; then
    python3 - "$manifest" "$target" <<'PY'
import hashlib
import json
import os
import sys

manifest_path, target = sys.argv[1:]
with open(manifest_path, encoding="utf-8") as handle:
    manifest = json.load(handle)
for archive_path, expected in manifest["criticalFiles"].items():
    relative = archive_path.removeprefix("./")
    path = os.path.join(target, relative)
    if not os.path.isfile(path) or os.path.islink(path):
        print(f"arquivo crítico restaurado ausente ou não regular: {relative}", file=sys.stderr)
        raise SystemExit(1)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        print(f"validação da restauração divergiu do snapshot: {relative}", file=sys.stderr)
        raise SystemExit(1)
PY
    return
  fi

  # Compatibility with older snapshots that have only the archive checksum.
  local snapshot_dir
  snapshot_dir="$(mktemp -d)"
  local -a archive_paths=()
  local relative
  for relative in "${CRITICAL_FILES[@]}"; do archive_paths+=("./$relative"); done
  if ! tar --zstd --extract --file "$archive" --directory "$snapshot_dir" --no-same-owner --no-same-permissions "${archive_paths[@]}"; then
    rm -rf -- "$snapshot_dir"
    fail 'não foi possível extrair arquivos críticos do snapshot legado'
  fi
  for relative in "${CRITICAL_FILES[@]}"; do
    if ! cmp -- "$target/$relative" "$snapshot_dir/$relative"; then
      rm -rf -- "$snapshot_dir"
      fail "validação da restauração divergiu do snapshot: $relative"
    fi
  done
  rm -rf -- "$snapshot_dir"
}

verify_archive() {
  local archive="$1"
  local name="${archive##*/}"
  local parent="${archive%/*}"
  [[ -f "$archive" ]] || fail "arquivo não encontrado: $archive"
  [[ -f "$archive.sha256" ]] || fail "checksum ausente: $archive.sha256"
  (cd "$parent" && sha256sum "$name") | cmp -- - "$archive.sha256" || fail 'checksum do arquivo diverge'
  local archive_sha
  archive_sha="$(awk 'NR == 1 { print $1; exit }' "$archive.sha256")"
  [[ "$archive_sha" =~ ^[0-9a-f]{64}$ ]] || fail 'sidecar SHA-256 inválido'
  validate_archive_manifest "$archive" "$archive_sha" || fail 'manifest do snapshot inválido'
  safe_archive_members "$archive" || fail 'estrutura do arquivo inválida'
  printf 'PASS backup: checksum, estrutura e arquivos críticos verificados (%s)\n' "$archive"
}

[[ $# -ge 2 ]] || { usage; exit 2; }
ACTION="$1"
SOURCE_PATH="$2"

case "$ACTION" in
  create)
    [[ $# -eq 2 ]] || { usage; exit 2; }
    ARCHIVE="$(realpath -m "$SOURCE_PATH")"
    [[ "$ARCHIVE" != "$ROOT" && "$ARCHIVE" != "$ROOT/"* ]] || fail 'destino do backup precisa ficar fora do checkout'
    [[ ! -e "$ARCHIVE" && ! -e "$ARCHIVE.sha256" && ! -e "$ARCHIVE.manifest.json" && ! -e "$ARCHIVE.manifest.json.sha256" ]] || fail 'destino já existe; nenhum arquivo será sobrescrito'
    mkdir -p "${ARCHIVE%/*}"
    find "$ROOT" -type d \( -name .git -o -name node_modules -o -name dist -o -name .opencode -o -name __pycache__ \) -prune \
      -o -type l -print -quit | rg --quiet . && fail 'há symlink no conteúdo a arquivar; revise a exclusão antes de continuar' || true
    TEMP_ARCHIVE="$ARCHIVE.tmp.$$"
    TEMP_CHECKSUM="$ARCHIVE.sha256.tmp.$$"
    TEMP_MANIFEST="$(archive_manifest_path "$ARCHIVE").tmp.$$"
    TEMP_MANIFEST_CHECKSUM="$(archive_manifest_path "$ARCHIVE").sha256.tmp.$$"
    TEMP_MANIFEST_DIR=''
    trap 'rm -f "$TEMP_ARCHIVE" "$TEMP_CHECKSUM" "$TEMP_MANIFEST" "$TEMP_MANIFEST_CHECKSUM"; if [[ -n "$TEMP_MANIFEST_DIR" ]]; then rm -rf -- "$TEMP_MANIFEST_DIR"; fi' EXIT
    tar --zstd --create --file "$TEMP_ARCHIVE" --directory "$ROOT" \
      --exclude='./.git' --exclude='*/.git' \
      --exclude='./node_modules' --exclude='*/node_modules' \
      --exclude='./dist' --exclude='*/dist' \
      --exclude='./.opencode' --exclude='*/.opencode' \
      --exclude='*/__pycache__' --exclude='*.pyc' \
      --exclude='*/.cache' --exclude='*/.vite' --exclude='*/coverage' \
      --exclude='*/.env' --exclude='*/.env.*' \
      --exclude='*.pem' --exclude='*.key' --exclude='*.p12' --exclude='*.pfx' --exclude='*.token' --exclude='*.secrets' \
      .
    mv -- "$TEMP_ARCHIVE" "$ARCHIVE"
    (cd "${ARCHIVE%/*}" && sha256sum "${ARCHIVE##*/}") > "$TEMP_CHECKSUM"
    mv -- "$TEMP_CHECKSUM" "$ARCHIVE.sha256"
    TEMP_MANIFEST_DIR="$(mktemp -d "${ARCHIVE%/*}/.${PROGRAM}.manifest.XXXXXX")"
    archive_paths=()
    for relative in "${CRITICAL_FILES[@]}"; do archive_paths+=("./$relative"); done
    tar --zstd --extract --file "$ARCHIVE" --directory "$TEMP_MANIFEST_DIR" --no-same-owner --no-same-permissions "${archive_paths[@]}"
    ARCHIVE_SHA="$(awk 'NR == 1 { print $1; exit }' "$ARCHIVE.sha256")"
    write_archive_manifest "$ARCHIVE" "$TEMP_MANIFEST" "$ARCHIVE_SHA" "$TEMP_MANIFEST_DIR"
    mv -- "$TEMP_MANIFEST" "$(archive_manifest_path "$ARCHIVE")"
    (cd "${ARCHIVE%/*}" && sha256sum "${ARCHIVE##*/}.manifest.json") > "$TEMP_MANIFEST_CHECKSUM"
    mv -- "$TEMP_MANIFEST_CHECKSUM" "$(archive_manifest_path "$ARCHIVE").sha256"
    trap - EXIT
    rm -rf -- "$TEMP_MANIFEST_DIR"
    verify_archive "$ARCHIVE"
    ;;
  verify)
    [[ $# -eq 2 ]] || { usage; exit 2; }
    verify_archive "$(realpath -e "$SOURCE_PATH")"
    ;;
  restore)
    [[ $# -eq 3 ]] || { usage; exit 2; }
    ARCHIVE="$(realpath -e "$SOURCE_PATH")"
    TARGET="$(realpath -m "$3")"
    [[ "$TARGET" != "$ROOT" && "$TARGET" != "$ROOT/"* ]] || fail 'destino da restauração precisa ficar fora do checkout'
    [[ ! -e "$TARGET" ]] || fail 'destino já existe; restauração não sobrescreve arquivos'
    verify_archive "$ARCHIVE"
    TARGET_PARENT="$(dirname -- "$TARGET")"
    mkdir -p "$TARGET_PARENT"
    RESTORE_STAGING="$(mktemp -d "$TARGET_PARENT/.${TARGET##*/}.restore.XXXXXX")"
    trap 'if [[ -n "${RESTORE_STAGING:-}" && -d "$RESTORE_STAGING" ]]; then rm -rf -- "$RESTORE_STAGING"; fi' EXIT
    tar --zstd --extract --file "$ARCHIVE" --directory "$RESTORE_STAGING" --no-same-owner --no-same-permissions
    verify_restored_files "$ARCHIVE" "$RESTORE_STAGING"
    [[ ! -e "$TARGET" ]] || fail 'destino da restauração surgiu durante o processo; staging temporário será descartado'
    mv -T -- "$RESTORE_STAGING" "$TARGET"
    RESTORE_STAGING=''
    trap - EXIT
    printf 'PASS restauração isolada validada: %s\n' "$TARGET"
    ;;
  *)
    usage
    exit 2
    ;;
esac
