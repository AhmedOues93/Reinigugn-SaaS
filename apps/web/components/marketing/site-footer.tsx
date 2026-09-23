import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { ProductBrand } from '@/components/company-brand';
import { legalLinks, nav } from '@/lib/marketing-content';

/**
 * The footer carries the legally required links. They sit in their own row and
 * are full-height tap targets, because on a phone this is where people actually
 * go looking for the Impressum.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-line bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="ReinPlan – Startseite">
              <BrandMark className="size-8 shrink-0 text-highlight" />
              <ProductBrand className="text-[1.15rem] text-white [&_span]:text-highlight" />
            </Link>
            <p className="mt-3 max-w-[28rem] text-sm leading-6 text-ink-muted">
              Die Betriebssoftware für Reinigungsunternehmen – von der Anfrage bis zur Rechnung.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 md:gap-14">
            <nav aria-label="Produkt">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Produkt</h2>
              <ul className="mt-3">
                {nav.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="inline-flex min-h-touch items-center text-sm text-white/75 transition-colors hover:text-highlight md:min-h-9"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link
                    href="/login"
                    className="inline-flex min-h-touch items-center text-sm text-white/75 transition-colors hover:text-highlight md:min-h-9"
                  >
                    Anmelden
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Rechtliches">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Rechtliches</h2>
              <ul className="mt-3">
                {legalLinks.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-touch items-center text-sm text-white/75 transition-colors hover:text-highlight md:min-h-9"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <p className="mt-10 border-t border-ink-line pt-6 text-xs text-ink-muted">© {year} ReinPlan</p>
      </div>
    </footer>
  );
}
