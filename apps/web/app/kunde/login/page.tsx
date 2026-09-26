import { LoginSurface } from '@/components/login-surface';

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return <LoginSurface variant="portal" error={error} message={message} />;
}
