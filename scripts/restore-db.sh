#!/bin/sh
# Replaces the database contents with a dump made by backup-db.sh.
# Usage: scripts/restore-db.sh backups/inventory-YYYYmmdd-HHMMSS.dump [--yes]
set -eu
cd "$(dirname "$0")/.."

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Usage: $0 <backup-file> [--yes]" >&2
  exit 1
fi

if [ "${2:-}" != "--yes" ]; then
  printf 'This replaces ALL data in the database with %s.\nType "restore" to continue: ' "$file"
  read -r answer
  [ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
fi

# Keep the app from writing while the data is swapped.
podman compose stop app >/dev/null 2>&1 || true
podman compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"
podman compose start app >/dev/null 2>&1 || true
echo "Restored $file"
