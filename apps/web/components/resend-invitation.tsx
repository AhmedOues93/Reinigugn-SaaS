'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { FormMessage } from '@/components/form-controls';
import { resendEmployeeInvitation } from '@/app/dashboard/mitarbeiter/actions';

export function ResendInvitation({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>();
  const [url, setUrl] = useState<string>();
  const [showUrl, setShowUrl] = useState(false);

  function resend() {
    startTransition(async () => {
      const result = await resendEmployeeInvitation(memberId);
      setStatus(result.status);
      setMessage(result.message);
      setUrl(result.status === 'success' ? result.invitationUrl : undefined);
      setShowUrl(false);
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={pending} onClick={resend}>
        {pending ? 'Wird erneuert ...' : 'Einladung erneut senden'}
      </Button>
      <FormMessage status={status} message={message} />
      {url && (
        <div className="rounded-md border border-warning/20 bg-warning-soft p-3 text-sm">
          <p className="text-warning">Lokaler Entwicklungslink. In Produktion wird die Einladung per E-Mail zugestellt.</p>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setShowUrl((value) => !value)}>
            {showUrl ? 'Link ausblenden' : 'Link zeigen'}
          </Button>
          {showUrl && <a className="mt-2 block break-all text-primary underline" href={url}>{url}</a>}
        </div>
      )}
    </div>
  );
}
