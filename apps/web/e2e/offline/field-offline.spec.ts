/**
 * Die Warteschlange der Mitarbeiter-App, in einem echten Browser.
 *
 * Warum eine eigene Suite, obwohl tests/offline-store.test.ts dieselben
 * Funktionen prueft: dort laeuft fake-indexeddb, hier die IndexedDB von
 * Chromium. Der Unterschied ist nicht theoretisch. Der Fehler aus 91fe1da --
 * eine offene Verbindung blockiert `deleteDatabase`, und das Abmelden loeschte
 * deshalb nichts -- ist ein Verhalten des Browsers; ein Ersatz kann es
 * nachbilden oder auch nicht. Und zwei offene Laschen, die sich eine Datenbank
 * teilen, gibt es nur hier.
 *
 * Geprueft wird der Weg, den eine Kraft ohne Empfang wirklich geht: zweite
 * Schicht am selben Einsatz, Pause und Fortsetzen, Wiederverbindung,
 * Abmelden, und das naechste Konto auf demselben Telefon.
 *
 * Kein Backend, kein Build: der Server ist ein Modell mit derselben
 * Wiedererkennung wie die SQL-Funktionen (siehe harness/time-server.ts). Dass
 * der echte Server sich so verhaelt, halten die SQL-Suiten fest, die gegen ein
 * echtes PostgreSQL laufen.
 */
import { expect, test } from '@playwright/test';
import { openFieldApp, serveBlankOrigin } from './harness/page';
import { makeTimeServer, type TimeAction } from './harness/time-server';

/**
 * Die Bruecke zum Server in Node, die der Fall mit zwei Laschen braucht.
 * `exposeFunction` haengt sie unter `window` ein; hier steht nur, wie sie
 * aussieht.
 */
declare global {
  interface Window {
    rpc: (
      userId: string,
      action: TimeAction,
      jobId: string,
      clientTime: string,
    ) => Promise<{ ok: true } | { ok: false; message: string }>;
  }
}

/** Zwei Konten, wie auf einem geteilten Telefon. */
const ANNA = '11111111-1111-4111-8111-111111111111';
const BERND = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';

/** Ein Einsatzplan, wie der Server ihn fuer genau diese Kraft baut. */
const planFor = (userId: string) => ({
  userId,
  cachedAt: new Date().toISOString(),
  jobs: [
    {
      id: JOB,
      title: 'Treppenhaus',
      scheduled_date: '2026-10-08',
      planned_start_at: null,
      planned_end_at: null,
      status: 'PLANNED',
      employee_instructions: null,
      customerName: 'Hausverwaltung Nord',
      objectName: 'Haus 1',
      address: 'Beispielweg 1, 10115 Berlin',
      contactPerson: 'Frau Beispiel',
      contactPhone: '+49 30 0000000',
      accessInstructions: 'Schluessel im Kasten links',
      cleaningInstructions: null,
      checklist: [],
    },
  ],
});

test.beforeEach(async ({ context, page }) => {
  await serveBlankOrigin(context);
  await openFieldApp(page);
});

