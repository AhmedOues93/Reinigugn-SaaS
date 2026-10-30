'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { FormMessage } from '@/components/form-controls';
import { resendEmployeeInvitation } from '@/app/dashboard/mitarbeiter/actions';
import { InvitationShare } from '@/components/invitation-share';

export function ResendInvitation({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>();
  const [share, setShare] = useState<{ url: string; delivered: boolean; name?: string }>();

  function resend() {
    startTransition(async () => {
      const result = await resendEmployeeInvitation(memberId);
      setStatus(result.status);
      setMessage(result.message);
      setShare(result.invitationUrl
        ? { url: result.invitationUrl, delivered: result.invitationDelivered === true, name: result.invitationName }
        : undefined);
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={pending} onClick={resend}>
        {pending ? 'Wird erneuert ...' : 'Einladung erneut senden / Link erzeugen'}
      </Button>
      <FormMessage status={status} message={message} />
      {share && <InvitationShare url={share.url} delivered={share.delivered} name={share.name} />}
    </div>
  );
}
