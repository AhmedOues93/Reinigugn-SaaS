#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
check="$root/supabase/tools/check-migration-versions.sh"
"$check"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
printf 'select 1;\n' > "$fixture/20260101000000_first.sql"
printf 'select 2;\n' > "$fixture/20260101000000_second.sql"
if "$check" "$fixture" > "$fixture/result" 2>&1; then
  echo 'Regression: duplicate versions accepted' >&2; exit 1
fi
grep -q 'Duplicate migration version 20260101000000' "$fixture/result"
mv "$fixture/20260101000000_second.sql" "$fixture/20260101000001_second.sql"
"$check" "$fixture"
echo 'Duplicate migration regression passed'
