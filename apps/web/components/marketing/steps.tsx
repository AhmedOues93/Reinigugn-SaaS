import { steps } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * How the product actually works, in the order the work happens.
 *
 * These are the product's real stages, not a marketing abstraction: each one
 * corresponds to a surface that exists. The connecting rule is drawn only from
 * desktop up — on a phone the cards already stack in reading order and a line
 * between them adds nothing.
 */
export function Steps() {
  return (
    <Section id="ablauf">
      <SectionHeading
        eyebrow="So arbeitet ReinPlan"
        title="Ein Ablauf, von der Anfrage bis zur Zahlung"
        body="Jeder Schritt übergibt an den nächsten. Was im Angebot vereinbart wurde, gilt im Einsatz und steht auf der Rechnung – ohne dass es jemand erneut eingibt."
      />

      <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="relative flex min-w-0 flex-col rounded-card border border-border/80 bg-card p-5 shadow-card"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-semibold tabular-nums text-primary"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <h3 className="mt-4 text-[15px] font-semibold leading-snug text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
