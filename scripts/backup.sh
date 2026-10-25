#!/usr/bin/env bash
# Full backup: database (schema + data for public, auth and storage metadata) and Storage files.
#   ./scripts/backup.sh [--linked]      (default: local stack; --linked uses the linked hosted project)
set -euo pipefail
TARGET=${1:---local}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR="backups/$STAMP"
mkdir -p "$DIR"
npx supabase db dump $TARGET -f "$DIR/schema.sql"
npx supabase db dump $TARGET --data-only --use-copy -s public,auth,storage -f "$DIR/data.sql"
npx tsx scripts/storage-backup.ts backup "$DIR/storage"
( cd "$DIR" && shasum -a 256 schema.sql data.sql > SHA256SUMS )
echo "Backup complete: $DIR"
