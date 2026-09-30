#!/bin/sh
# Writes a compressed PostgreSQL dump. Safe to run while the app is serving traffic.
# Usage: scripts/backup-db.sh [output-file]      (default: backups/inventory-<timestamp>.dump)
set -eu
cd "$(dirname "$0")/.."

mkdir -p backups
out="${1:-backups/inventory-$(date +%Y%m%d-%H%M%S).dump}"
tmp="${out}.partial"

podman compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$tmp"
mv "$tmp" "$out"
echo "Backup written to $out ($(du -h "$out" | cut -f1))"
