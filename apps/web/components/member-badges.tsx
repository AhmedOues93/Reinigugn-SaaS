import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export async function RoleBadge({ role }: { role: 'OWNER' | 'OFFICE' | 'EMPLOYEE' | 'CUSTOMER' }) {
  const locale = await currentLocale();
  return <span className={role === 'OFFICE' ? 'inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700' : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700'}>{t(locale, `role.${role}` as Parameters<typeof t>[1])}</span>;
}

export async function MemberStatusBadge({ status }: { status: 'INVITED' | 'ACTIVE' | 'DISABLED' }) {
  const locale = await currentLocale();
  const classes = status === 'ACTIVE' ? 'bg-teal-50 text-teal-800' : status === 'INVITED' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{t(locale, `status.${status}` as Parameters<typeof t>[1])}</span>;
}
