import type { Metadata } from "next";
import Link from "next/link";
import { AspirationsForm, PlanItemForm } from "@/components/academy/learner-forms";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { formatDate } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { addPlanItem, deletePlanItem, saveAspirations, updatePlanItem } from "../actions";

export const metadata: Metadata = { title: "My Development Plan" };

const KIND: Record<string, string> = { course: "Academy course", event: "Training event", external: "Learning elsewhere", reading: "Reading", other: "Other" };
const STATUS: Record<string, { label: string; tone: "navy" | "teal" | "success" | "neutral" }> = {
  planned: { label: "Planned", tone: "navy" }, in_progress: { label: "In progress", tone: "teal" }, done: { label: "Done", tone: "success" }, dropped: { label: "No longer planned", tone: "neutral" },
};

export default async function PlanPage() {
  const session = await requirePermission("academy.learn");
  const db = await supabaseServer();
  const [{ data: plan }, { data: courses }] = await Promise.all([
    db.from("development_plans").select("id, aspirations, updated_at, development_plan_items(id, title, kind, course_id, target_on, status, notes, position, courses(slug, title))")
      .eq("person_id", session.personId).maybeSingle(),
    db.from("courses").select("id, title").not("published_version_id", "is", null).is("archived_at", null).order("title"),
  ]);
  const order = { in_progress: 0, planned: 1, done: 2, dropped: 3 } as Record<string, number>;
  const items = (plan?.development_plan_items ?? []).slice()
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.target_on ?? "9999").localeCompare(b.target_on ?? "9999"));

  return (
    <>
      <PageHeader title="My Development Plan" description="Where you would like to grow, and the steps you will take. Keep it simple: it is for you." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="My aspirations" className="lg:col-span-1">
          <AspirationsForm action={saveAspirations} aspirations={plan?.aspirations ?? null} />
          {plan?.updated_at && <p className="mt-3 text-[13px] text-muted">Last updated {formatDate(plan.updated_at)}</p>}
        </Panel>
        <Panel title="Steps" className="lg:col-span-2" actions={<PlanItemForm action={addPlanItem} courses={courses ?? []} />} padded={!items.length}>
          {items.length === 0 ? (
            <EmptyState title="No steps yet">Add a course, a training event, some reading, or anything else that will help. <Link className="underline" href="/academy/courses">Browse courses</Link> for ideas.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((i) => {
                const course = i.courses as unknown as { slug: string; title: string } | null;
                const s = STATUS[i.status] ?? STATUS.planned!;
                return (
                  <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className={i.status === "dropped" ? "font-medium text-muted line-through" : "font-medium text-ink"}>{i.title}</p>
                      <p className="text-[13px] text-muted">
                        {KIND[i.kind]}{course ? <> · <Link className="underline" href={`/academy/courses/${course.slug}`}>{course.title}</Link></> : null}
                        {i.target_on ? ` · target ${formatDate(i.target_on)}` : ""}
                      </p>
                      {i.notes && <p className="mt-1 text-sm text-slate-ink">{i.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <PlanItemForm action={updatePlanItem} item={i} courses={courses ?? []} />
                      <ActionButton action={deletePlanItem} fields={{ id: i.id }} variant="subtle" confirm={`Remove "${i.title}" from your plan?`}>Remove</ActionButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
