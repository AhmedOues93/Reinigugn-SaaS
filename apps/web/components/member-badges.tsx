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

/**
 * The account side of a member: can this person sign in, and does the office
 * need to do something about it.
 *
 * INVITED alone could not say whether the link was sent this morning or died
 * three weeks ago — the same badge for both, and nobody finds out until the
 * employee calls. An expired invitation is the one state that needs an action,
 * so it is the one that looks different.
 */
export function AccountStateBadge({
  status,
  invitationState,
}: {
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  invitationState: 'GUELTIG' | 'ANGENOMMEN' | 'ABGELAUFEN' | 'ZURUECKGEZOGEN' | 'UNBEKANNT' | null;
}) {
  if (status === 'ACTIVE') return <Badge tone="success">Aktiv</Badge>;
  if (status === 'DISABLED') return <Badge tone="neutral">Deaktiviert</Badge>;

  switch (invitationState) {
    case 'ABGELAUFEN':
      return <Badge tone="danger">Einladung abgelaufen</Badge>;
    case 'ZURUECKGEZOGEN':
      return <Badge tone="warning">Einladung ersetzt</Badge>;
    case 'GUELTIG':
      return <Badge tone="warning">Einladung offen</Badge>;
    default:
      return <Badge tone="neutral">Keine Einladung</Badge>;
  }
}
