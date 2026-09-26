import { LoginSurface } from '@/components/login-surface';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return <LoginSurface variant="office" error={error} message={message} />;
}
