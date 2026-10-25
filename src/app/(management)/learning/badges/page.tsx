import type { Metadata } from "next";
import { BadgeForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { saveBadge } from "../actions";

export const metadata: Metadata = { title: "Badges" };

export default async function BadgesPage() {
  const session = await requirePermission("academy.publish");
  const db = await supabaseServer();
  const [{ data: badges }, { data: courses }, { data: pathways }, { data: awards }] = await Promise.all([
    db.from("badges").select("id, key, name, description, criteria, active").order("name"),
    db.from("courses").select("id, title").order("title"),
    db.from("pathways").select("id, title").order("position"),
    db.from("badge_awards").select("badge_id"),
  ]);
  const courseOpts = (courses ?? []).map((c) => ({ value: c.id, label: c.title }));
  const pathwayOpts = (pathways ?? []).map((p) => ({ value: p.id, label: p.title }));
  const awarded = new Map<string, number>();
  for (const a of awards ?? []) awarded.set(a.badge_id, (awarded.get(a.badge_id) ?? 0) + 1);
  const describe = (c: Record<string, unknown>) =>
    c.course_id ? `Completing ${courseOpts.find((o) => o.value === c.course_id)?.label ?? "a course"}`
    : c.pathway_id ? `Every essential course in the ${pathwayOpts.find((o) => o.value === c.pathway_id)?.label ?? "pathway"}`
    : c.courses_completed ? `Completing ${c.courses_completed} ${Number(c.courses_completed) === 1 ? "course" : "courses"}` : "Not set";

  return (
    <>
      <PageHeader title="Academy" description="Badges are awarded automatically when a learner completes a course and meets the criteria."
        actions={<BadgeForm action={saveBadge} courses={courseOpts} pathways={pathwayOpts} />} />
      <AcademyAdminTabs session={session} current="badges" />
      {!badges?.length ? <EmptyState title="No badges yet" /> : (
        <Table caption="Badges">
          <THead><TH>Badge</TH><TH>Awarded for</TH><TH align="right">Awarded</TH><TH>Status</TH><TH /></THead>
          <TBody>
            {badges.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name}<div className="text-[13px] font-normal text-muted">{b.description}</div></TD>
                <TD>{describe(b.criteria as Record<string, unknown>)}</TD>
                <TD align="right">{awarded.get(b.id) ?? 0}</TD>
                <TD>{b.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD><BadgeForm action={saveBadge} badge={{ ...b, criteria: b.criteria as Record<string, unknown> }} courses={courseOpts} pathways={pathwayOpts} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
