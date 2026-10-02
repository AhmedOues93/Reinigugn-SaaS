#!/usr/bin/env bash
# Beweist, dass die Migrationshistorie auf einer *teilweise* migrierten
# Datenbank ankommt -- nicht nur auf einer leeren.
#
# Genau das ist der Fall in Production: dort fehlen einzelne Migrationen, und
# andere wurden mit abweichenden Zeitstempeln eingespielt. `supabase db push`
# wendet dann nur die aus seiner Sicht fehlenden an; wer unsicher ist, wendet
# sie der Reihe nach selbst an. Beides geht nur gut, wenn jede Migration ein
# zweites Mal durchlaeuft, ohne zu brechen.
#
#   supabase/tools/upgrade-path.sh replay       # ganze Historie zweimal
#   supabase/tools/upgrade-path.sh tail 20261006000022   # alles davor, dann der Rest
#   supabase/tools/upgrade-path.sh assertions   # nach dem Nachrüsten: alle Suiten
#
# Erwartet PGHOST/PGPORT/PGUSER wie supabase/test/run.sh.
set -euo pipefail

mode="${1:-replay}"
cutoff="${2:-}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
db="reinplan_upgrade_check_$$"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$db\""
trap 'psql -q -d postgres -c "drop database if exists \"$db\"" >/dev/null 2>&1 || true' EXIT

psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$root/supabase/test/harness.sql"

apply() {
  local label="$1"; shift
  local failed=0
  for migration in "$@"; do
    if ! psql -v ON_ERROR_STOP=1 -q -d "$db" -1 -f "$migration" >/dev/null 2>"/tmp/upgrade-$$.err"; then
      printf '  %s FAILED %s\n' "$label" "$(basename "$migration")"
      sed 's/^/      /' "/tmp/upgrade-$$.err" | head -8
      failed=1
    fi
  done
  rm -f "/tmp/upgrade-$$.err"
  return $failed
}

all=("$root"/supabase/migrations/*.sql)

case "$mode" in
  replay)
    echo "== erster Durchlauf (leere Datenbank)"
    apply "first" "${all[@]}"
    echo "== zweiter Durchlauf (dieselbe Datenbank, jede Migration erneut)"
    apply "replay" "${all[@]}"
    echo "Jede Migration ist wiederholbar."
    ;;
  tail)
    # Der Schnitt ist exklusiv: `tail 20261006000022` baut den Stand *vor* 22
    # und ruestet dann 22 und alles danach nach.
    [ -n "$cutoff" ] || { echo "tail braucht eine Version, z. B. 20261006000022" >&2; exit 2; }
    base=(); rest=()
    for migration in "${all[@]}"; do
      if [[ "$(basename "$migration")" < "$cutoff" ]]; then base+=("$migration"); else rest+=("$migration"); fi
    done
    printf '== Ausgangsstand: %d Migrationen vor %s\n' "${#base[@]}" "$cutoff"
    apply "base" "${base[@]}"
    printf '== Nachgetragen: %d Migrationen ab %s\n' "${#rest[@]}" "$cutoff"
    apply "tail" "${rest[@]}"
    echo "Der Nachtrag ab $cutoff laeuft durch."
    ;;
  assertions)
    apply "first" "${all[@]}"
    for suite in "$root"/supabase/test/*.test.sql; do
      printf '  %s\n' "$(basename "$suite")"
      psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$suite"
    done
    ;;
  *)
    echo "unbekannter Modus: $mode" >&2; exit 2;;
esac
