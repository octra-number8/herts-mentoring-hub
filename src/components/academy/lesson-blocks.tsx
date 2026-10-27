import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { PRINCIPLES, videoEmbed, type Block } from "@/server/academy/content";
import { ExternalVideo } from "./video-embed";

/** The four Hertfordshire principles, always in canonical order. */
export function PrinciplesPanel({ intro }: { intro?: string }) {
  return (
    <section aria-label="The four principles" className="rounded-xl border border-teal-100 bg-teal-50 p-5">
      <p className="text-sm font-semibold text-teal-800">Prepare · Guide · Support · Enlighten</p>
      {intro && <p className="mt-1 text-sm text-slate-ink">{intro}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <li key={p.key} className="rounded-lg bg-white p-3">
            <span className="block font-semibold text-navy-900">{p.label}</span>
            <span className="text-sm text-slate-ink">{p.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-muted">The principles are not stages: they apply throughout a Brother&apos;s journey.</p>
    </section>
  );
}

const CALLOUT = {
  info: "border-navy-100 bg-navy-50 text-navy-900",
  tip: "border-teal-100 bg-teal-50 text-teal-800",
  important: "border-warning-800/20 bg-warning-50 text-warning-800",
};
const CALLOUT_LABEL = { info: "Note", tip: "Tip", important: "Important" };

export function LessonBlock({ block, media }: { block: Block; media: Record<string, string> }) {
  switch (block.type) {
    case "text":
      return <div className="prose-hub max-w-none text-[16px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown) }} />;
    case "callout": {
      const tone = block.tone ?? "info";
      return (
        <aside className={cn("rounded-lg border px-4 py-3 text-[15px]", CALLOUT[tone])}>
          <span className="sr-only">{CALLOUT_LABEL[tone]}: </span>
          {block.text}
        </aside>
      );
    }
    case "image": {
      const src = media[block.path];
      return (
        <figure>
          {src ? (
            // Signed, short-lived URL from a private bucket: not suited to next/image optimisation.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={block.alt} className="w-full rounded-lg border border-line" loading="lazy" />
          ) : <div className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">This image is not available.</div>}
          {block.caption && <figcaption className="mt-1.5 text-[13px] text-muted">{block.caption}</figcaption>}
        </figure>
      );
    }
    case "video": {
      const v = videoEmbed(block.url);
      if (!v) return <p className="text-sm text-muted">This video cannot be shown here. <a className="underline" href={block.url} rel="noopener noreferrer" target="_blank">Open {block.title}</a></p>;
      return (
        <figure>
          <div className="aspect-video overflow-hidden rounded-lg border border-line bg-navy-950">
            {v.kind === "mp4" ? (
              <video controls preload="metadata" className="h-full w-full" title={block.title}><source src={v.src} type="video/mp4" /></video>
            ) : (
              <ExternalVideo src={v.src} title={block.title} provider={v.kind} />
            )}
          </div>
          <figcaption className="mt-1.5 text-[13px] text-muted">{block.title}</figcaption>
        </figure>
      );
    }
    case "principles":
      return <PrinciplesPanel intro={block.intro} />;
    case "resource": {
      const href = block.path ? media[block.path] : block.url;
      return (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-navy-900">{block.title}</p>
            {block.description && <p className="text-sm text-muted">{block.description}</p>}
          </div>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 font-medium text-navy-800 hover:border-navy-600">
              {block.path ? "Download" : "Open"}<span className="sr-only"> {block.title}</span>
            </a>
          ) : <span className="text-sm text-muted">Not available</span>}
        </div>
      );
    }
  }
}

export function LessonBlocks({ blocks, media }: { blocks: Block[]; media: Record<string, string> }) {
  if (!blocks.length) return null;
  return <div className="space-y-6">{blocks.map((b, i) => <LessonBlock key={i} block={b} media={media} />)}</div>;
}
