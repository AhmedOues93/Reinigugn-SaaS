#!/usr/bin/env bash
# Was das Repository kennt, gegen das, was die Zieldatenbank als angewendet
# fuehrt -- und daraus der Reparaturplan.
#
# Liest nur. Der Plan wird ausgegeben, nicht ausgefuehrt: welche Version als
# angewendet markiert und welche wirklich eingespielt werden muss, ist eine
# Entscheidung, die vor Augen gehoert und nicht in ein Skript.
#
#   supabase/tools/migration-ledger.sh "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
#
# Zwei Faelle sind zu unterscheiden, und das Verwechseln ist der Grund, warum
# ein `db push` gegen eine gewachsene Datenbank abbricht:
#
#   * Die Wirkung ist da, die Version fehlt im Buch. Dann NICHT erneut
#     einspielen -- die frueheren Migrationen sind nicht wiederholbar
#     (`create type ... already exists`), ein Push bricht ab. Stattdessen
#     nachtragen:  npx supabase migration repair --status applied <version>
#
#   * Die Wirkung fehlt. Dann einspielen.
#
# Welcher Fall vorliegt, sagt supabase/tools/schema-drift.sh.
set -euo pipefail

target="${1:-}"
[ -n "$target" ] || { echo "Aufruf: migration-ledger.sh <connection-string>" >&2; exit 2; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

repo="$(mktemp)"; remote="$(mktemp)"
trap 'rm -f "$repo" "$remote"' EXIT

# Die Version ist der Zahlenteil des Dateinamens -- genau so liest die CLI sie.
for file in "$root"/supabase/migrations/*.sql; do
  basename "$file" | sed -E 's/^([0-9]+)_.*/\1/'
done | sort > "$repo"

psql -v ON_ERROR_STOP=1 -q -At -d "$target" \
  -c "select version from supabase_migrations.schema_migrations order by version" \
  > "$remote" 2>/dev/null || {
    echo "Konnte supabase_migrations.schema_migrations nicht lesen." >&2
    echo "Entweder fehlt die Berechtigung, oder die Datenbank wurde nie mit der CLI migriert." >&2
    exit 1
  }

printf '== Doppelte Versionsnummern im Repository (eine Datei wird beim Push uebersprungen)\n'
uniq -d "$repo" | while read -r version; do
  printf '   %s:\n' "$version"
  ls -1 "$root"/supabase/migrations/"$version"_*.sql | sed 's#.*/#      #'
done
[ -n "$(uniq -d "$repo")" ] || echo '   keine'

printf '\n== Im Repository, nicht im Buch der Zieldatenbank (%s)\n' \
  "$(comm -23 <(sort -u "$repo") "$remote" | wc -l)"
comm -23 <(sort -u "$repo") "$remote" | sed 's/^/   /'

printf '\n== Im Buch der Zieldatenbank, nicht im Repository (%s)\n' \
  "$(comm -13 <(sort -u "$repo") "$remote" | wc -l)"
comm -13 <(sort -u "$repo") "$remote" | sed 's/^/   /'
printf '\nNaechster Schritt: supabase/tools/schema-drift.sh check "<connection-string>"\n'
printf 'Erst danach entscheiden, was nachgetragen und was eingespielt wird.\n'
