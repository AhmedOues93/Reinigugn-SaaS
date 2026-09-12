import Link from 'next/link';
import { Bell, Building2, CalendarDays, ChevronDown, ClipboardCheck, Clock3, FileText, LayoutDashboard, Menu, MessageSquare, Receipt, Settings, Users, UserRoundCheck, Wrench } from 'lucide-react';
import { logout } from '@/app/(auth)/actions';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, active: true },
  { href: '/dashboard/kunden', label: 'Kunden', icon: Users, active: true },
  { href: '/dashboard/objekte', label: 'Objekte', icon: Building2, active: true },
  { href: '/dashboard/mitarbeiter', label: 'Mitarbeiter', icon: UserRoundCheck },
  { href: '/dashboard/planung', label: 'Planung', icon: CalendarDays, active: true },
  { href: '/dashboard/auftraege', label: 'Auftraege', icon: ClipboardCheck, active: true },
  { href: '/dashboard/arbeitszeiten', label: 'Arbeitszeiten', icon: Clock3 },
  { href: '/dashboard/urlaub-krankheit', label: 'Urlaub & Krankheit', icon: CalendarDays },
  { href: '/dashboard/reklamationen', label: 'Reklamationen', icon: Bell },
  { href: '/dashboard/nachrichten', label: 'Nachrichten', icon: MessageSquare },
  { href: '/dashboard/leistungsnachweise', label: 'Leistungsnachweise', icon: FileText },
  { href: '/dashboard/abrechnung', label: 'Abrechnung', icon: Receipt },
  { href: '/dashboard/settings', label: 'Einstellungen', icon: Settings, active: true },
];

function Navigation({ role }: { role: 'OWNER' | 'OFFICE' | 'EMPLOYEE' }) {
  const visibleNavigation = role === 'EMPLOYEE'
    ? [{ href: '/dashboard/mein-bereich', label: 'Mein Bereich', icon: LayoutDashboard, active: true }]
    : navigation;
  return <nav className="space-y-1" aria-label="Hauptnavigation">
    {visibleNavigation.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950">
      <Icon className="size-4" aria-hidden="true" />{label}{!active && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bald</span>}
    </Link>)}
  </nav>;
}

export function DashboardShell({ children, companyName, email, role }: { children: React.ReactNode; companyName: string; email: string; role: 'OWNER' | 'OFFICE' | 'EMPLOYEE' }) {
  return <div className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 hidden w-64 border-r bg-white p-4 lg:block">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">Sauber<span className="text-teal-700">Werk</span></Link>
      <Navigation role={role} />
      <div className="absolute bottom-5 left-4 right-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500"><p className="font-medium text-slate-700">{companyName}</p><p className="mt-1">{role === 'OWNER' ? 'Inhaberzugang' : role === 'OFFICE' ? 'Buerozugang' : 'Mitarbeiterzugang'}</p></div>
    </aside>
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-4 lg:ml-64 lg:px-8">
      <details className="lg:hidden"><summary className="flex cursor-pointer list-none items-center rounded-md p-2 hover:bg-slate-100"><Menu className="size-5" /><span className="sr-only">Menue oeffnen</span></summary><div className="absolute left-0 top-16 h-[calc(100vh-4rem)] w-72 overflow-auto border-r bg-white p-4 shadow-lg"><Navigation role={role} /></div></details>
      <div className="hidden items-center gap-2 text-sm text-slate-600 lg:flex"><Wrench className="size-4 text-teal-700" /><span>{companyName}</span></div>
      <details className="relative ml-auto"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"><span className="grid size-8 place-items-center rounded-full bg-teal-100 font-semibold text-teal-800">{email.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-48 truncate sm:block">{email}</span><ChevronDown className="size-4 text-slate-500" /></summary><div className="absolute right-0 mt-2 w-56 rounded-md border bg-white p-1 shadow-lg"><Link className="block rounded px-3 py-2 text-sm hover:bg-slate-50" href="/dashboard/settings">Einstellungen</Link><form action={logout}><button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" type="submit">Abmelden</button></form></div></details>
    </header>
    <main className="p-4 sm:p-6 lg:ml-64 lg:p-8">{children}</main>
  </div>;
}
