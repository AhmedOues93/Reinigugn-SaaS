import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { screenshots } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * Product screenshots in device frames.
 *
 * The frames are drawn rather than imported as images, so a screenshot can be
 * replaced by dropping a file into `public/marketing/` and setting `src` in the
 * content module — no new asset, no re-export of a mockup. Each frame reserves
 * its aspect ratio whether or not the capture exists yet, so the section looks
 * finished before the pictures do and does not jump when they arrive.
 */
export function Screenshots() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Einblick"
        title="So sieht die tägliche Arbeit aus"
        body="Dieselben Daten, drei Oberflächen – jede auf das zugeschnitten, was dort wirklich gebraucht wird."
      />

      <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-center lg:gap-8">
        {screenshots.map((shot) => (
          <figure key={shot.id} className="min-w-0">
            {shot.frame === 'phone' ? <PhoneFrame shot={shot} /> : <BrowserFrame shot={shot} />}
            <figcaption className="mt-4">
              <p className="text-[15px] font-semibold text-foreground">{shot.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{shot.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

type Shot = (typeof screenshots)[number];

/** A browser chrome: three dots and an address strip, nothing more. */
function BrowserFrame({ shot }: { shot: Shot }) {
  return (
    <div className="overflow-hidden rounded-card border border-border/80 bg-card shadow-raised">
      <div className="flex items-center gap-2 border-b border-border/70 bg-subtle px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="ms-1 h-4 min-w-0 flex-1 rounded-full bg-muted" aria-hidden="true" />
      </div>
      <Canvas src={shot.src} alt={shot.title} className="aspect-[16/10]" />
    </div>
  );
}

/** A phone: one rounded shell with a speaker slot. */
function PhoneFrame({ shot }: { shot: Shot }) {
  return (
    <div className="mx-auto w-full max-w-[13.5rem] overflow-hidden rounded-[2rem] border-[6px] border-ink bg-ink shadow-raised lg:w-[13.5rem]">
      <div className="relative overflow-hidden rounded-[1.5rem] bg-card">
        <span className="absolute inset-x-0 top-2 z-10 mx-auto h-1.5 w-16 rounded-full bg-ink/25" aria-hidden="true" />
        <Canvas src={shot.src} alt={shot.title} className="aspect-[9/17]" />
      </div>
    </div>
  );
}

/**
 * The picture, or the space reserved for it. One component so a missing
 * screenshot can never change the height of the frame around it.
 */
function Canvas({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (src) {
    return (
      <div className={cn('relative w-full bg-subtle', className)}>
        <Image src={src} alt={alt} fill sizes="(max-width: 1024px) 100vw, 380px" className="object-cover object-top" />
      </div>
    );
  }
  return (
    <div className={cn('grid w-full place-items-center bg-subtle', className)}>
      <div className="px-4 text-center">
        <ImageIcon className="mx-auto size-7 text-muted-foreground/45" aria-hidden="true" />
        <p className="mt-2 text-xs font-medium text-muted-foreground/70">Screenshot folgt</p>
      </div>
    </div>
  );
}
