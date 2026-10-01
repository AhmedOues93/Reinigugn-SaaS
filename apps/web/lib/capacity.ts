/**
 * Soll, Ist und Auslastung -- die Rechnung, nicht die Abfrage.
 *
 * Hier steht nur, was aus den Zahlen der Datenbank zu machen ist. Dass das
 * Soll bis heute und nicht fuer den ganzen Monat gilt, entscheidet
 * `company_capacity_snapshot`; diese Datei verlaesst sich darauf und sagt es
 * im Zweifel lieber nicht.
 */

export type CapacitySnapshot = {
  asOf: string;
  employees: number;
  employeesWithTarget: number;
  /** Null, wenn fuer niemanden Wochenstunden hinterlegt sind. */
  targetMinutesToDate: number | null;
  targetMinutesMonth: number | null;
  workedMinutes: number;
  plannedMinutes: number;
  unassignedPlannedMinutes: number;
};

/**
 * Auslastung in Prozent, oder null.
 *
 * Ohne vereinbarte Stunden gibt es kein Soll und damit keine Auslastung. Null
 * ist dann die richtige Antwort, nicht 0 % und erst recht nicht 100 %: eine
 * Zahl an dieser Stelle wird jemandem vorgehalten.
 */
export function utilisationPercent(workedMinutes: number, targetMinutes: number | null): number | null {
  if (targetMinutes === null || targetMinutes <= 0) return null;
  return Math.round((workedMinutes / targetMinutes) * 100);
}

/** Minuten als Stunden, eine Nachkommastelle, wie es im Lohnbuero gelesen wird. */
export function hoursFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Wie die Abweichung zu lesen ist.
 *
 * Unter 85 % und ueber 115 % ist beides ein Hinweis -- zu wenig heisst
 * unbezahlte Leerzeit, zu viel heisst Ueberstunden, die irgendwann
 * ausgeglichen werden muessen. Dazwischen ist nichts zu melden.
 */
export function utilisationTone(percent: number | null): 'neutral' | 'warning' | 'danger' | 'success' {
  if (percent === null) return 'neutral';
  if (percent < 85) return 'warning';
  if (percent > 115) return 'danger';
  return 'success';
}
