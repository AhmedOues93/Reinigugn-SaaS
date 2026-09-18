export function StatusBadge({ isActive }: { isActive: boolean }) {
  return <span className={isActive ? 'inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary' : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'}>{isActive ? 'Aktiv' : 'Archiviert'}</span>;
}
