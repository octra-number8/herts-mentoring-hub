#!/usr/bin/env bash
# Writes .env.local from the running local Supabase stack (CI and fresh clones).
set -euo pipefail
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)=')"
cat > .env.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
DATABASE_URL=${DB_URL}
APP_URL=http://localhost:3100
EMAIL_DRIVER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=55425
EMAIL_FROM="Hertfordshire Mentoring Hub <hub@localhost>"
CRON_SECRET=ci-cron-secret
ENV
echo ".env.local written"
