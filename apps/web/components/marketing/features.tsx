import {
  CalendarCheck,
  ClipboardCheck,
  LayoutDashboard,
  ReceiptText,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { features } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * The content module names an icon; this maps the name to the drawing, so the
 * copy file stays free of imports and anyone editing text never touches JSX.
 */
const icons: Record<string, LucideIcon> = {
  office: LayoutDashboard,
  employee: Smartphone,
  portal: Users,
  planning: CalendarCheck,
  billing: ReceiptText,
  proof: ClipboardCheck,
};

export function Features() {
  return (
    <Section id="funktionen" tone="card">
      <SectionHeading
        eyebrow="Funktionen"
        title="Drei Zugänge, ein System"
        body="Büro, Reinigungskraft und Kunde sehen jeweils genau das, was sie brauchen – auf denselben Daten."
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = icons[feature.icon] ?? LayoutDashboard;
          return (
            <article
              key={feature.title}
              className="group min-w-0 rounded-card border border-border/80 bg-background p-6 transition-colors hover:border-primary/35"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-[22px]" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
