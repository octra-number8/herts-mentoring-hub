import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard, SectionHeading } from "@/components/academy/ui";
import { FilterBar, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/utils";
import { AUDIENCES, LEVELS, PRINCIPLE_OPTIONS } from "@/server/academy/content";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Courses" };

type Search = { pathway?: string; audience?: string; level?: string; principle?: string };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("academy.learn");
  const sp = await searchParams;
  const db = await supabaseServer();

  const [{ data: courses }, { data: pathways }, { data: enrolments }] = await Promise.all([
    db.from("courses").select("id, slug, title, summary, level, principle, audiences, estimated_minutes, is_placeholder_content")
      .not("published_version_id", "is", null).is("archived_at", null).order("title"),
    db.from("pathways").select("id, slug, title, summary, audience, position, pathway_courses(course_id, requirement, position)").eq("published", true).order("position"),
    db.from("enrolments").select("course_id, status").eq("person_id", session.personId).neq("status", "withdrawn"),
  ]);
  const published = new Set((courses ?? []).map((c) => c.id));
  const status = new Map((enrolments ?? []).map((e) => [e.course_id, e.status]));
  const selected = (pathways ?? []).find((p) => p.slug === sp.pathway);
  const pathwayCourses = selected ? new Map((selected.pathway_courses ?? []).map((pc) => [pc.course_id, pc])) : null;
  const ORDER: Record<string, number> = { essential: 0, recommended: 1, optional: 2 };

  const list = (courses ?? [])
    .filter((c) => !pathwayCourses || pathwayCourses.has(c.id))
    .filter((c) => !sp.audience || c.audiences.includes(sp.audience) || c.audiences.includes("all"))
    .filter((c) => !sp.level || c.level === sp.level)
    .filter((c) => !sp.principle || c.principle === sp.principle)
    .sort((a, b) => pathwayCourses
      ? (pathwayCourses.get(a.id)!.position - pathwayCourses.get(b.id)!.position)
      : (ORDER[a.level] ?? 3) - (ORDER[b.level] ?? 3) || a.title.localeCompare(b.title));

  return (
    <>
      <PageHeader title="Courses" description="Short, practical courses for every stage of the mentoring journey. Start anywhere, and go at your own pace." />

      {pathways && pathways.length > 0 && (
        <section aria-labelledby="pathways" className="mb-8">
          <SectionHeading id="pathways" title="Learning pathways" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pathways.map((p) => {
              const ids = (p.pathway_courses ?? []).map((pc) => pc.course_id).filter((id) => published.has(id));
              const finished = ids.filter((id) => status.get(id) === "completed").length;
              const active = selected?.id === p.id;
              return (
                <li key={p.id}>
                  <Link href={active ? "/academy/courses" : `/academy/courses?pathway=${p.slug}`} aria-current={active ? "true" : undefined}
                    className={cn("block h-full rounded-xl border p-4 transition-colors", active ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white hover:border-navy-600")}>
                    <span className={cn("block font-semibold", active ? "text-white" : "text-navy-900")}>{p.title}</span>
                    {p.summary && <span className={cn("mt-1 block text-sm", active ? "text-navy-100" : "text-slate-ink")}>{p.summary}</span>}
                    <span className={cn("mt-2 block text-[13px]", active ? "text-navy-100" : "text-muted")}>
                      {ids.length} {ids.length === 1 ? "course" : "courses"} · {finished} completed{active ? " · showing this pathway" : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <FilterBar resetHref="/academy/courses">
        <FilterSelect name="pathway" label="Pathway" defaultValue={sp.pathway} options={(pathways ?? []).map((p) => ({ value: p.slug, label: p.title }))} />
        <FilterSelect name="audience" label="For" defaultValue={sp.audience} options={AUDIENCES.filter((a) => a.value !== "all")} />
        <FilterSelect name="level" label="Level" defaultValue={sp.level} options={LEVELS} />
        <FilterSelect name="principle" label="Principle" defaultValue={sp.principle} options={PRINCIPLE_OPTIONS} />
      </FilterBar>

      <p className="mb-3 text-sm text-muted">{list.length} {list.length === 1 ? "course" : "courses"}{selected ? ` in the ${selected.title}` : ""}</p>
      {list.length === 0 ? (
        <EmptyState title="No courses match these filters"><Link href="/academy/courses" className="underline">Clear the filters</Link> to see every course.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const pc = pathwayCourses?.get(c.id);
            return (
              <li key={c.id} className="flex">
                <div className="flex w-full flex-col">
                  <CourseCard course={c} status={status.get(c.id)} reason={pc ? (pc.requirement === "essential" ? "Essential in this pathway" : "Optional in this pathway") : undefined} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
