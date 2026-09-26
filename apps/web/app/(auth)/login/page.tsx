import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  if (app === 'team') redirect('/mitarbeiter/login');
  if (app === 'portal') redirect('/kunde/login');
  redirect('/admin/login');
}
