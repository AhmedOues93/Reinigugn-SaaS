import { LoginSurface } from '@/components/login-surface';

export default async function EmployeeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return <LoginSurface variant="employee" error={error} message={message} />;
}
