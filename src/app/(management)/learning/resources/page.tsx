import type { Metadata } from "next";
import { SolomonForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { deleteSolomonLink, saveSolomonLink } from "../actions";

export const metadata: Metadata = { title: "Solomon links" };

export default async function SolomonLinksPage() {
  const session = await requirePermission("academy.publish");
  const db = await supabaseServer();
  const [{ data: links }, { data: courses }, { data: pathways }] = await Promise.all([
    db.from("solomon_resources").select("id, title, url, description, pathway_id, course_id, topics, position").order("position").order("title"),
    db.from("courses").select("id, title").order("title"),
    db.from("pathways").select("id, title").order("position"),
  ]);
  const courseOpts = (courses ?? []).map((c) => ({ value: c.id, label: c.title }));
  const pathwayOpts = (pathways ?? []).map((p) => ({ value: p.id, label: p.title }));
  return (
    <>
      <PageHeader title="Academy" description="Links to Solomon learning mapped to Hertfordshire pathways and courses. Links only: Solomon content is never copied into the Hub."
        actions={<SolomonForm action={saveSolomonLink} courses={courseOpts} pathways={pathwayOpts} />} />
      <AcademyAdminTabs session={session} current="resources" />
      {!links?.length ? <EmptyState title="No Solomon links yet">Add links so learners can find relevant Solomon modules from their courses.</EmptyState> : (
        <Table caption="Solomon links">
          <THead><TH>Link</TH><TH className="hidden md:table-cell">Mapped to</TH><TH /></THead>
          <TBody>
            {links.map((l) => (
              <TR key={l.id}>
                <TD><a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 underline">{l.title}</a>{l.description && <div className="text-[13px] text-muted">{l.description}</div>}</TD>
                <TD className="hidden text-sm md:table-cell">
                  {[pathwayOpts.find((p) => p.value === l.pathway_id)?.label, courseOpts.find((c) => c.value === l.course_id)?.label].filter(Boolean).join(" · ") || <span className="text-muted">Not mapped</span>}
                  {l.topics.length > 0 && <div className="text-[13px] text-muted">{l.topics.join(", ")}</div>}
                </TD>
                <TD><span className="flex gap-1"><SolomonForm action={saveSolomonLink} link={l} courses={courseOpts} pathways={pathwayOpts} /><ActionButton action={deleteSolomonLink} fields={{ id: l.id }} variant="subtle" confirm={`Remove the link "${l.title}"?`}>Remove</ActionButton></span></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
