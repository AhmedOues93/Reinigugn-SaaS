#!/usr/bin/env bash
# Prueft PDF-Dateien mit veraPDF gegen PDF/A-3B.
#
#   tools/verapdf.sh apps/web/.xrechnung/zugferd-invoice.pdf
#
# Beim ersten Lauf werden die Bibliotheken nach tools/verapdf/libs geholt und
# der Treiber dorthin uebersetzt; danach laeuft das Skript ohne Netz. Es
# beendet sich mit Code 1, sobald eine Datei nicht konform ist.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
driver="$here/verapdf"

if [ "$#" -eq 0 ]; then
  echo "Aufruf: $0 <datei.pdf> [...]" >&2
  exit 2
fi

command -v java >/dev/null || { echo "java fehlt" >&2; exit 2; }

if [ ! -d "$driver/libs" ]; then
  command -v mvn >/dev/null || { echo "mvn fehlt und tools/verapdf/libs ist leer" >&2; exit 2; }
  echo "veraPDF 1.26.1 wird aus Maven Central geholt ..."
  mvn -q -f "$driver/pom.xml" dependency:copy-dependencies -DoutputDirectory="$driver/libs"
fi

if [ ! -f "$driver/classes/Verify.class" ]; then
  mkdir -p "$driver/classes"
  javac -cp "$driver/libs/*" -d "$driver/classes" "$driver/Verify.java"
fi

java -cp "$driver/classes:$driver/libs/*" Verify "$@"
