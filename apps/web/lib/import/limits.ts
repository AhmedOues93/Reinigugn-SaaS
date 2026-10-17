/** Dieselben Grenzen fuer jeden Import -- eine Datei, die hier durchkommt, kommt ueberall durch. */
export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

/**
 * Die Datei pruefen und ihren Text zurueckgeben, oder sagen, was fehlt.
 *
 * Die Groesse wird vor dem Lesen geprueft: eine 200-MB-Datei soll nicht erst
 * im Speicher landen, um dann abgewiesen zu werden.
 */
export async function readImportFile(value: unknown): Promise<{ text: string } | { error: string }> {
  if (!(value instanceof File) || value.size === 0) {
    return { error: 'Bitte wähle eine CSV-Datei aus.' };
  }
  if (value.size > MAX_IMPORT_FILE_SIZE) {
    return { error: 'Die CSV-Datei darf höchstens 2 MB groß sein.' };
  }
  return { text: await value.text() };
}
