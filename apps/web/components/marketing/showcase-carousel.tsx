'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { showcase } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * Ein Bereich nach dem anderen.
 *
 * Bewusst scroll-snap statt einer Karussell-Bibliothek: Wischen ist auf dem
 * Telefon ohnehin das, was Leute tun, und der Browser macht es fluessiger als
 * jedes JavaScript. Die Knoepfe steuern denselben Scroller, es gibt also keinen
 * zweiten Zustand, der auseinanderlaufen koennte -- die Position wird aus dem
 * Scroller gelesen, nicht mitgezaehlt.
 *
 * Ohne JavaScript bleibt es eine waagerechte Liste, die sich wischen laesst.
 * Das ist der Grund, warum die Reihenfolge im Markup die inhaltliche ist.
 */
export function ShowcaseCarousel() {
  const scroller = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const slide = el.firstElementChild as HTMLElement | null;
    if (!slide) return;
    // Die Breite einer Kachel samt Abstand; daraus ergibt sich, welche vorne steht.
    const step = slide.getBoundingClientRect().width + 16;
    setActive(Math.min(showcase.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    sync();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  const go = (direction: -1 | 1) => {
    const el = scroller.current;
    const slide = el?.firstElementChild as HTMLElement | null;
    if (!el || !slide) return;
    el.scrollBy({ left: direction * (slide.getBoundingClientRect().width + 16), behavior: 'smooth' });
  };

  const jump = (index: number) => {
    const el = scroller.current;
    const slide = el?.firstElementChild as HTMLElement | null;
    if (!el || !slide) return;
    el.scrollTo({ left: index * (slide.getBoundingClientRect().width + 16), behavior: 'smooth' });
  };

  return (
    <Section id="einblick">
      <SectionHeading
        eyebrow="Einblick"
        title="Jeder Bereich, einmal angesehen"
        body="Dieselben Daten, acht Oberflächen – jede auf das zugeschnitten, was dort wirklich gebraucht wird."
      />

      <div
        className="mt-12"
        role="group"
        aria-roledescription="Karussell"
        aria-label="Bereiche von ReinPlan"
      >
        {/*
          Die Kacheln laufen bis an den Rand und darueber hinaus: die negativen
          Raender heben die Polsterung der Section auf, damit die naechste
          Kachel angeschnitten sichtbar ist. Ohne diesen Anschnitt sieht eine
          waagerechte Liste auf dem Telefon aus wie ein einzelnes Bild.
        */}
        <ul
          ref={scroller}
          className={cn(
            '-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-5 pb-2',
            'sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {showcase.map((area, index) => (
            <li
              key={area.id}
              className="w-[85%] shrink-0 snap-start sm:w-[62%] lg:w-[46%]"
              aria-roledescription="Folie"
              aria-label={`${index + 1} von ${showcase.length}: ${area.title}`}
            >
              <figure className="flex h-full min-w-0 flex-col rounded-card border border-border/80 bg-card p-4 shadow-raised sm:p-5">
                {area.frame === 'phone' ? <PhoneFrame area={area} /> : <BrowserFrame area={area} />}
                <figcaption className="mt-4 min-w-0 flex-1">
                  <p className="hyphenate text-[15px] font-semibold text-foreground">{area.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{area.caption}</p>
                  <ul className="mt-3 space-y-1.5">
                    {area.points.map((point) => (
                      <li key={point} className="flex gap-2 text-[13px] leading-5 text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        <span className="break-anywhere">{point}</span>
                      </li>
                    ))}
                  </ul>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-4">
          {/* Punkte: Position und Sprungziel in einem. */}
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {showcase.map((area, index) => (
              <button
                key={area.id}
                type="button"
                onClick={() => jump(index)}
                aria-label={`Zu ${area.title}`}
                aria-current={index === active ? 'true' : undefined}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === active ? 'w-7 bg-primary' : 'w-4 bg-border hover:bg-muted-foreground/40',
                )}
              />
            ))}
          </div>

          <div className="flex shrink-0 gap-2">
            <Arrow direction="prev" onClick={() => go(-1)} disabled={atStart} />
            <Arrow direction="next" onClick={() => go(1)} disabled={atEnd} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Arrow({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Vorheriger Bereich' : 'Nächster Bereich'}
      className={cn(
        'grid size-touch place-items-center rounded-full border border-border/80 bg-card transition-colors',
        'hover:bg-subtle disabled:opacity-35 disabled:hover:bg-card',
      )}
    >
      <Icon className="size-5 rtl:rotate-180" aria-hidden="true" />
    </button>
  );
}

type Area = (typeof showcase)[number];

/** Browserrahmen: drei Punkte und eine Adressleiste, mehr nicht. */
function BrowserFrame({ area }: { area: Area }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="flex items-center gap-2 border-b border-border/70 bg-subtle px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
        <span className="ms-1 h-3.5 min-w-0 flex-1 rounded-full bg-muted" aria-hidden="true" />
      </div>
      <Canvas src={area.src} alt={area.title} className="aspect-[16/10]" />
    </div>
  );
}

/** Telefon: eine gerundete Schale mit Lautsprecherschlitz. */
function PhoneFrame({ area }: { area: Area }) {
  return (
    <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-xl bg-ink">
      <div className="relative w-[46%] overflow-hidden rounded-[1.1rem] border-[5px] border-ink bg-card shadow-raised">
        <span className="absolute inset-x-0 top-1.5 z-10 mx-auto h-1 w-10 rounded-full bg-ink/25" aria-hidden="true" />
        <Canvas src={area.src} alt={area.title} className="aspect-[9/17]" />
      </div>
    </div>
  );
}

/**
 * Das Bild, oder der Platz dafuer. Eine Komponente, damit ein fehlendes Bild
 * die Hoehe des Rahmens niemals aendern kann.
 */
function Canvas({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (src) {
    return (
      <div className={cn('relative w-full bg-subtle', className)}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 85vw, (max-width: 1024px) 62vw, 46vw"
          className="object-cover object-top"
        />
      </div>
    );
  }
  return (
    <div className={cn('grid w-full place-items-center bg-subtle', className)}>
      <div className="px-4 text-center">
        <ImageIcon className="mx-auto size-7 text-muted-foreground/45" aria-hidden="true" />
        <p className="mt-2 text-xs font-medium text-muted-foreground/70">Bildschirmfoto folgt</p>
      </div>
    </div>
  );
}
