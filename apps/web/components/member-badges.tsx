import { Badge } from '@/components/ui';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const roleTone = {
  OWNER: 'primary',
  OFFICE: 'info',
  EMPLOYEE: 'neutral',
  CUSTOMER: 'neutral',
} as const;

export async function RoleBadge({ role }: { role: 'OWNER' | 'OFFICE' | 'EMPLOYEE' | 'CUSTOMER' }) {
  const locale = await currentLocale();
  return <Badge tone={roleTone[role]}>{t(locale, `role.${role}` as Parameters<typeof t>[1])}</Badge>;
}

const statusTone = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DISABLED: 'neutral',
} as const;

export async function MemberStatusBadge({ status }: { status: 'INVITED' | 'ACTIVE' | 'DISABLED' }) {
  const locale = await currentLocale();
  return <Badge tone={statusTone[status]}>{t(locale, `status.${status}` as Parameters<typeof t>[1])}</Badge>;
}
