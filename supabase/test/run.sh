#!/usr/bin/env bash
# Apply every migration to a throwaway PostgreSQL database and run the SQL
# assertions against it. Requires a PostgreSQL 16 server; it does not need Docker
# or a running Supabase stack, because harness.sql stands in for the
# Supabase-managed auth, storage and extensions schemas.
#
#   supabase/test/run.sh                     # uses PGHOST/PGPORT/PGUSER
#   PGHOST=/tmp PGPORT=55432 supabase/test/run.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
db="sauberwerk_migration_check_$$"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$db\""
trap 'psql -q -d postgres -c "drop database if exists \"$db\"" >/dev/null 2>&1 || true' EXIT

psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$root/supabase/test/harness.sql"
for migration in "$root"/supabase/migrations/*.sql; do
  printf '  applying %s\n' "$(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -q -d "$db" -1 -f "$migration"
done

for suite in "$root"/supabase/test/*.test.sql; do
  printf '  running %s\n' "$(basename "$suite")"
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$suite"
done

echo "migrations and SQL assertions passed"
