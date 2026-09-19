import { redirect } from 'next/navigation';
import { getCurrentCompany } from '@/lib/auth';
import { landingPathForRole } from '@/lib/landing';

export default async function Home() {
  const { membership } = await getCurrentCompany();
  redirect(landingPathForRole(membership?.role));
}
