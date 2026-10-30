/**
 * Ein Modell der vier Zeitfunktionen, fuer den Browserlauf.
 *
 * Es steht hier, weil die Warteschlange auf dem Geraet nur gegen einen Server
 * geprueft werden kann, der dieselbe *Wiedererkennung* mitbringt: ob eine
 * zweite Zustellung als dieselbe Buchung erkannt wird, entscheidet mit, ob die
 * Warteschlange jemals leer wird. Ein Server, der alles annimmt, laesst jeden
 * Fehler in der Reihenfolge und in der Wiederholung durchgehen.
 *
 * Jede Regel unten ist eine Uebertragung der SQL-Funktion, die darueber
 * genannt ist, aus
 * supabase/migrations/20261008000000_offline_time_idempotency.sql und
 * 20261008000001_offline_pause_resume_redelivery.sql. Die beiden lassen sich
 * damit gegeneinander lesen.
 *
 * Was das Modell ausdruecklich NICHT beweist: dass der echte Server sich so
 * verhaelt. Das steht in supabase/test/offline-time-idempotency.test.sql und
 * supabase/test/offline-redelivery-after-stop.test.sql, die gegen ein echtes
 * PostgreSQL mit allen Migrationen laufen. Hier wird der Client geprueft.
 */
export type TimeAction = 'start' | 'pause' | 'resume' | 'stop';

type Break = { id: string; startedAt: number; endedAt: number | null };
type Entry = {
  id: string;
  userId: string;
  jobId: string;
  startedAt: number;
  finishedAt: number | null;
  breaks: Break[];
};

export type TimeServer = {
  entries: Entry[];
  /** Jeder Aufruf, in der Reihenfolge, in der er ankam. */
  calls: { action: TimeAction; jobId: string; clientTime: string }[];
  /** Laesst den naechsten Aufruf dieser Art einmal fehlschlagen. */
  failNext(action: TimeAction, jobId: string): void;
  call(userId: string, action: TimeAction, jobId: string, clientTime: string): string;
  /** Netto gearbeitete Minuten ueber alle beendeten Buchungen dieser Kraft. */
  netMinutes(userId: string): number;
  breakCount(userId: string): number;
};

/** Dieselbe Uhrtoleranz wie effective_entry_time(). */
const TOLERANCE_MS = 2 * 60 * 1000;

