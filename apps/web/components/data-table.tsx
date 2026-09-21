import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@reinigung/ui';

/**
 * The one list/table pattern for office screens.
 *
 * From `md` upwards it is a real `<table>`: aligned columns, sticky-feeling
 * header, row hover, trailing chevron when rows open a detail page. Below `md`
 * the same column definitions render as stacked records — a title line, a
 * status in the corner and the remaining fields as a compact label/value grid —
 * so nothing is lost on a phone and nothing scrolls sideways.
 *
 * Deliberately small: no client state, no sorting engine. Filters stay in the
 * URL as they already are, so every list remains a plain server component.
 */
export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'start' | 'end';
  /** Applied to the desktop cell. */
  className?: string;
  /** Hide the column on desktop below this breakpoint (it still shows in cards). */
  hideBelow?: 'lg' | 'xl';
  /**
   * Role in the mobile record:
   * - `title`: the bold first line (exactly one column should be the title)
   * - `subtitle`: muted line under the title
   * - `status`: top-right corner (badges)
   * - `field` (default): label/value pair in the grid
   * - `hidden`: omitted on mobile
   */
  mobile?: 'title' | 'subtitle' | 'status' | 'field' | 'hidden';
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  rowActions,
  empty,
  caption,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | null;
  /** Trailing per-row actions (links/buttons). Shown as the last cell / card footer. */
  rowActions?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  caption?: string;
  className?: string;
}) {
  if (rows.length === 0) return <>{empty}</>;

  const titleColumn = columns.find((column) => column.mobile === 'title') ?? columns[0]!;
  const subtitleColumns = columns.filter((column) => column.mobile === 'subtitle');
  const statusColumns = columns.filter((column) => column.mobile === 'status');
  const fieldColumns = columns.filter(
    (column) => column !== titleColumn && (column.mobile ?? 'field') === 'field',
  );

  const hide = (column: Column<T>) =>
    column.hideBelow === 'lg' ? 'hidden lg:table-cell' : column.hideBelow === 'xl' ? 'hidden xl:table-cell' : '';

  return (
    <div className={className}>
      {/* Desktop and tablet: a real table. */}
      <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-card md:block">
        <table className="w-full text-start text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border/80 bg-subtle">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'h-10 whitespace-nowrap px-4 text-[12.5px] font-medium text-muted-foreground first:ps-5',
                    column.align === 'end' ? 'text-end' : 'text-start',
                    hide(column),
                  )}
                >
                  {column.header}
                </th>
              ))}
              {(rowActions || rowHref) && (
                <th scope="col" className="w-px pe-4">
                  <span className="sr-only">Aktionen</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => {
              const href = rowHref?.(row) ?? null;
              return (
                <tr key={rowKey(row)} className="group transition-colors hover:bg-primary-soft/40">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle first:ps-5',
                        column.align === 'end' && 'text-end tabular-nums',
                        column === titleColumn ? 'font-medium text-foreground' : 'text-muted-foreground',
                        hide(column),
                        column.className,
                      )}
                    >
                      {column === titleColumn && href ? (
                        <Link href={href} className="rounded-sm text-foreground underline-offset-4 hover:text-primary hover:underline">
                          {column.cell(row)}
                        </Link>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                  {(rowActions || rowHref) && (
                    <td className="whitespace-nowrap py-2 pe-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {rowActions?.(row)}
                        {href && (
                          <Link
                            href={href}
                            tabIndex={-1}
                            aria-hidden="true"
                            className="grid size-8 place-items-center rounded-md text-muted-foreground/60 transition-colors group-hover:text-primary"
                          >
                            <ChevronRight className="size-4 rtl:rotate-180" />
                          </Link>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: one record per row, same data, no horizontal scroll. */}
      <ul className="space-y-2.5 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const href = rowHref?.(row) ?? null;
          const actions = rowActions?.(row);
          return (
            <li key={rowKey(row)} className="relative rounded-xl border border-border/80 bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-anywhere font-semibold text-foreground">
                    {href ? (
                      <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-['']">
                        {titleColumn.cell(row)}
                      </Link>
                    ) : (
                      titleColumn.cell(row)
                    )}
                  </p>
                  {subtitleColumns.map((column) => (
                    <div key={column.key} className="mt-0.5 text-sm text-muted-foreground">
                      {column.cell(row)}
                    </div>
                  ))}
                </div>
                {statusColumns.length > 0 && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {statusColumns.map((column) => (
                      <div key={column.key}>{column.cell(row)}</div>
                    ))}
                  </div>
                )}
              </div>
              {fieldColumns.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border/70 pt-3 text-sm">
                  {fieldColumns.map((column) => (
                    <div key={column.key} className={cn('min-w-0', column.align === 'end' && 'text-end')}>
                      <dt className="text-xs text-muted-foreground">{column.header}</dt>
                      <dd className="break-anywhere mt-0.5 font-medium text-foreground">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {actions || href ? (
                <div className="relative z-10 mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  {actions}
                  {href && (
                    <Link
                      href={href}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                    >
                      Ansehen <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Filter bar that sits above a DataTable. Collapses to one column on phones. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      className={cn(
        'mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-card p-2.5 shadow-card md:flex md:flex-wrap md:items-center md:gap-2.5 md:p-3 [&>*]:col-span-2 [&>*]:min-w-0 [&>input[type=date]]:col-span-1 sm:[&>select]:col-span-1 md:[&>*]:flex-1 md:[&>button]:flex-none',
        className,
      )}
    >
      {children}
    </form>
  );
}
