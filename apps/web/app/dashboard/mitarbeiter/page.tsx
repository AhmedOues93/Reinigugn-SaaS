import { Plus, Search, UserRoundCheck } from 'lucide-react';
import { listEmployees, type MemberFilter, type RoleFilter } from '@/lib/data/employees';
import { requireStaffCompany } from '@/lib/auth';
import { Button, ButtonLink, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { AccountStateBadge, MemberStatusBadge, RoleBadge } from '@/components/member-badges';

function roleFilter(value?: string): RoleFilter {
  return value === 'OFFICE' || value === 'EMPLOYEE' ? value : 'all';
}
function statusFilter(value?: string): MemberFilter {
  return value === 'INVITED' || value === 'ACTIVE' || value === 'DISABLED' ? value : 'all';
}
type ProfileRow = { first_name: string | null; last_name: string | null; phone: string | null };
function profileFor(member: { profiles: unknown }) {
  const profile = member.profiles as ProfileRow | ProfileRow[] | null;
  return Array.isArray(profile) ? profile[0] : profile;
}

type Member = Awaited<ReturnType<typeof listEmployees>>[number];

function nameOf(member: Member) {
  const profile = profileFor(member);
  return (
    [profile?.first_name ?? member.invited_first_name, profile?.last_name ?? member.invited_last_name].filter(Boolean).join(' ') || '—'
  );
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ search?: string; role?: string; status?: string }> }) {
  const query = await searchParams;
  const role = roleFilter(query.role);
  const status = statusFilter(query.status);
  const [{ role: actorRole }, employees] = await Promise.all([requireStaffCompany(), listEmployees({ search: query.search, role, status })]);
  const filtered = Boolean(query.search) || role !== 'all' || status !== 'all';

  return (
    <>
      <PageHeader
        title="Mitarbeiter"
        description="Büro- und Reinigungsteam, Einladungen und Arbeitsdaten."
        actions={
          <ButtonLink href="/dashboard/mitarbeiter/neu">
            <Plus className="size-4" aria-hidden="true" />
            Mitarbeiter einladen
          </ButtonLink>
        }
      />

      <FilterBar>
        <div className="relative sm:col-span-2 md:min-w-[16rem]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="ps-9" name="search" defaultValue={query.search ?? ''} placeholder="Name, E-Mail oder Telefon" aria-label="Mitarbeiter durchsuchen" />
        </div>
        <Select name="role" defaultValue={role} aria-label="Rolle">
          <option value="all">Alle Rollen</option>
          {actorRole === 'OWNER' && <option value="OFFICE">Büro</option>}
          <option value="EMPLOYEE">Reinigungskraft</option>
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="all">Alle Status</option>
          <option value="INVITED">Eingeladen</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="DISABLED">Deaktiviert</option>
        </Select>
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>

      <DataTable<Member>
        caption="Mitarbeiter"
        rows={employees}
        rowKey={(member) => member.id}
        rowHref={(member) => `/dashboard/mitarbeiter/${member.id}`}
        columns={[
          {
            key: 'name',
            header: 'Name',
            mobile: 'title',
            cell: (member) => (
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="hidden size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary md:grid">
                  {nameOf(member).slice(0, 1)}
                </span>
                {nameOf(member)}
              </span>
            ),
          },
          { key: 'email', header: 'E-Mail', mobile: 'subtitle', cell: (member) => <span className="break-anywhere">{member.invited_email || '—'}</span> },
          { key: 'phone', header: 'Telefon', hideBelow: 'xl', cell: (member) => profileFor(member)?.phone ?? member.invited_phone ?? '—' },
          { key: 'role', header: 'Rolle', cell: (member) => <RoleBadge role={member.role as 'OFFICE' | 'EMPLOYEE'} /> },
          {
            key: 'work',
            header: 'Personalnr. / Stunden',
            hideBelow: 'lg',
            cell: (member) => {
              const details = member.employee_details?.[0];
              return (
                <span className="tabular-nums">
                  {details?.employee_number || '—'}
                  {details?.weekly_hours != null && <span className="ms-2 text-xs">{details.weekly_hours} Std./Wo.</span>}
                </span>
              );
            },
          },
          {
            key: 'status',
            header: 'Zugang',
            mobile: 'status',
            // The account state, not the employment state. An expired
            // invitation needs an action and now says so.
            cell: (member) => (
              <AccountStateBadge
                status={member.status as 'INVITED' | 'ACTIVE' | 'DISABLED'}
                invitationState={member.accountState?.invitation_state ?? null}
              />
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<UserRoundCheck />}
            title={filtered ? 'Keine passenden Mitarbeiter' : 'Noch kein Team'}
            body={filtered ? 'Passen Sie Suche, Rolle oder Status an.' : 'Laden Sie Ihr Team ein – jede Person erhält einen eigenen Zugang zur Mitarbeiter-App.'}
            action={
              !filtered && (
                <ButtonLink href="/dashboard/mitarbeiter/neu">
                  <Plus className="size-4" aria-hidden="true" />
                  Mitarbeiter einladen
                </ButtonLink>
              )
            }
          />
        }
      />
    </>
  );
}
