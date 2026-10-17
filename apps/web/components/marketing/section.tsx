import { cn } from '@reinigung/ui';

/**
 * One vertical rhythm for the whole page.
 *
 * Every section is the same width and the same height apart, so the page reads
 * as one document rather than a stack of separately designed blocks. `tone`
 * picks the surface: Nebel is the default workspace colour, `ink` is Tiefsee
 * and is used sparingly, to break the page into chapters.
 */
export function Section({
  id,
  tone = 'default',
  className,
  children,
}: {
  id?: string;
  tone?: 'default' | 'card' | 'ink';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-20',
        tone === 'ink' && 'surface-ink text-ink-foreground',
        tone === 'card' && 'bg-card',
        tone === 'default' && 'bg-background',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8">{children}</div>
    </section>
  );
}

/**
 * The heading block that opens a section: a small eyebrow, the heading, and one
 * sentence of support. Centred by default because every section here is a
 * full-width band rather than a column beside something else.
 */
export function SectionHeading({
  eyebrow,
  title,
  body,
  tone = 'default',
  className,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  tone?: 'default' | 'ink';
  className?: string;
}) {
  const onInk = tone === 'ink';
  return (
    <div className={cn('mx-auto max-w-[46rem] text-center', className)}>
      {eyebrow && (
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.18em]',
            /* Gischt only ever appears on Tiefsee; on Nebel it would fail
               contrast, which is what the two accent weights exist to prevent. */
            onInk ? 'text-highlight/85' : 'text-primary',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          'mt-3 text-[1.85rem] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[2.35rem]',
          onInk ? 'text-white' : 'text-foreground',
        )}
      >
        {title}
      </h2>
      {body && (
        <p className={cn('mx-auto mt-4 max-w-[40rem] text-[15px] leading-7 sm:text-base', onInk ? 'text-white/65' : 'text-muted-foreground')}>
          {body}
        </p>
      )}
    </div>
  );
}

/**
 * Splits a headline around its accent word. Borrowed from the sign-in screen so
 * both surfaces emphasise the same word the same way; a headline whose accent
 * is missing simply renders plain rather than stressing the wrong word.
 */
export function AccentedHeadline({ headline, accent }: { headline: string; accent: string }) {
  const at = accent ? headline.lastIndexOf(accent) : -1;
  if (at < 0) return <>{headline}</>;
  return (
    <>
      {headline.slice(0, at)}
      <span className="text-highlight">{headline.slice(at, at + accent.length)}</span>
      {headline.slice(at + accent.length)}
    </>
  );
}
