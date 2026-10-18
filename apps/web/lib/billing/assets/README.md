# Schrift und Farbprofil der Rechnungs-PDF

Diese Dateien liegen hier, weil die ZUGFeRD-Rechnung ein PDF/A-3B sein muss und
PDF/A-3 zwei Dinge verlangt, die ein gewoehnliches PDF nicht mitbringt: jede
benutzte Schrift muss *in* der Datei liegen (ISO 19005-3, 6.2.11.4.1), und wer
DeviceRGB benutzt, braucht einen OutputIntent mit eingebettetem ICC-Profil
(6.2.4.3). Beides ist mit veraPDF 1.26.1 nachgemessen — ohne die beiden Dateien
meldet der Validator genau diese zwei Regeln.

| Datei | Herkunft | Lizenz |
|---|---|---|
| `LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf` | Liberation Fonts (Red Hat / Google) | SIL Open Font License 1.1 — `LiberationSans-LICENSE.txt` |
| `sRGB.icc` | Debian-Paket `icc-profiles-free` 2.0.1 | zlib/libpng — `sRGB.icc-LICENSE.txt` |

Beide Lizenzen erlauben die Weitergabe und die kommerzielle Nutzung
ausdruecklich. Die Dateien sind **unveraendert** uebernommen. Das ist Absicht:
die OFL verlangt bei veraenderten Fassungen einen anderen Namen (Abschnitt 3),
und das Verkleinern auf die tatsaechlich benutzten Zeichen uebernimmt ohnehin
pdf-lib beim Einbetten — eine erzeugte Rechnung traegt nur noch die Glyphen,
die auf ihr stehen, mit `/ToUnicode`-Tabelle, damit der Text kopierbar bleibt.

Wer die Schrift austauscht, muss daran denken, dass `safe()` in
`lib/billing/invoice-pdf.ts` Zeichen ausserhalb von WinAnsi ersetzt. Die
Grenze liegt dort, nicht in der Schrift.
