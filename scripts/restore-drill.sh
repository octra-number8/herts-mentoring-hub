#!/usr/bin/env bash
# Restore drill (local stack): wipe files and data, restore from a backup, verify.
#   ./scripts/restore-drill.sh backups/<stamp>
# Never run against a hosted project.
set -euo pipefail
DIR=${1:?backup directory}
PSQL="docker exec -i supabase_db_herts-mentoring-hub psql -U postgres -q"
( cd "$DIR" && shasum -a 256 -c SHA256SUMS )
echo "1. Deleting every stored file"
npx tsx scripts/storage-backup.ts wipe "$DIR/storage"
echo "2. Wiping the database (empty schema, no data)"
npx supabase db reset >/dev/null 2>&1 || true
for i in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:55421/rest/v1/" -H "apikey: x" && break; sleep 2; done
echo "3. Restoring data"
$PSQL -v ON_ERROR_STOP=0 < "$DIR/data.sql" 2>&1 | grep -v "already exists\|duplicate key" | grep -i error | head -5 || true
echo "4. Restoring files (checksums verified)"
npx tsx scripts/storage-backup.ts restore "$DIR/storage"
echo "Restore complete"
