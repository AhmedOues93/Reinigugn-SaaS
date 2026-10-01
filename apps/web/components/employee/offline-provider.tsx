'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  clearOfflineData,
  enqueue,
  listQueue,
  saveSnapshot,
  type CachedSnapshot,
  type TimeAction,
  type TimeOperation,
} from '@/lib/offline/store';
import { runSync } from '@/lib/offline/sync';

export type ConnectionState = 'offline' | 'syncing' | 'synced' | 'failed';

type OfflineValue = {
  online: boolean;
  state: ConnectionState;
  pending: number;
  conflicts: number;
  cachedAt: string | null;
  sync: () => void;
  queueChecklistItem: (itemId: string, completed: boolean) => Promise<void>;
  /** Stempelt eine Zeitbuchung auf dem Geraet und stellt sie in die Warteschlange. */
  queueTimeAction: (jobId: string, action: TimeAction) => Promise<void>;
  /** Noch nicht uebertragene Zeitbuchungen eines Einsatzes, aelteste zuerst. */
  queuedTime: TimeOperation[];
};

const OfflineContext = createContext<OfflineValue | null>(null);

export function useOffline() {
  return useContext(OfflineContext);
}

/** The key that lets us notice a different account on a shared phone. */
const lastUserKey = 'sauberwerk-employee-user';

/**
 * Owns everything device-local in the field app.
 *
 * User isolation: the signed-in user id arrives from the server on every render.
 * If it differs from the one the device last saw, the whole local database and
 * every cache are dropped before anything is read or written, so a shared phone
 * cannot show the previous cleaner's work.
 *
 * Scope: only the snapshot the server built for this employee is stored — their
 * own assigned visits. Nothing is derived client-side from another tenant.
 *
 * Messaging is deliberately absent here: it stays online-only so a message can
 * never appear sent while it is still on the device.
 */
export function OfflineProvider({
  userId,
  snapshot,
  children,
}: {
  userId: string;
  snapshot: CachedSnapshot | null;
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState(true);
  const [state, setState] = useState<ConnectionState>('synced');
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [cachedAt, setCachedAt] = useState<string | null>(snapshot?.cachedAt ?? null);
  const [queuedTime, setQueuedTime] = useState<TimeOperation[]>([]);
  const [ready, setReady] = useState(false);
  const running = useRef(false);

  // Step one on every mount: make sure the device belongs to this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const previous = window.localStorage.getItem(lastUserKey);
        if (previous && previous !== userId) await clearOfflineData();
        window.localStorage.setItem(lastUserKey, userId);
      } catch {
        // A blocked storage API is not a reason to keep stale data around.
        await clearOfflineData();
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready || !snapshot || snapshot.userId !== userId) return;
    void saveSnapshot(snapshot).then(() => setCachedAt(snapshot.cachedAt));
  }, [ready, snapshot, userId]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/employee-sw.js', { scope: '/mitarbeiter' }).catch(() => undefined);
  }, []);

  const refreshPending = useCallback(async () => {
    const queue = await listQueue(userId);
    setPending(queue.length);
    // Die Zeitbuchungen getrennt halten: die Einsatzansicht rechnet sie auf
    // den Serverstand drauf, damit die Uhr ohne Empfang trotzdem laeuft.
    setQueuedTime(queue.filter((operation): operation is TimeOperation => operation.kind === 'time'));
    return queue.length;
  }, [userId]);

  const sync = useCallback(() => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    void (async () => {
      const queued = await refreshPending();
      if (queued === 0) {
        setState('synced');
        running.current = false;
        return;
      }
      setState('syncing');
      const supabase = createClient();
      const outcome = await runSync(userId, async (operation) => {
        if (operation.kind === 'time') {
          /*
            Die vier Zeitfunktionen nehmen den Tippzeitpunkt entgegen und sind
            gegen eine zweite Zustellung abgesichert: ein bereits gestarteter
            Einsatz liefert seine vorhandene Buchung zurueck statt eine zweite
            anzulegen. Ein Konfliktbegriff wie bei der Checkliste existiert
            hier nicht -- es gibt nur angewendet oder fehlgeschlagen.
          */
          const rpc = {
            start: 'start_my_job',
            pause: 'pause_my_job',
            resume: 'resume_my_job',
            stop: 'stop_my_job',
          }[operation.action];
          const { error } = await supabase.rpc(rpc, {
            p_job_id: operation.jobId,
            p_at: operation.clientTime,
          });
          return { data: 'APPLIED', error: error ? { message: error.message } : null };
        }
        const { data, error } = await supabase.rpc('sync_my_checklist_item', {
          p_item_id: operation.itemId,
          p_completed: operation.completed,
          p_client_time: operation.clientTime,
        });
        return { data: (data as string | null) ?? null, error: error ? { message: error.message } : null };
      });
      const left = await refreshPending();
      setConflicts((value) => value + outcome.conflicted);
      setState(outcome.failed > 0 || left > 0 ? 'failed' : 'synced');
      running.current = false;
      if (outcome.applied > 0 || outcome.conflicted > 0) window.location.reload();
    })();
  }, [refreshPending, userId]);

  useEffect(() => {
    if (!ready) return;
    const update = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) sync();
      else setState('offline');
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [ready, sync]);

  const queueChecklistItem = useCallback(
    async (itemId: string, completed: boolean) => {
      await enqueue({
        id: crypto.randomUUID(),
        userId,
        kind: 'checklist',
        itemId,
        completed,
        // The moment the cleaner tapped decides conflicts on the server.
        clientTime: new Date().toISOString(),
        attempts: 0,
      });
      await refreshPending();
      setState(navigator.onLine ? 'syncing' : 'offline');
      if (navigator.onLine) sync();
    },
    [refreshPending, sync, userId],
  );

  const queueTimeAction = useCallback(
    async (jobId: string, action: TimeAction) => {
      await enqueue({
        id: crypto.randomUUID(),
        userId,
        kind: 'time',
        action,
        jobId,
        // Der Moment des Tippens ist die erfasste Zeit. Der Server prueft ihn
        // (nicht in der Zukunft, nicht aelter als 48 Stunden) und vermerkt die
        // Buchung als nachgetragen.
        clientTime: new Date().toISOString(),
        attempts: 0,
      });
      await refreshPending();
      setState(navigator.onLine ? 'syncing' : 'offline');
      if (navigator.onLine) sync();
    },
    [refreshPending, sync, userId],
  );

  const value = useMemo<OfflineValue>(
    () => ({ online, state, pending, conflicts, cachedAt, sync, queueChecklistItem, queueTimeAction, queuedTime }),
    [online, state, pending, conflicts, cachedAt, sync, queueChecklistItem, queueTimeAction, queuedTime],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
