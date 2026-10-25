import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddPathwayCourseForm, PathwayForm } from "@/components/academy/admin-forms";
import { LevelBadge } from "@/components/academy/ui";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { audienceLabel } from "@/server/academy/content";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { addPathwayCourse, savePathway, setPathwayPublished, updatePathwayCourse } from "../../actions";

export const metadata: Metadata = { title: "Pathway" };

export default async function PathwayPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("academy.publish");
  const { id } = await params;
  const db = await supabaseServer();
  const { data: pathway } = await db.from("pathways").select("id, slug, title, summary, audience, position, published").eq("id", id).maybeSingle();
  if (!pathway) notFound();
  const [{ data: items }, { data: courses }] = await Promise.all([
    db.from("pathway_courses").select("course_id, requirement, position, courses(title, level, published_version_id)").eq("pathway_id", id).order("position"),
    db.from("courses").select("id, title").is("archived_at", null).order("title"),
  ]);
  const inPathway = new Set((items ?? []).map((i) => i.course_id));
  const available = (courses ?? []).filter((c) => !inPathway.has(c.id)).map((c) => ({ value: c.id, label: c.title }));

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/learning/pathways", label: "Pathways" }]} title={pathway.title} description={pathway.summary}
        meta={<>{pathway.published ? <Badge tone="success">Published</Badge> : <Badge>Hidden from learners</Badge>}<span className="text-sm text-muted">For {audienceLabel(pathway.audience)}</span></>}
        actions={<>
          <PathwayForm action={savePathway} pathway={pathway} />
          <ActionButton action={setPathwayPublished} fields={{ id, published: pathway.published ? "false" : "true" }} variant={pathway.published ? "secondary" : "primary"}>
            {pathway.published ? "Hide from learners" : "Publish pathway"}
          </ActionButton>
        </>} />
      <Panel title="Courses in order" description="Learners see essential courses as their first recommendations." padded={false}>
        {!items?.length ? <div className="p-5"><EmptyState title="No courses yet">Add the first course below.</EmptyState></div> : (
          <ol className="divide-y divide-line">
            {items.map((i, n) => {
              const c = i.courses as unknown as { title: string; level: string; published_version_id: string | null };
              const f = { pathway_id: id, course_id: i.course_id };
              return (
                <li key={i.course_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="font-medium">{n + 1}. {c.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-1.5">
                      <Badge tone={i.requirement === "essential" ? "navy" : "neutral"}>{i.requirement === "essential" ? "Essential" : "Optional"}</Badge>
                      <LevelBadge level={c.level} />
                      {!c.published_version_id && <Badge tone="warning">Not published yet</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <ActionButton action={updatePathwayCourse} fields={{ ...f, dir: "up" }} variant="subtle">Up<span className="sr-only"> {c.title}</span></ActionButton>
                    <ActionButton action={updatePathwayCourse} fields={{ ...f, dir: "down" }} variant="subtle">Down<span className="sr-only"> {c.title}</span></ActionButton>
                    <ActionButton action={updatePathwayCourse} fields={{ ...f, requirement: i.requirement === "essential" ? "optional" : "essential" }} variant="subtle">
                      Make {i.requirement === "essential" ? "optional" : "essential"}
                    </ActionButton>
                    <ActionButton action={updatePathwayCourse} fields={{ ...f, remove: "1" }} variant="subtle" confirm={`Remove "${c.title}" from this pathway?`}>Remove</ActionButton>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="border-t border-line p-5">
          {available.length ? <AddPathwayCourseForm action={addPathwayCourse} pathwayId={id} courses={available} /> : <p className="text-sm text-muted">Every course is already in this pathway.</p>}
        </div>
      </Panel>
    </>
  );
}
