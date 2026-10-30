import type { Metadata } from 'next';
import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/platform';

export const metadata: Metadata = {
  title: 'ReinPlan Plattform',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Die Ebene ueber allen Betrieben: nur fuer Betreiber von ReinPlan.
 * Bewusst schlicht und ohne Navigation der Betriebe -- hier wird nicht
 * gearbeitet, hier wird verwaltet, wer arbeiten darf.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePlatformAdmin();
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/platform" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-7 shrink-0 text-highlight" />
            <span className="truncate text-sm font-semibold">ReinPlan Plattform</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-[13px] text-ink-foreground/70 sm:block">{user.email}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="text-ink-foreground/80 hover:bg-white/10 hover:text-ink-foreground">
                Abmelden
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
