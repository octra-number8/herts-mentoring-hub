import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, label } from "@/lib/utils";
import { minutesLabel } from "@/server/academy/content";

/** Accessible progress bar with a visible percentage. */
export function ProgressBar({ value, label: text, className, size = "md" }: { value: number; label?: string; className?: string; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={text ?? "Progress"}
        className={cn("flex-1 overflow-hidden rounded-full bg-navy-100", size === "sm" ? "h-1.5" : "h-2.5")}>
        <div className="h-full rounded-full bg-teal-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-muted">{pct}%</span>
    </div>
  );
}

/** Discreet notice on courses whose content is still placeholder material. */
export function PlaceholderNotice({ compact }: { compact?: boolean }) {
  if (compact) return <Badge tone="neutral">Sample content</Badge>;
  return (
    <p className="rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-muted">
      Sample content: this course shows how the Academy works. Approved Hertfordshire material will replace it.
    </p>
  );
}

export function LevelBadge({ level }: { level: string }) {
  return <Badge tone={level === "essential" ? "navy" : level === "recommended" ? "teal" : "neutral"}>{label(level)}</Badge>;
}

/** Colour tone for each principle, so tiles can be told apart at a glance. */
const PRINCIPLE_TONES: Record<string, { text: string; tile: string; bar: string }> = {
  prepare: { text: "text-prepare", tile: "border-prepare-line bg-prepare-wash", bar: "bg-prepare" },
  guide: { text: "text-guide", tile: "border-guide-line bg-guide-wash", bar: "bg-guide" },
  support: { text: "text-support", tile: "border-support-line bg-support-wash", bar: "bg-support" },
  enlighten: { text: "text-enlighten", tile: "border-enlighten-line bg-enlighten-wash", bar: "bg-enlighten" },
};

export function PrincipleTag({ principle }: { principle: string | null }) {
  if (!principle) return null;
  return <span className={cn("text-[13px] font-semibold uppercase tracking-wide", PRINCIPLE_TONES[principle]?.text ?? "text-teal-800")}>{label(principle)}</span>;
}

export type CourseCardData = {
  slug: string; title: string; summary: string; level: string; principle: string | null; estimated_minutes: number | null;
  is_placeholder_content: boolean;
};

/** A course tile for the dashboard and catalogue. */
export function CourseCard({ course, progress, status, reason, footer }: {
  course: CourseCardData; progress?: number; status?: string; reason?: string; footer?: React.ReactNode;
}) {
  const tone = course.principle ? PRINCIPLE_TONES[course.principle] : undefined;
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-xl border p-5 transition-colors focus-within:border-navy-600 hover:border-navy-600", tone?.tile ?? "border-line bg-surface")}>
      {tone && <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", tone.bar)} />}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <PrincipleTag principle={course.principle} />
        <span className="ml-auto flex flex-wrap gap-1.5">
          {course.is_placeholder_content && <PlaceholderNotice compact />}
          <LevelBadge level={course.level} />
        </span>
      </div>
      <h3 className="text-[17px] font-semibold leading-snug text-navy-900">
        <Link href={`/academy/courses/${course.slug}`} className="after:absolute after:inset-0 focus:outline-none">{course.title}</Link>
      </h3>
      {course.summary && <p className="mt-1.5 line-clamp-3 text-sm text-slate-ink">{course.summary}</p>}
      {reason && <p className="mt-2 text-[13px] font-medium text-teal-800">{reason}</p>}
      <div className="mt-auto pt-4">
        {progress !== undefined && status !== "completed" && <ProgressBar value={progress} size="sm" label={`${course.title} progress`} />}
        <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
          <span>{minutesLabel(course.estimated_minutes)}</span>
          {status === "completed" ? <Badge tone="success">Completed</Badge> : status ? <span>{status === "enrolled" ? "Not started" : "In progress"}</span> : null}
        </div>
        {footer}
      </div>
    </article>
  );
}

/** A friendly section heading for the learner pages. */
export function SectionHeading({ title, action, id }: { title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold text-navy-900">{title}</h2>
      {action}
    </div>
  );
}
