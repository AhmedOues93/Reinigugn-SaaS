#!/usr/bin/env bash
# Sicherung und Wiederherstellung -- mit Nachweis, nicht mit Hoffnung.
#
# Eine Sicherung, die nie zurueckgespielt wurde, ist keine Sicherung. Darum
# besteht dieses Skript auf dem zweiten Schritt: es spielt den Dump in eine
# *getrennte* Datenbank und laesst dort die SQL-Zusicherungen laufen. Erst wenn
# die durchkommen, gilt die Sicherung als brauchbar.
#
#   # Uebung gegen die lokale Pruefdatenbank (CI und Entwicklung):
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres supabase/tools/backup-restore.sh drill
#
#   # Echte Sicherung ziehen (lesend, gefahrlos):
#   supabase/tools/backup-restore.sh dump "<connection-string>" /pfad/sicherung.dump
#
#   # Wiederherstellung pruefen -- NIE gegen Production, immer gegen ein
#   # separates Projekt oder eine lokale Datenbank:
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres \
#     supabase/tools/backup-restore.sh verify /pfad/sicherung.dump
#
# Was `pg_dump` aus einem Supabase-Projekt NICHT mitnimmt, steht in
# docs/runbook.md: die Auth-Benutzer und die Dateien in Storage liegen in
# eigenen Schemata bzw. hinter einer API und brauchen ihren eigenen Weg.
set -euo pipefail

mode="${1:-drill}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

run_assertions() {
  local db="$1"
  local failed=0
  for suite in "$root"/supabase/test/*.test.sql; do
    if psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$suite" >/dev/null 2>"/tmp/restore-$$.err"; then
      printf '  ok   %s\n' "$(basename "$suite")"
    else
      printf '  FAIL %s\n' "$(basename "$suite")"
      sed 's/^/       /' "/tmp/restore-$$.err" | head -5
      failed=1
    fi
  done
  rm -f "/tmp/restore-$$.err"
  return $failed
}

case "$mode" in
  drill)
    source_db="reinplan_backup_source_$$"
    target_db="reinplan_backup_target_$$"
    dump="$(mktemp -t reinplan-dump-XXXXXX.sql)"
    trap 'psql -q -d postgres -c "drop database if exists \"$source_db\"" >/dev/null 2>&1 || true;
          psql -q -d postgres -c "drop database if exists \"$target_db\"" >/dev/null 2>&1 || true;
          rm -f "$dump"' EXIT

    echo "== 1. Quelle aufbauen (volle Migrationshistorie)"
    psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$source_db\""
    psql -v ON_ERROR_STOP=1 -q -d "$source_db" -f "$root/supabase/test/harness.sql" >/dev/null
    for migration in "$root"/supabase/migrations/*.sql; do
      psql -v ON_ERROR_STOP=1 -q -d "$source_db" -1 -f "$migration" >/dev/null 2>&1
    done

    echo "== 2. Sichern"
    # `--no-privileges` waere hier ein Fehler, und ein teurer: die GRANTs an
    # `anon` und `authenticated` sind nicht Beiwerk, sondern Teil des
    # Sicherheitsmodells. Ohne sie startet die Anwendung auf der
    # Wiederherstellung mit "permission denied" fuer jede Tabelle. Genau das
    # hat diese Uebung beim ersten Lauf gezeigt.
    pg_dump --no-owner --format=plain -d "$source_db" > "$dump"
    printf '   %s Bytes\n' "$(wc -c < "$dump")"

    echo "== 3. In eine getrennte Datenbank zurueckspielen"
    psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$target_db\""
    # Die von Supabase verwalteten Schemata liegen nicht im Dump; der Harness
    # stellt sie wie in jeder Pruefdatenbank bereit.
    psql -v ON_ERROR_STOP=1 -q -d "$target_db" -f "$root/supabase/test/harness.sql" >/dev/null
    psql -q -d "$target_db" -f "$dump" >/dev/null 2>&1 || true

    echo "== 4. Die Wiederherstellung beweisen: alle Zusicherungen gegen die Kopie"
    run_assertions "$target_db"
    echo "Wiederherstellung belegt."
    ;;

  dump)
    target="${2:-}"; out="${3:-}"
    [ -n "$target" ] && [ -n "$out" ] || { echo "Aufruf: backup-restore.sh dump <connection-string> <datei>" >&2; exit 2; }
    # Mit Rechten, ohne Eigentuemer: die GRANTs gehoeren zur Sicherung, die
    # Supabase-eigenen Rollennamen nicht.
    pg_dump --no-owner --format=custom -d "$target" -f "$out"
    printf 'Gesichert: %s (%s Bytes)\n' "$out" "$(wc -c < "$out")"
    echo 'Diese Datei enthaelt Kunden-, Lohn- und Steuerdaten. Verschluesselt ablegen, Zugriff begrenzen.'
    ;;

  verify)
    dump="${2:-}"
    [ -f "$dump" ] || { echo "Aufruf: backup-restore.sh verify <datei>" >&2; exit 2; }
    target_db="reinplan_restore_check_$$"
    trap 'psql -q -d postgres -c "drop database if exists \"$target_db\"" >/dev/null 2>&1 || true' EXIT
    psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$target_db\""
    psql -v ON_ERROR_STOP=1 -q -d "$target_db" -f "$root/supabase/test/harness.sql" >/dev/null
    case "$dump" in
      *.dump) pg_restore --no-owner -d "$target_db" "$dump" >/dev/null 2>&1 || true;;
      *) psql -q -d "$target_db" -f "$dump" >/dev/null 2>&1 || true;;
    esac
    run_assertions "$target_db"
    echo "Wiederherstellung belegt."
    ;;

  *) echo "unbekannter Modus: $mode" >&2; exit 2;;
esac