test.describe('die Warteschlange auf dem Geraet', () => {
  /*
    Der Fall, der Arbeitszeit verschluckte: Anna arbeitet vormittags mit
    Empfang, kommt nachmittags ohne Empfang wieder, und beide Buchungen des
    Nachmittags gehen in die Warteschlange.
  */
  test('eine zweite Schicht am selben Einsatz wird gebucht, nicht verschluckt', async ({ page }) => {
    const result = await page.evaluate(
      async ([userId, jobId]) => {
        const server = window.makeTimeServer();
        const base = Date.parse('2026-10-08T06:00:00.000Z');
        const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

        // Vormittag, mit Empfang: 60 Minuten, direkt gebucht.
        server.call(userId, 'start', jobId, at(0));
        server.call(userId, 'stop', jobId, at(60));

        // Nachmittag, ohne Empfang: beides geht auf das Geraet.
        for (const [action, minutes] of [['start', 300], ['stop', 410]] as const) {
          await window.Offline.enqueue({
            id: crypto.randomUUID(), userId, kind: 'time', action, jobId,
            clientTime: at(minutes), attempts: 0,
          });
        }

        const outcome = await window.syncWith(server, userId);
        return {
          outcome,
          entries: server.entries.length,
          netMinutes: server.netMinutes(userId),
          stillQueued: (await window.Offline.listQueue(userId)).length,
        };
      },
      [ANNA, JOB] as const,
    );

    expect(result.entries, 'zwei Schichten, zwei Buchungen').toBe(2);
    expect(result.netMinutes, '60 plus 110 Minuten').toBe(170);
    expect(result.outcome).toMatchObject({ applied: 2, failed: 0, deferred: 0 });
    expect(result.stillQueued).toBe(0);
  });

  /*
    Die Reihenfolge ist nicht Kosmetik: ein Feierabend vor dem Start ergibt
    nichts, und IndexedDB liefert nach Schluessel, nicht nach Tippzeitpunkt.
    Darum werden die vier hier absichtlich verdreht abgelegt.
  */
  test('Pause und Fortsetzen kommen in der Reihenfolge an, in der getippt wurde', async ({ page }) => {
    const result = await page.evaluate(
      async ([userId, jobId]) => {
        const server = window.makeTimeServer();
        const base = Date.parse('2026-10-08T11:00:00.000Z');
        const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

        for (const [action, minutes] of [
          ['stop', 120], ['start', 0], ['resume', 90], ['pause', 60],
        ] as const) {
          await window.Offline.enqueue({
            id: crypto.randomUUID(), userId, kind: 'time', action, jobId,
            clientTime: at(minutes), attempts: 0,
          });
        }

        const outcome = await window.syncWith(server, userId);
        return {
          sent: server.calls.map((call) => call.action),
          outcome,
          entries: server.entries.length,
          breaks: server.breakCount(userId),
          netMinutes: server.netMinutes(userId),
          stillQueued: (await window.Offline.listQueue(userId)).length,
        };
      },
      [ANNA, JOB] as const,
    );

    expect(result.sent).toEqual(['start', 'pause', 'resume', 'stop']);
    expect(result.entries).toBe(1);
    expect(result.breaks).toBe(1);
    expect(result.netMinutes, 'zwei Stunden minus dreissig Minuten Pause').toBe(90);
    expect(result.stillQueued).toBe(0);
  });

  /*
    Der Grund, warum runSync nach einem Fehlschlag keine weitere Buchung
    desselben Einsatzes versucht: ein Feierabend schliesst eine offene Pause
    auf den Feierabend. Laeuft er trotz fehlgeschlagenem Fortsetzen durch,
    werden aus dreissig Minuten Pause zwei Stunden.
  */
  test('ein fehlgeschlagenes Fortsetzen haelt den Feierabend zurueck', async ({ page }) => {
    const result = await page.evaluate(
      async ([userId, jobId]) => {
        const server = window.makeTimeServer();
        const base = Date.parse('2026-10-08T08:00:00.000Z');
        const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

        server.call(userId, 'start', jobId, at(0));
        for (const [action, minutes] of [
          ['pause', 120], ['resume', 150], ['stop', 240],
        ] as const) {
          await window.Offline.enqueue({
            id: crypto.randomUUID(), userId, kind: 'time', action, jobId,
            clientTime: at(minutes), attempts: 0,
          });
        }

        server.failNext('resume', jobId);
        const firstRun = await window.syncWith(server, userId);
        const sentInFirstRun = server.calls.map((call) => call.action);
        const finishedAfterFailure = server.entries[0].finishedAt !== null;

        // Die naechste Wiederverbindung holt die Folge von der Stelle nach.
        const secondRun = await window.syncWith(server, userId);
        return {
          firstRun, secondRun, sentInFirstRun, finishedAfterFailure,
          netMinutes: server.netMinutes(userId),
          stillQueued: (await window.Offline.listQueue(userId)).length,
        };
      },
      [ANNA, JOB] as const,
    );

    expect(result.firstRun).toMatchObject({ failed: 1, deferred: 1 });
    expect(result.sentInFirstRun, 'der Feierabend darf nicht losgeschickt worden sein')
      .not.toContain('stop');
    expect(result.finishedAfterFailure).toBe(false);
    expect(result.netMinutes, 'vier Stunden minus dreissig Minuten Pause').toBe(210);
    expect(result.stillQueued, 'die Wiederverbindung muss die Folge nachholen').toBe(0);
  });

  /*
    Zwei Laschen derselben App teilen sich eine Datenbank. Das ist der Fall,
    der die Warteschlange dauerhaft verstopfte:

      Lasche A sendet die Pause, der Server bucht sie, die Antwort geht beim
      Wechsel von Mobilfunk auf WLAN verloren. Lasche B raeumt dieselbe
      Warteschlange weiter auf und bucht Fortsetzen und Feierabend; alle drei
      verlassen die Warteschlange. Erst danach laeuft Lasche A in ihren
      Zeitablauf und vermerkt den Fehlversuch.

    `markAttempt` war ein `put` und legte die laengst zugestellte Pause damit
    wieder an. Danach schlug sie bei jedem Versuch fehl -- eine beendete
    Buchung wird nie wieder offen -- und weil runSync nach einem Fehlschlag
    jede weitere Buchung desselben Einsatzes zurueckhaelt, kam auch die
    naechste Schicht nicht mehr durch.
  */
  test('eine Buchung, die eine andere Lasche schon zugestellt hat, kommt nicht zurueck', async ({ context, page }) => {
    /*
      Ein Server, in Node, fuer beide Laschen -- das ist die echte
      Aufstellung. Ein Servermodell je Lasche wuerde genau den geteilten
      Zustand verfehlen, um den es hier geht.
    */
    const server = makeTimeServer();
    await context.exposeFunction(
      'rpc',
      (userId: string, action: TimeAction, jobId: string, clientTime: string) => {
        try {
          server.call(userId, action, jobId, clientTime);
          return { ok: true as const };
        } catch (error) {
          return { ok: false as const, message: error instanceof Error ? error.message : 'unbekannt' };
        }
      },
    );

    // Die Bruecke wird beim Laden eingehaengt, also beide Seiten neu oeffnen.
    await openFieldApp(page);
    const otherTab = await context.newPage();
    await openFieldApp(otherTab);

    const base = Date.parse('2026-10-08T05:00:00.000Z');
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const schedule: [TimeAction, string][] = [
      ['start', at(0)], ['pause', at(60)], ['resume', at(90)], ['stop', at(180)],
    ];

    // Der ganze Tag liegt auf dem Geraet, abgelegt ohne Empfang.
    await page.evaluate(
      async ([userId, jobId, entries]) => {
        for (const [action, clientTime] of entries) {
          await window.Offline.enqueue({
            id: crypto.randomUUID(), userId, kind: 'time', action, jobId, clientTime, attempts: 0,
          });
        }
      },
      [ANNA, JOB, schedule] as const,
    );

    /*
      Lasche A kommt bis zur Pause. Der Start wird gebucht und entfernt, die
      Pause erreicht den Server und wird gebucht -- aber die Antwort geht
      verloren, und der Fehlversuch ist noch nicht geschrieben.
    */
    const pending = await page.evaluate(
      async ([userId, jobId, entries]) => {
        const queue = await window.Offline.listQueue(userId);
        const startOp = queue.find((operation) => operation.kind === 'time' && operation.action === 'start');
        const pauseOp = queue.find((operation) => operation.kind === 'time' && operation.action === 'pause');
        if (!startOp || !pauseOp) throw new Error('die Warteschlange ist nicht wie erwartet gefuellt');

        for (const [action, clientTime] of entries.slice(0, 2)) {
          await window.rpc(userId, action, jobId, clientTime);
        }
        await window.Offline.dequeue(startOp.id);
        return pauseOp;
      },
      [ANNA, JOB, schedule] as const,
    );

    // Lasche B raeumt dieselbe Warteschlange auf: die Pause wird als zweite
    // Zustellung erkannt, Fortsetzen und Feierabend gehen durch.
    const drained = await otherTab.evaluate(
      async ([userId]) => {
        const outcome = await window.runSync(userId, async (operation) => {
          if (operation.kind !== 'time') return { data: 'APPLIED', error: null };
          const result = await window.rpc(userId, operation.action, operation.jobId, operation.clientTime);
          return result.ok
            ? { data: 'APPLIED', error: null }
            : { data: null, error: { message: result.message } };
        });
        return { outcome, stillQueued: (await window.Offline.listQueue(userId)).length };
      },
      [ANNA] as const,
    );

    expect(drained.outcome).toMatchObject({ failed: 0, deferred: 0 });
    expect(drained.stillQueued, 'die zweite Lasche hat die Warteschlange geleert').toBe(0);
    expect(server.entries, 'eine Buchung, nicht zwei').toHaveLength(1);
    expect(server.entries[0].finishedAt, 'der Tag ist abgeschlossen').not.toBeNull();
    expect(server.breakCount(ANNA), 'die Pause darf nicht doppelt gebucht sein').toBe(1);
    expect(server.netMinutes(ANNA), 'drei Stunden minus dreissig Minuten Pause').toBe(150);

    // Und nun der Zeitablauf von Lasche A.
    const afterLateFailure = await page.evaluate(
      async ([userId, operation]) => {
        await window.Offline.markAttempt(operation, 'Verbindung abgebrochen');
        return (await window.Offline.listQueue(userId)).length;
      },
      [ANNA, pending] as const,
    );

    expect(
      afterLateFailure,
      'ein spaeter Fehlversuch darf eine zugestellte Buchung nicht wiederbeleben',
    ).toBe(0);

    /*
      Die Folge, wegen der das kein Schoenheitsfehler war: eine Buchung, die
      nie gelingt, haelt in runSync jede weitere Buchung desselben Einsatzes
      zurueck. Eine neue Schicht muss durchkommen.
    */
    const nextShift = await page.evaluate(
      async ([userId, jobId]) => {
        const base = Date.parse('2026-10-08T05:00:00.000Z');
        for (const [action, minutes] of [['start', 300], ['stop', 400]] as const) {
          await window.Offline.enqueue({
            id: crypto.randomUUID(), userId, kind: 'time', action, jobId,
            clientTime: new Date(base + minutes * 60_000).toISOString(), attempts: 0,
          });
        }
        const outcome = await window.runSync(userId, async (operation) => {
          if (operation.kind !== 'time') return { data: 'APPLIED', error: null };
          const result = await window.rpc(userId, operation.action, operation.jobId, operation.clientTime);
          return result.ok
            ? { data: 'APPLIED', error: null }
            : { data: null, error: { message: result.message } };
        });
        return { outcome, stillQueued: (await window.Offline.listQueue(userId)).length };
      },
      [ANNA, JOB] as const,
    );

    expect(nextShift.outcome, 'die naechste Schicht darf nicht zurueckgehalten werden')
      .toMatchObject({ applied: 2, failed: 0, deferred: 0 });
    expect(nextShift.stillQueued).toBe(0);
    expect(server.netMinutes(ANNA), '150 plus 100 Minuten').toBe(250);
  });

  /*
    Der Fehler aus 91fe1da, gegen die IndexedDB von Chromium statt gegen einen
    Ersatz: eine offene Verbindung blockiert `deleteDatabase`, der Browser
    meldet `blocked`, und das wurde als Erfolg behandelt.
  */
  test('das Abmelden laesst keinen Plan, keine Buchung und kein Foto zurueck', async ({ page }) => {
    const result = await page.evaluate(
      async ([userId, jobId, plan]) => {
        await window.Offline.saveSnapshot(plan as Parameters<typeof window.Offline.saveSnapshot>[0]);
        await window.Offline.enqueue({
          id: crypto.randomUUID(), userId, kind: 'time', action: 'start', jobId,
          clientTime: new Date().toISOString(), attempts: 0,
        });
        await window.Offline.savePhoto(
          {
            id: crypto.randomUUID(), userId, jobId, clientUploadId: crypto.randomUUID(),
            category: 'AFTER', description: null, checklistItemId: null,
            fileName: 'nachher.jpg', contentType: 'image/jpeg', size: 3,
            clientTime: new Date().toISOString(), status: 'pending', attempts: 0,
          },
          new Blob(['abc'], { type: 'image/jpeg' }),
        );

        const before = {
          plan: (await window.Offline.readSnapshot(userId)) !== null,
          queue: (await window.Offline.listQueue(userId)).length,
          photos: (await window.Offline.listPhotos(userId)).length,
        };

        await window.Offline.clearOfflineData();

        return {
          before,
          after: {
            plan: (await window.Offline.readSnapshot(userId)) !== null,
            queue: (await window.Offline.listQueue(userId)).length,
            photos: (await window.Offline.listPhotos(userId)).length,
          },
        };
      },
      [ANNA, JOB, planFor(ANNA)] as const,
    );

    expect(result.before, 'vorher muss etwas da sein, sonst prueft das nichts')
      .toEqual({ plan: true, queue: 1, photos: 1 });
    expect(result.after).toEqual({ plan: false, queue: 0, photos: 0 });
  });

  /*
    Ein geteiltes Telefon ist der Regelfall, nicht die Ausnahme. Was die
    vorige Kraft gesehen hat -- Adressen, Zugangshinweise, Ansprechpartner mit
    Telefonnummer -- darf die naechste nicht sehen.
  */
  test('das naechste Konto auf dem Telefon sieht nichts vom vorigen', async ({ page }) => {
    const result = await page.evaluate(
      async ([anna, bernd, jobId, annaPlan, berndPlan]) => {
        await window.Offline.saveSnapshot(annaPlan as Parameters<typeof window.Offline.saveSnapshot>[0]);
        await window.Offline.enqueue({
          id: crypto.randomUUID(), userId: anna, kind: 'time', action: 'start', jobId,
          clientTime: new Date().toISOString(), attempts: 0,
        });
        await window.Offline.savePhoto(
          {
            id: crypto.randomUUID(), userId: anna, jobId, clientUploadId: crypto.randomUUID(),
            category: 'AFTER', description: null, checklistItemId: null,
            fileName: 'nachher.jpg', contentType: 'image/jpeg', size: 3,
            clientTime: new Date().toISOString(), status: 'pending', attempts: 0,
          },
          new Blob(['abc'], { type: 'image/jpeg' }),
        );

        // Noch bevor etwas geleert wird: der Schluessel allein muss den
        // fremden Lesezugriff schon abweisen.
        const beforeClearing = {
          plan: (await window.Offline.readSnapshot(bernd)) !== null,
          queue: (await window.Offline.listQueue(bernd)).length,
          photos: (await window.Offline.listPhotos(bernd)).length,
        };

        // Und das, was der Provider tut, wenn er ein anderes Konto bemerkt.
        await window.Offline.clearOfflineData();
        await window.Offline.saveSnapshot(berndPlan as Parameters<typeof window.Offline.saveSnapshot>[0]);

        return {
          beforeClearing,
          afterSwitch: {
            ownPlan: (await window.Offline.readSnapshot(bernd)) !== null,
            previousPlan: (await window.Offline.readSnapshot(anna)) !== null,
            queue: (await window.Offline.listQueue(bernd)).length,
            photos: (await window.Offline.listPhotos(bernd)).length,
          },
        };
      },
      [ANNA, BERND, JOB, planFor(ANNA), planFor(BERND)] as const,
    );

    expect(result.beforeClearing, 'ein Lesezugriff fuer ein anderes Konto gibt nichts')
      .toEqual({ plan: false, queue: 0, photos: 0 });
    expect(result.afterSwitch).toEqual({
      ownPlan: true, previousPlan: false, queue: 0, photos: 0,
    });
  });

  /*
    Eine Warteschlange, die das Schliessen der App nicht uebersteht, ist
    keine. Das Telefon wird zugesteckt, der Browser raeumt die Lasche ab, und
    die Buchung muss am Abend noch da sein.
  */
  test('eine abgelegte Buchung uebersteht das Schliessen der App', async ({ page }) => {
    const before = await page.evaluate(
      async ([userId, jobId]) => {
        await window.Offline.enqueue({
          id: crypto.randomUUID(), userId, kind: 'time', action: 'start', jobId,
          clientTime: new Date().toISOString(), attempts: 0,
        });
        return (await window.Offline.listQueue(userId)).length;
      },
      [ANNA, JOB] as const,
    );

    await page.reload();
    await openFieldApp(page);

    const after = await page.evaluate(
      async ([userId]) => (await window.Offline.listQueue(userId)).length,
      [ANNA] as const,
    );

    expect(before).toBe(1);
    expect(after, 'die Buchung muss den Neustart ueberleben').toBe(1);
  });
});
