#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo "Example: $0 backups/strategypmo_20260325_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will replace ALL data in the database."
echo "Backup file: $BACKUP_FILE"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "==> Stopping application..."
docker compose stop app

echo "==> Restoring database from backup..."
gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U strategypmo -d strategypmo

echo "==> Starting application..."
docker compose start app

echo "==> Waiting for health check..."
sleep 10
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "==> Restore complete. Application is healthy."
else
  echo "==> Restore complete. Application may still be starting — check 'docker compose ps'."
fi
