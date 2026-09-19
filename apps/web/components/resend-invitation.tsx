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

  function resend() {
    startTransition(async () => {
      const result = await resendEmployeeInvitation(memberId);
      setStatus(result.status);
      setMessage(result.message);
      setUrl(result.status === 'success' ? result.invitationUrl : undefined);
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={pending} onClick={resend}>
        {pending ? 'Wird erneuert ...' : 'Einladung erneut senden'}
      </Button>
      <FormMessage status={status} message={message} />
      {url && (
        <a className="block break-all text-sm text-primary underline" href={url}>
          {url}
        </a>
      )}
    </div>
  );
}
