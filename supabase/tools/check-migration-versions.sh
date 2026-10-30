#!/usr/bin/env bash
# Supabase tracks numeric versions, not full filenames. Reject collisions before
# any SQL executes; applying files with psql alone would hide this CLI failure.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dir="${1:-$root/supabase/migrations}"
declare -A seen=()
count=0
for file in "$dir"/*.sql; do
  [[ -f "$file" ]] || { echo 'No SQL migrations found' >&2; exit 1; }
  name="$(basename "$file")"
  [[ "$name" =~ ^([0-9]+)_.+\.sql$ ]] || { echo "Invalid migration filename: $name" >&2; exit 1; }
  version="${BASH_REMATCH[1]}"
  if [[ -n "${seen[$version]:-}" ]]; then
    echo "Duplicate migration version $version: ${seen[$version]} and $name" >&2
    exit 1
  fi
  seen[$version]="$name"
  count=$((count + 1))
done
printf 'Migration versions unique (%s files)\n' "$count"
