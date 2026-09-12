export function RoleBadge({ role }: { role: 'OWNER' | 'OFFICE' | 'EMPLOYEE' | 'CUSTOMER' }) {
  const label = role === 'OWNER' ? 'Inhaber' : role === 'OFFICE' ? 'Buero' : role === 'EMPLOYEE' ? 'Mitarbeiter' : 'Kunde';
  return <span className={role === 'OFFICE' ? 'inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700' : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700'}>{label}</span>;
}

export function MemberStatusBadge({ status }: { status: 'INVITED' | 'ACTIVE' | 'DISABLED' }) {
  const classes = status === 'ACTIVE' ? 'bg-teal-50 text-teal-800' : status === 'INVITED' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600';
  const label = status === 'ACTIVE' ? 'Aktiv' : status === 'INVITED' ? 'Eingeladen' : 'Deaktiviert';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{label}</span>;
}
