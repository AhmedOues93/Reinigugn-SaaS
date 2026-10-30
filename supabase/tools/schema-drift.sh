#!/usr/bin/env bash
# Was im Ziel fehlt -- und was dort ist, das das Repository nicht kennt.
#
# Liest nur. Gegen Production gefahrlos, und der einzige Weg, die Frage "welche
# Migrationen fehlen dort?" zu beantworten, ohne sie zu raten: der Soll-Stand
# wird aus der vollen Historie in einer Wegwerf-Datenbank erzeugt, der
# Ist-Stand aus dem Ziel gelesen.
#
#   # Soll-Stand neu erzeugen (braucht einen lokalen PostgreSQL 16):
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres supabase/tools/schema-drift.sh snapshot
#
#   # Ziel vergleichen (Connection String aus dem Supabase-Dashboard,
#   # Settings -> Database -> Connection string -> URI):
#   supabase/tools/schema-drift.sh check "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
#
# Der Soll-Stand liegt in supabase/tools/expected-schema.txt und wird in CI
# gegen das Repository geprueft, damit er nicht veraltet.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
snapshot="$root/supabase/tools/expected-schema.txt"
inventory="$root/supabase/tools/schema-inventory.sql"

build_expected() {
  local db="reinplan_expected_$$"
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$db\""
  trap 'psql -q -d postgres -c "drop database if exists \"$db\"" >/dev/null 2>&1 || true' RETURN
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$root/supabase/test/harness.sql" >/dev/null
  for migration in "$root"/supabase/migrations/*.sql; do
    psql -v ON_ERROR_STOP=1 -q -d "$db" -1 -f "$migration" >/dev/null
  done
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$inventory"
}

case "${1:-check}" in
  snapshot)
    build_expected > "$snapshot"
    printf 'Soll-Stand geschrieben: %s (%s Zeilen)\n' "$snapshot" "$(wc -l < "$snapshot")"
    ;;
  verify)
    # Fuer CI: stimmt der eingecheckte Soll-Stand noch mit den Migrationen?
    diff -u "$snapshot" <(build_expected) \
      && echo "Der eingecheckte Soll-Stand passt zu den Migrationen." \
      || { echo "Der Soll-Stand ist veraltet. Neu erzeugen mit: supabase/tools/schema-drift.sh snapshot" >&2; exit 1; }
    ;;
  check)
    target="${2:-}"
    [ -n "$target" ] || { echo "check braucht einen Connection String" >&2; exit 2; }
    [ -f "$snapshot" ] || { echo "Kein Soll-Stand. Zuerst: schema-drift.sh snapshot" >&2; exit 2; }
    actual="$(mktemp)"
    trap 'rm -f "$actual"' EXIT
    psql -v ON_ERROR_STOP=1 -q -d "$target" -f "$inventory" > "$actual"

    missing="$(comm -23 "$snapshot" "$actual" || true)"
    extra="$(comm -13 "$snapshot" "$actual" || true)"

    if [ -n "$missing" ]; then
      printf '\n=== FEHLT im Ziel (%s Zeilen)\n' "$(printf '%s\n' "$missing" | wc -l)"
      printf '%s\n' "$missing"
    fi
    if [ -n "$extra" ]; then
      printf '\n=== Nur im Ziel, dem Repository unbekannt (%s Zeilen)\n' "$(printf '%s\n' "$extra" | wc -l)"
      printf '%s\n' "$extra"
    fi
    if [ -z "$missing" ] && [ -z "$extra" ]; then
      echo "Kein Unterschied. Das Ziel entspricht der Migrationshistorie."
    fi
    # Unterschiede sind ein Befund, kein Fehlschlag des Werkzeugs.
    ;;
  *) echo "unbekannter Modus: ${1:-}" >&2; exit 2;;
esac
