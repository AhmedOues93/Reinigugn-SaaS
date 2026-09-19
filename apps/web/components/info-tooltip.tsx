'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@reinigung/ui';

/**
 * The one way optional explanations are offered: a small info button beside a
 * label instead of a permanent paragraph under the control.
 *
 * It is a "toggletip", not a hover-only tooltip, so it works everywhere:
 * - mouse: opens on hover, closes when the pointer leaves
 * - keyboard: opens on focus, toggles with Enter/Space, closes on Escape
 * - touch: opens and closes on tap; a tap elsewhere closes it
 * - screen readers: the button names itself, the content is linked through
 *   `aria-describedby` and announced via a polite live region when opened
 *
 * Never use it for validation errors, legal notices, destructive-action
 * warnings or anything a person needs to complete the form.
 */
export function InfoTooltip({
  content,
  label = 'Mehr Informationen',
  className,
  side = 'top',
}: {
  content: React.ReactNode;
  /** Accessible name of the trigger, e.g. "Info zu Zahlungsziel". */
  label?: string;
  className?: string;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const id = useId();

  const close = useCallback(() => {
    pinned.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <span
      ref={wrapper}
      className={cn('relative inline-flex align-middle', className)}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && !pinned.current && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          pinned.current = !open || !pinned.current;
          setOpen(pinned.current);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned.current && setOpen(false)}
        className="-m-2 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:ring-offset-0 aria-expanded:text-primary"
      >
        <Info className="size-[15px]" aria-hidden="true" />
      </button>
      <span role="status" aria-live="polite">
        {open && (
          <span
            id={id}
            role="tooltip"
            className={cn(
              'absolute -start-3 z-50 w-64 max-w-[min(16rem,calc(100vw-3rem))] animate-fade-in rounded-lg bg-ink px-3.5 py-2.5 text-start text-[13px] font-normal normal-case leading-5 tracking-normal text-ink-foreground shadow-popover',
              side === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-2.5',
            )}
          >
            {content}
          </span>
        )}
      </span>
    </span>
  );
}
