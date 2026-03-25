#!/bin/bash
set -e

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/strategypmo_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Creating database backup..."
docker compose exec -T db pg_dump -U strategypmo --clean --if-exists strategypmo | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "==> Backup created: $BACKUP_FILE ($SIZE)"

# Keep only last 30 backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/strategypmo_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 30 ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - 30))
  echo "==> Cleaning up old backups (removing $REMOVE_COUNT)..."
  ls -1t "$BACKUP_DIR"/strategypmo_*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

echo "==> Done."