export function makeTimeServer(): TimeServer {
  const entries: Entry[] = [];
  const calls: TimeServer['calls'] = [];
  let failOnce: { action: TimeAction; jobId: string } | null = null;
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;
  const now = () => Date.now();

  const activeEntry = (userId: string, jobId: string) =>
    entries.find((entry) => entry.jobId === jobId && entry.userId === userId && entry.finishedAt === null);

  const matches = (value: number | null, at: number) => value !== null && Math.abs(value - at) <= TOLERANCE_MS;

  /** member_time_overlaps() */
  const overlaps = (userId: string, from: number, to: number, excludeId: string) =>
    entries.some(
      (entry) =>
        entry.userId === userId &&
        entry.id !== excludeId &&
        entry.startedAt < to &&
        (entry.finishedAt ?? now()) > from,
    );

  /** start_my_job() */
  function start(userId: string, jobId: string, at: number) {
    const redelivered = entries
      .filter((entry) => entry.jobId === jobId && entry.userId === userId && matches(entry.startedAt, at))
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (redelivered) return redelivered.id;

    if (entries.some((entry) => entry.userId === userId && entry.finishedAt === null))
      throw new Error('Another active job must be ended first');
    if (
      entries.some(
        (entry) => entry.userId === userId && entry.startedAt <= at && (entry.finishedAt ?? now()) > at,
      )
    )
      throw new Error('Fuer diesen Zeitpunkt ist bereits eine Arbeitszeit erfasst.');

    const entry: Entry = { id: nextId('entry'), userId, jobId, startedAt: at, finishedAt: null, breaks: [] };
    entries.push(entry);
    return entry.id;
  }

  /** pause_my_job() */
  function pause(userId: string, jobId: string, at: number) {
    const entry = activeEntry(userId, jobId);
    if (!entry) {
      // Keine laufende Zeit: eine Pause mit passendem Beginn ist dennoch
      // dieselbe Buchung ein zweites Mal. Das ist der Teil, der fehlte.
      const redelivered = entries
        .filter((candidate) => candidate.jobId === jobId && candidate.userId === userId)
        .flatMap((candidate) => candidate.breaks)
        .filter((brk) => matches(brk.startedAt, at))
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (redelivered) return redelivered.id;
      throw new Error('No active time entry found');
    }

    const open = entry.breaks.filter((brk) => brk.endedAt === null).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (open) {
      if (matches(open.startedAt, at)) return open.id;
      throw new Error('A break is already running');
    }

    if (at < entry.startedAt) throw new Error('Die Pause liegt vor dem Arbeitsbeginn.');
    const endedBreaks = entry.breaks.filter((brk) => brk.endedAt !== null).map((brk) => brk.endedAt as number);
    if (endedBreaks.length && at < Math.max(...endedBreaks))
      throw new Error('Die Pause beginnt vor dem Ende der vorigen Pause.');

    const brk: Break = { id: nextId('break'), startedAt: at, endedAt: null };
    entry.breaks.push(brk);
    return brk.id;
  }

  /** resume_my_job() */
  function resume(userId: string, jobId: string, at: number) {
    const entry = activeEntry(userId, jobId);
    if (!entry) {
      const redelivered = entries
        .filter((candidate) => candidate.jobId === jobId && candidate.userId === userId)
        .flatMap((candidate) => candidate.breaks)
        .filter((brk) => matches(brk.endedAt, at))
        .sort((a, b) => (b.endedAt as number) - (a.endedAt as number))[0];
      if (redelivered) return redelivered.id;
      throw new Error('No active time entry found');
    }

    const open = entry.breaks.filter((brk) => brk.endedAt === null).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!open) {
      const redelivered = entry.breaks
        .filter((brk) => matches(brk.endedAt, at))
        .sort((a, b) => (b.endedAt as number) - (a.endedAt as number))[0];
      if (redelivered) return redelivered.id;
      throw new Error('No break is running');
    }

    if (at < open.startedAt) throw new Error('Das Ende der Pause liegt vor ihrem Beginn.');
    open.endedAt = at;
    return open.id;
  }

  /** stop_my_job() */
  function stop(userId: string, jobId: string, at: number) {
    const entry = activeEntry(userId, jobId);
    if (!entry) {
      const redelivered = entries
        .filter(
          (candidate) =>
            candidate.jobId === jobId && candidate.userId === userId && matches(candidate.finishedAt, at),
        )
        .sort((a, b) => (b.finishedAt as number) - (a.finishedAt as number))[0];
      if (redelivered) return redelivered.id;
      throw new Error('No active time entry found');
    }

    if (at <= entry.startedAt) throw new Error('Der Feierabend liegt vor dem Arbeitsbeginn.');
    if (overlaps(userId, entry.startedAt, at, entry.id))
      throw new Error('Diese Arbeitszeit ueberschneidet eine bereits erfasste Zeit.');

    for (const brk of entry.breaks) if (brk.endedAt === null) brk.endedAt = Math.min(at, now());
    entry.finishedAt = at;
    return entry.id;
  }

  const handlers = { start, pause, resume, stop };

  return {
    entries,
    calls,
    failNext(action, jobId) {
      failOnce = { action, jobId };
    },
    call(userId, action, jobId, clientTime) {
      calls.push({ action, jobId, clientTime });
      if (failOnce && failOnce.action === action && failOnce.jobId === jobId) {
        failOnce = null;
        throw new Error('Verbindung abgebrochen');
      }
      return handlers[action](userId, jobId, Date.parse(clientTime));
    },
    netMinutes(userId) {
      return entries
        .filter((entry) => entry.userId === userId && entry.finishedAt !== null)
        .reduce((total, entry) => {
          const gross = (entry.finishedAt as number) - entry.startedAt;
          const paused = entry.breaks.reduce(
            (sum, brk) => sum + ((brk.endedAt ?? (entry.finishedAt as number)) - brk.startedAt),
            0,
          );
          return total + (gross - paused) / 60000;
        }, 0);
    },
    breakCount(userId) {
      return entries
        .filter((entry) => entry.userId === userId)
        .reduce((total, entry) => total + entry.breaks.length, 0);
    },
  };
}
