/**
 * What automatic planning reports back.
 *
 * The office needs the outcome per visit, not one sentence for the week: which
 * object, on which day, at which time, and — when nobody could take it — the
 * concrete rule that stopped every candidate. The database is the authority for
 * both the decision and the reason (`plan_window_automatically`).
 */
export type PlanningVisit = {
  scheduleId: string;
  scheduleName: string;
  objectName: string;
  customerName: string;
  /** Null only for a plan that has no weekday at all and therefore no date. */
  visitDate: string | null;
  start: string | null;
  end: string | null;
  assigned: boolean;
  memberName: string | null;
  reason: string | null;
};

export type PlanningState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  from?: string;
  to?: string;
  visits?: PlanningVisit[];
};

export const initialPlanningState: PlanningState = { status: 'idle' };

type PlanningRow = {
  schedule_id: string;
  schedule_name: string | null;
  object_name: string | null;
  customer_name: string | null;
  visit_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  outcome: string | null;
  member_name: string | null;
  reason: string | null;
};

/** Times come back as `HH:MM:SS`; the board shows `HH:MM`. */
function shortTime(value: string | null) {
  return value ? value.slice(0, 5) : null;
}

export function toPlanningVisits(rows: PlanningRow[] | null): PlanningVisit[] {
  return (rows ?? []).map((row) => ({
    scheduleId: row.schedule_id,
    scheduleName: row.schedule_name ?? '',
    objectName: row.object_name ?? '',
    customerName: row.customer_name ?? '',
    visitDate: row.visit_date,
    start: shortTime(row.planned_start_time),
    end: shortTime(row.planned_end_time),
    assigned: row.outcome === 'ASSIGNED',
    memberName: row.member_name,
    reason: row.reason,
  }));
}

/** The headline above the list: counts first, because that is the decision. */
export function planningSummary(visits: PlanningVisit[]) {
  const assigned = visits.filter((visit) => visit.assigned).length;
  const blocked = visits.length - assigned;

  if (visits.length === 0) {
    return 'Für diesen Zeitraum gibt es keinen aktiven Plan mit automatischer Teamplanung.';
  }
  if (blocked === 0) {
    return `${assigned} ${assigned === 1 ? 'Einsatz' : 'Einsätze'} eingeplant und zugewiesen.`;
  }
  if (assigned === 0) {
    return `${blocked} ${blocked === 1 ? 'Einsatz' : 'Einsätze'} konnten nicht zugewiesen werden – der Grund steht bei jedem Einsatz.`;
  }
  return `${assigned} ${assigned === 1 ? 'Einsatz' : 'Einsätze'} zugewiesen, ${blocked} offen – der Grund steht bei jedem offenen Einsatz.`;
}
