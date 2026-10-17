'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Receipt, Search, Users, X } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { searchEntities, type SearchHit, type SearchResults } from '@/app/dashboard/search-action';
import { t, type Locale } from '@/lib/i18n';

const emptyResults: SearchResults = { customers: [], objects: [], invoices: [] };

/**
 * Search across customers, objects and invoice numbers.
 *
 * A combobox rather than a form: results appear as you type and Enter opens the
 * highlighted one, because the thing an office is looking for is almost always
 * a record rather than a results page. Arrow keys move through the list, Escape
 * closes it, and the field keeps focus throughout, so it can be driven entirely
 * from the keyboard.
 *
 * The query runs on the server. Nothing about which company a record belongs to
 * is decided here.
 */
export function GlobalSearch({ locale, className }: { locale: Locale; className?: string }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();

  const groups = [
    { key: 'customers', label: t(locale, 'search.groupCustomers'), icon: Users, hits: results.customers },
    { key: 'objects', label: t(locale, 'search.groupObjects'), icon: Building2, hits: results.objects },
    { key: 'invoices', label: t(locale, 'search.groupInvoices'), icon: Receipt, hits: results.invoices },
  ].filter((group) => group.hits.length > 0);
  const flat: SearchHit[] = groups.flatMap((group) => group.hits);

  // Debounced so a five-letter customer name is one query, not five.
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults(emptyResults);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const next = await searchEntities(term);
        setResults(next);
        setActive(0);
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [term]);

  // Close when the focus or the pointer leaves the whole control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Ctrl/⌘-K from anywhere, the shortcut the field advertises.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setTerm('');
    setResults(emptyResults);
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!flat.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(flat[active] ?? flat[0]);
    }
  };

  const showPanel = open && term.trim().length > 0;
  let cursor = -1;

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={t(locale, 'search.label')}
        placeholder={t(locale, 'search.placeholder')}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="min-h-10 w-full rounded-lg border border-input bg-card px-9 text-sm shadow-[inset_0_1px_1px_0_rgb(15_31_33/0.04)] transition-[border-color,box-shadow] placeholder:text-muted-foreground/75 hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {term ? (
        <button
          type="button"
          onClick={() => {
            setTerm('');
            setResults(emptyResults);
            inputRef.current?.focus();
          }}
          aria-label={t(locale, 'common.close')}
          className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground lg:block">
          ⌘K
        </kbd>
      )}

      {showPanel && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-popover">
          {term.trim().length < 2 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t(locale, 'search.hint')}</p>
          ) : pending && flat.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t(locale, 'search.searching')}
            </p>
          ) : flat.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t(locale, 'search.empty')}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={t(locale, 'search.label')} className="max-h-[22rem] overflow-y-auto py-1">
              {groups.map((group) => (
                <li key={group.key} role="presentation">
                  <p className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {group.label}
                  </p>
                  <ul role="presentation">
                    {group.hits.map((hit) => {
                      cursor += 1;
                      const index = cursor;
                      return (
                        <li key={hit.id} role="option" aria-selected={index === active}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(index)}
                            onClick={() => go(hit)}
                            className={cn(
                              'flex w-full items-center gap-3 px-4 py-2 text-start transition-colors',
                              index === active ? 'bg-primary-soft/60' : 'hover:bg-subtle',
                            )}
                          >
                            <group.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{hit.label}</span>
                              {hit.detail && (
                                <span className="block truncate text-xs text-muted-foreground">{hit.detail}</span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
