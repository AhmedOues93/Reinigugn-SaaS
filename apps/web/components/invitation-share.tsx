'use client';

import { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Den Einladungslink direkt weitergeben.
 *
 * In der Reinigung hat nicht jede Kraft ein E-Mail-Postfach, das sie liest,
 * WhatsApp aber fast jede. Der Link ist einmalig, sieben Tage gueltig und
 * verlangt beim Oeffnen die eingeladene E-Mail-Adresse und ein neues
 * Passwort -- wer ihn abfaengt, kann damit kein anderes Konto uebernehmen.
 */
export function InvitationShare({
  url,
  delivered,
  name,
}: {
  url: string;
  /** Ob die E-Mail rausging; aendert nur den Hinweis. */
  delivered: boolean;
  name?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const greeting = name ? `Hallo ${name}, ` : 'Hallo, ';
  const whatsappText = `${greeting}hier ist deine Einladung zu ReinPlan. Öffne den Link und lege dein Passwort fest: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <p className="leading-6 text-foreground">
        {delivered
          ? 'Die Einladung ist per E-Mail unterwegs. Du kannst den Link auch direkt schicken, zum Beispiel per WhatsApp.'
          : 'Die E-Mail konnte nicht zugestellt werden. Schicke den Link direkt an die eingeladene Person.'}
      </p>
      <p className="text-[13px] leading-5 text-muted-foreground">
        Einmalig, 7 Tage gültig. Nicht selbst öffnen, während du angemeldet bist: die Person legt damit ihr eigenes Passwort fest.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? 'Kopiert' : 'Link kopieren'}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-[13px] font-semibold shadow-card hover:bg-subtle max-md:min-h-touch"
        >
          <MessageCircle className="size-4" aria-hidden="true" /> Per WhatsApp senden
        </a>
      </div>
      <p className="break-all rounded-md bg-card px-3 py-2 font-mono text-[12px] text-muted-foreground">{url}</p>
    </div>
  );
}
