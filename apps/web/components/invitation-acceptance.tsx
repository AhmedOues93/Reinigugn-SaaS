'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvitation, signUpFromInvitation } from '@/app/dashboard/mitarbeiter/actions';
import { initialFormState } from '@/lib/actions';
import { Button, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

export function InvitationSignUp() {
  const [state, action] = useActionState(signUpFromInvitation, initialFormState);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success' && state.id === 'accepted') router.push(state.redirectTo ?? '/dashboard'); }, [router, state]);
  return <form action={action} className="space-y-5"><FormMessage status={state.status} message={state.message} /><label className="block text-sm font-medium">Passwort festlegen<Input className="mt-1.5" name="password" type="password" autoComplete="new-password" minLength={12} required /><span className="mt-1 block text-xs font-normal text-slate-500">Mindestens 12 Zeichen.</span></label><SubmitButton>Konto erstellen und Einladung annehmen</SubmitButton></form>;
}

export function InvitationAcceptButton() {
  const [state, action] = useActionState(acceptInvitation, initialFormState);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success') router.push(state.redirectTo ?? '/dashboard'); }, [router, state]);
  return <form action={action} className="space-y-4"><FormMessage status={state.status} message={state.message} /><SubmitButton>Einladung annehmen</SubmitButton></form>;
}
