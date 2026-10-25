import type { Metadata } from "next";
import { PathwayForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { audienceLabel } from "@/server/academy/content";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { savePathway } from "../actions";

export const metadata: Metadata = { title: "Pathways" };

export default async function PathwaysPage() {
  const session = await requirePermission("academy.publish");
  const db = await supabaseServer();
  const { data: pathways } = await db.from("pathways").select("id, slug, title, summary, audience, position, published, pathway_courses(course_id, requirement)").order("position");
  return (
    <>
      <PageHeader title="Academy" description="Pathways group courses for a role, with essential courses first." actions={<PathwayForm action={savePathway} />} />
      <AcademyAdminTabs session={session} current="pathways" />
      {!pathways?.length ? <EmptyState title="No pathways yet">Create a pathway, then add courses to it.</EmptyState> : (
        <Table caption="Pathways">
          <THead><TH>Pathway</TH><TH>Audience</TH><TH align="right">Courses</TH><TH>Status</TH></THead>
          <TBody>
            {pathways.map((p) => (
              <TR key={p.id}>
                <TD><RowLink href={`/learning/pathways/${p.id}`}>{p.title}</RowLink>{p.summary && <div className="text-[13px] text-muted">{p.summary}</div>}</TD>
                <TD>{audienceLabel(p.audience)}</TD>
                <TD align="right">{p.pathway_courses.length} <span className="text-[13px] text-muted">({p.pathway_courses.filter((c) => c.requirement === "essential").length} essential)</span></TD>
                <TD>{p.published ? <Badge tone="success">Published</Badge> : <Badge>Hidden</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
