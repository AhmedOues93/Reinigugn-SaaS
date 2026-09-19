import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@reinigung/ui';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { InfoTooltip } from '@/components/info-tooltip';

/**
 * The product's primitive set. Every interactive control is at least 44px tall
 * (`min-h-touch`), which is the accessible minimum and the size cleaners need on
 * a phone. Sizes and tones are chosen here, not restated per screen, so the three
 * surfaces cannot drift apart.
 */

const buttonVariants = cva(
  'inline-flex min-h-touch shrink-0 select-none items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14),0_1px_2px_0_rgb(11_42_51/0.2)] hover:bg-[hsl(189_80%_23%)]',
        outline: 'border border-input bg-card text-foreground shadow-card hover:border-foreground/25 hover:bg-subtle',
        ghost: 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
        subtle: 'bg-muted text-foreground hover:bg-border',
        danger: 'bg-danger text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14)] hover:bg-danger/90',
        ink: 'bg-ink text-ink-foreground hover:bg-ink/90',
        link: 'min-h-0 px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4',
        sm: 'min-h-9 px-3 text-[13px] max-md:min-h-touch',
        lg: 'min-h-12 px-6 text-base',
        block: 'min-h-12 w-full px-4 text-base',
        icon: 'min-w-touch px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** A link that looks like a button. Avoids nesting `<button>` inside `<a>`. */
export function ButtonLink({
  href,
  className,
  variant,
  size,
  children,
  ...props
}: { href: string; className?: string; children: React.ReactNode } & VariantProps<typeof buttonVariants> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}

export { buttonVariants };

const fieldBase =
  'block w-full rounded-lg border border-input bg-card text-sm text-foreground shadow-[inset_0_1px_1px_0_rgb(11_42_51/0.04)] transition-[border-color,box-shadow] placeholder:text-muted-foreground/75 hover:border-foreground/30 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(fieldBase, 'min-h-touch px-3 py-2', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-28 px-3 py-2.5 leading-6', className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        fieldBase,
        'min-h-touch appearance-none bg-[length:16px] bg-[position:right_0.7rem_center] bg-no-repeat py-2 pe-9 ps-3 rtl:bg-[position:left_0.7rem_center]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6b70' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Label, control and — only when it earns its place — one line of text.
 *
 * - `info`: optional background knowledge, behind an accessible info button
 * - `hint`: text a person genuinely needs to fill the field (kept visible)
 * - `error`: validation message, always visible and announced
 */
export function Field({
  label,
  hint,
  info,
  error,
  optional,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  error?: string;
  optional?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor={htmlFor}>
          {label}
          {optional && <span className="ms-1.5 text-xs font-normal text-muted-foreground">optional</span>}
        </label>
        {info && <InfoTooltip content={info} label={typeof label === 'string' ? `Info: ${label}` : undefined} />}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium leading-5 text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-xl border border-border/80 bg-card text-card-foreground shadow-card', className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border/80 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A titled region without a box. Most groups of information need a heading and
 * whitespace, not another bordered card.
 */
export function Section({
  title,
  action,
  children,
  className,
  description,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pe-2.5 ps-2 text-xs font-medium leading-5 before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[""]',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-soft text-primary',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  children,
}: { className?: string; children: React.ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

/** Page title block. `actions` wraps below the title on narrow screens. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 lg:mb-8', className)}>
      {breadcrumb}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[1.6rem] font-semibold leading-tight sm:text-[1.85rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-muted-foreground">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** "Zurück zu …" link used above detail pages. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group mb-3 inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:min-h-9"
    >
      <svg viewBox="0 0 16 16" className="size-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" aria-hidden="true">
        <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

/** "Nothing here" must never look like a failed page. */
export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-foreground/15 bg-card/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-semibold text-foreground">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-foreground/[0.06]', className)} />;
}

/** Key/value row used by every detail panel. */
export function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-anywhere text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * A row of key figures in one band, separated by hairlines rather than boxed
 * one by one. Each figure can link to where it comes from.
 */
export function StatBand({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; tone?: 'danger' | 'warning' | 'success' }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card',
        items.length >= 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : '',
        className,
      )}
    >
      {items.map((item) => {
        const body = (
          <>
            <dt className="text-[13px] font-medium text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.7rem]',
                item.tone === 'danger' && 'text-danger',
                item.tone === 'warning' && 'text-warning',
                item.tone === 'success' && 'text-success',
              )}
            >
              {item.value}
            </dd>
            {item.note && <dd className="mt-1 text-xs text-muted-foreground">{item.note}</dd>}
          </>
        );
        return (
          <div key={item.label} className="-mb-px -me-px border-b border-e border-border/80">
            {item.href ? (
              <Link href={item.href} className="block h-full p-4 transition-colors hover:bg-subtle sm:p-5">
                {body}
              </Link>
            ) : (
              <div className="h-full p-4 sm:p-5">{body}</div>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Status filters as a segmented row. Scrolls sideways on a phone instead of
 * wrapping into a ragged block.
 */
export function FilterTabs({
  items,
  label,
  className,
}: {
  items: { href: string; label: string; active: boolean; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <ul className="inline-flex min-w-max gap-1 rounded-xl bg-foreground/[0.05] p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors max-md:min-h-touch',
                item.active
                  ? 'bg-card text-foreground shadow-[0_1px_2px_0_rgb(11_42_51/0.12)]'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    item.active ? 'bg-primary-soft text-primary' : 'bg-foreground/[0.07]',
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Callout for statements that must stay visible (legal, destructive, state). */
export function Notice({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral';
  title?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/20 bg-info-soft text-info',
    warning: 'border-warning/25 bg-warning-soft text-warning',
    danger: 'border-danger/20 bg-danger-soft text-danger',
    success: 'border-success/20 bg-success-soft text-success',
    neutral: 'border-border bg-subtle text-muted-foreground',
  } as const;
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5 text-sm leading-6', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-foreground/80')}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * A group of form fields with its title on the left from `lg` upwards. Long
 * forms read as a few clear chapters instead of one undifferentiated column.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('grid gap-x-10 gap-y-4 border-t border-border/80 py-7 first:border-t-0 first:pt-0 lg:grid-cols-[220px_minmax(0,1fr)]', className)}>
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Sticky-at-bottom action row for long forms. */
export function FormActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-2 flex flex-wrap justify-end gap-3 border-t border-border/80 bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
}
