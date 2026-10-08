import Image from 'next/image';
import { Play } from 'lucide-react';
import { demo } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * The demo film.
 *
 * Drei Zustaende, in dieser Reihenfolge: eine selbst gehostete Datei, eine
 * Einbettung, oder -- solange es beides nicht gibt -- ein abgedunkeltes
 * Standbild mit ehrlicher Bildunterschrift. Die 16:9-Flaeche ist immer
 * reserviert, der Film kann also spaeter dazukommen, ohne dass sich auf der
 * Seite etwas verschiebt. Ein Abspielknopf, der nichts tut, waere schlechter
 * als eine klare Ansage.
 */
export function DemoVideo() {
  return (
    <Section id="demo" tone="ink">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">
        <SectionHeading eyebrow={demo.eyebrow} title={demo.title} body={demo.body} tone="ink" />

        <div className="mx-auto mt-12 w-full max-w-[56rem]">
          <div className="relative aspect-video overflow-hidden rounded-[1.25rem] border border-white/12 bg-[#071d24]/70 shadow-glass">
            {demo.videoFile ? (
              /*
                Die eigene Datei bekommt den Vorrang: kein fremder Player, kein
                Cookie, kein Hinweis im Consent-Banner. `preload="none"` laedt
                erst beim Abspielen -- eine Landingpage darf keine zweistellige
                Megabyte-Zahl ziehen, nur weil unten ein Film liegt.
              */
              <video
                controls
                preload="none"
                playsInline
                poster={demo.poster ?? undefined}
                className="absolute inset-0 size-full bg-black object-cover"
              >
                <source src={demo.videoFile} type="video/mp4" />
                Ihr Browser kann dieses Video nicht abspielen.
              </video>
            ) : demo.videoUrl ? (
              <iframe
                src={demo.videoUrl}
                title={demo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 size-full"
              />
            ) : (
              <>
                {/*
                  Bis der Film da ist steht ein echtes Standbild im Rahmen,
                  abgedunkelt, damit die Schrift darauf lesbar bleibt. Das
                  reserviert nicht nur die Flaeche, es zeigt auch schon, worum
                  es geht.
                */}
                {demo.poster && (
                  <Image
                    src={demo.poster}
                    alt=""
                    fill
                    sizes="(max-width: 896px) 100vw, 896px"
                    className="object-cover opacity-45"
                  />
                )}
                <div className="absolute inset-0 grid place-items-center bg-ink/45 px-6 text-center">
                  <div>
                    <span className="mx-auto grid size-16 place-items-center rounded-full border border-highlight/30 bg-highlight/10 text-highlight">
                      <Play className="size-6 translate-x-0.5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-sm font-medium text-white/80">{demo.posterCaption}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
