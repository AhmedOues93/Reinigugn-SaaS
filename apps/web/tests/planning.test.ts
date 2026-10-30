import { describe, expect, it } from 'vitest';
import { isoWeek, mondayOf, planningWindow } from '../lib/planning-window';
import { planningSummary, toPlanningVisits } from '../lib/planning';

// 2026-09-26 is a Saturday: the day the old board was at its worst, because
// snapping to Monday showed a week with one day left in it.
const saturday = '2026-09-26';

describe('planningWindow', () => {
  it('shows the next seven days from today by default, not the calendar week', () => {
    const window = planningWindow({}, saturday);
    expect(window.view).toBe('rolling');
    expect(window.start).toBe(saturday);
    expect(window.end).toBe('2026-10-02');
    expect(window.days).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('snaps to Monday only when the calendar week is asked for', () => {
    const window = planningWindow({ view: 'kw' }, saturday);
    expect(window.view).toBe('week');
    expect(window.start).toBe('2026-09-21');
    expect(window.end).toBe('2026-09-27');
    expect(isoWeek(window.start)).toBe(39);
  });

  it('moves the rolling window by seven days without snapping to a weekday', () => {
    const forward = planningWindow({ start: '2026-10-03', view: 'ab' }, saturday);
    expect(forward.start).toBe('2026-10-03');
    expect(forward.end).toBe('2026-10-09');
    expect(forward.atToday).toBe(false);
  });

  it('keeps the calendar week on Monday however the link was built', () => {
    // A "next week" link carries Monday, but a hand-edited or older link may not.
    expect(planningWindow({ start: '2026-09-30', view: 'kw' }, saturday).start).toBe('2026-09-28');
  });

  it('marks "Heute" as current for the window starting today and for the week around today', () => {
    expect(planningWindow({}, saturday).atToday).toBe(true);
    expect(planningWindow({ start: saturday, view: 'ab' }, saturday).atToday).toBe(true);
    expect(planningWindow({ start: '2026-09-21', view: 'kw' }, saturday).atToday).toBe(true);
    expect(planningWindow({ start: '2026-09-14', view: 'kw' }, saturday).atToday).toBe(false);
  });

  it('still honours a bookmarked ?week= link as a calendar week', () => {
    const window = planningWindow({ week: '2026-09-23' }, saturday);
    expect(window.view).toBe('week');
    expect(window.start).toBe('2026-09-21');
  });

  it('falls back to today when the anchor is not a date', () => {
    expect(planningWindow({ start: 'gestern' }, saturday).start).toBe(saturday);
    expect(planningWindow({ start: '26.09.2026' }, saturday).start).toBe(saturday);
  });

  it('gives every day of the window exactly once, so no visit can be hidden', () => {
    const window = planningWindow({ start: '2026-12-28', view: 'ab' }, saturday);
    expect(new Set(window.days).size).toBe(7);
    expect(window.days.at(-1)).toBe('2027-01-03');
  });
});

describe('mondayOf', () => {
  it('treats Sunday as the end of the week, not the start', () => {
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');
  });
});

const row = {
  schedule_id: 'plan-1',
  schedule_name: 'Büro Nord wöchentlich',
  object_name: 'Büro Nord',
  customer_name: 'Nordlicht GmbH',
  visit_date: '2026-09-28',
  planned_start_time: '07:00:00',
  planned_end_time: '09:30:00',
  outcome: 'ASSIGNED',
  member_name: 'Olena Koval',
  reason: null,
};

describe('toPlanningVisits', () => {
  it('carries object, customer, date and time of each visit', () => {
    const [visit] = toPlanningVisits([row]);
    expect(visit).toMatchObject({
      objectName: 'Büro Nord',
      customerName: 'Nordlicht GmbH',
      visitDate: '2026-09-28',
      start: '07:00',
      end: '09:30',
      assigned: true,
      memberName: 'Olena Koval',
    });
  });

  it('keeps the reason of a visit that could not be staffed', () => {
    const [visit] = toPlanningVisits([
      { ...row, outcome: 'BLOCKED', member_name: null, reason: 'Sara Nowak: im Urlaub am 28.09.2026' },
    ]);
    expect(visit.assigned).toBe(false);
    expect(visit.reason).toBe('Sara Nowak: im Urlaub am 28.09.2026');
  });

  it('survives an empty report', () => {
    expect(toPlanningVisits(null)).toEqual([]);
  });
});

describe('planningSummary', () => {
  it('counts instead of claiming success when visits stayed open', () => {
    const visits = toPlanningVisits([
      row,
      { ...row, visit_date: '2026-09-29', outcome: 'BLOCKED', member_name: null, reason: 'x' },
    ]);
    expect(planningSummary(visits)).toBe(
      '1 Einsatz zugewiesen, 1 offen – der Grund steht bei jedem offenen Einsatz.',
    );
  });

  it('says plainly when nothing could be assigned', () => {
    const visits = toPlanningVisits([{ ...row, outcome: 'BLOCKED', member_name: null, reason: 'x' }]);
    expect(planningSummary(visits)).toContain('konnten nicht zugewiesen werden');
  });

  it('does not pretend a plan exists when none does', () => {
    expect(planningSummary([])).toContain('keinen aktiven Plan');
  });

  it('confirms a fully staffed window', () => {
    expect(planningSummary(toPlanningVisits([row]))).toBe('1 Einsatz eingeplant und zugewiesen.');
  });
});
