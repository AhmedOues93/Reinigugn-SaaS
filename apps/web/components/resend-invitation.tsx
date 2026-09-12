'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { resendEmployeeInvitation } from '@/app/dashboard/mitarbeiter/actions';

export function ResendInvitation({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition(); const [message, setMessage] = useState<string>(); const [url, setUrl] = useState<string>();
  function resend() { startTransition(async () => { const result = await resendEmployeeInvitation(memberId); setMessage(result.message); setUrl(result.invitationUrl); }); }
  return <div className="space-y-3"><Button type="button" variant="outline" disabled={pending} onClick={resend}>{pending ? 'Wird erneuert ...' : 'Einladung erneut senden'}</Button>{message && <p className="text-sm text-teal-800">{message}</p>}{url && <a className="block break-all text-sm text-teal-700 underline" href={url}>{url}</a>}</div>;
}
