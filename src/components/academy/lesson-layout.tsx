import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lessonKindLabel, minutesLabel } from "@/server/academy/content";
import type { OutlineModule } from "@/server/academy/queries";
import { ProgressBar } from "./ui";

/** Course contents with completion ticks. Used in the lesson player sidebar. */
export function CourseContents({ outline, completed, currentId, href }: {
  outline: OutlineModule[]; completed: Set<string>; currentId: string; href: (lessonId: string) => string;
}) {
  return (
    <ol className="space-y-4">
      {outline.map((m, mi) => {
        const done = m.lessons.filter((l) => completed.has(l.id)).length;
        return (
          <li key={m.id}>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Module {mi + 1}</p>
            <p className="font-medium text-navy-900">{m.title}</p>
            <p className="mb-1.5 text-[13px] text-muted">{done} of {m.lessons.length} complete</p>
            <ol className="space-y-0.5">
              {m.lessons.map((l) => {
                const isDone = completed.has(l.id);
                const current = l.id === currentId;
                return (
                  <li key={l.id}>
                    <Link href={href(l.id)} aria-current={current ? "page" : undefined}
                      className={cn("flex items-start gap-2 rounded-md px-2 py-1.5 text-sm", current ? "bg-navy-50 font-semibold text-navy-900" : "text-slate-ink hover:bg-navy-50")}>
                      <span aria-hidden className={cn("mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        isDone ? "border-teal-700 bg-teal-700 text-white" : "border-line bg-white")}>{isDone ? "✓" : ""}</span>
                      <span className="min-w-0">
                        {l.title}
                        <span className="sr-only">{isDone ? " (completed)" : " (not yet completed)"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

export function LessonFrame({ courseTitle, courseHref, outline, completed, lesson, moduleTitle, href, prevId, nextId, children, banner, notice }: {
  courseTitle: string; courseHref: string; outline: OutlineModule[]; completed: Set<string>;
  lesson: { id: string; title: string; kind: string; estimated_minutes: number | null; required: boolean };
  moduleTitle: string; href: (id: string) => string; prevId?: string; nextId?: string; children: React.ReactNode;
  banner?: React.ReactNode; notice?: React.ReactNode;
}) {
  const total = outline.reduce((n, m) => n + m.lessons.length, 0);
  const done = outline.reduce((n, m) => n + m.lessons.filter((l) => completed.has(l.id)).length, 0);
  const pct = total ? (100 * done) / total : 0;
  const contents = <CourseContents outline={outline} completed={completed} currentId={lesson.id} href={href} />;
  return (
    <div>
      {banner}
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href={courseHref} className="hover:text-navy-800 hover:underline">{courseTitle}</Link>
        <span aria-hidden> / </span><span>{moduleTitle}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1" aria-label="Course contents">
          <div className="lg:sticky lg:top-4">
            <ProgressBar value={pct} label="Course progress" />
            <details className="mt-3 rounded-lg border border-line bg-white p-3 lg:hidden">
              <summary className="cursor-pointer font-medium text-navy-800">Course contents</summary>
              <div className="mt-3">{contents}</div>
            </details>
            <div className="mt-4 hidden lg:block">{contents}</div>
          </div>
        </aside>
        <article className="order-1 min-w-0 lg:order-2">
          <header className="mb-6">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span className="font-medium uppercase tracking-wide text-teal-800">{lessonKindLabel(lesson.kind)}</span>
              {lesson.estimated_minutes ? <span>· {minutesLabel(lesson.estimated_minutes)}</span> : null}
              {!lesson.required && <Badge>Optional</Badge>}
              {completed.has(lesson.id) && <Badge tone="success">Completed</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-navy-900 text-balance sm:text-[28px]">{lesson.title}</h1>
          </header>
          {notice}
          <div className="space-y-8">{children}</div>
          <nav aria-label="Lesson navigation" className="mt-10 flex flex-wrap justify-between gap-3 border-t border-line pt-5">
            {prevId ? <Link href={href(prevId)} className={buttonClass("secondary")} rel="prev">Previous lesson</Link> : <span />}
            {nextId ? <Link href={href(nextId)} className={buttonClass("secondary")} rel="next">Next lesson</Link> : <Link href={courseHref} className={buttonClass("secondary")}>Course overview</Link>}
          </nav>
        </article>
      </div>
    </div>
  );
}
