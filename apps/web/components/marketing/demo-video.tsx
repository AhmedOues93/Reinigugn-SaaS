import { Play } from 'lucide-react';
import { demo } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * The demo film.
 *
 * Until `demo.videoUrl` is set this renders a frame of the right shape rather
 * than a grey box: the 16:9 area is reserved, so dropping the real embed in
 * later moves nothing on the page and costs no layout shift. The placeholder
 * says plainly that the film is still coming — a play button that does nothing
 * is worse than an honest caption.
 */
export function DemoVideo() {
  return (
    <Section id="demo" tone="ink">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">
        <SectionHeading eyebrow={demo.eyebrow} title={demo.title} body={demo.body} tone="ink" />

        <div className="mx-auto mt-12 w-full max-w-[56rem]">
          <div className="relative aspect-video overflow-hidden rounded-[1.25rem] border border-white/12 bg-[#071d24]/70 shadow-glass">
            {demo.videoUrl ? (
              <iframe
                src={demo.videoUrl}
                title={demo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 size-full"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto grid size-16 place-items-center rounded-full border border-highlight/30 bg-highlight/10 text-highlight">
                    <Play className="size-6 translate-x-0.5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-medium text-white/70">{demo.posterCaption}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
