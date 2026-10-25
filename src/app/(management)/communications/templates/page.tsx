import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  await requirePermission("comms.templates");
  const db = await supabaseServer();
  const { data: templates } = await db.from("email_templates").select("id, key, name, kind, subject, is_system, updated_at").order("kind").order("name");
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/communications", label: "Communications" }]} title="Email templates"
        description="System templates are the wording of automatic emails such as booking confirmations. Campaign templates are starting points for campaigns."
        actions={<LinkButton href="/communications/templates/new" variant="primary">New campaign template</LinkButton>} />
      {!templates?.length ? <EmptyState title="No templates yet" /> : (
        <Table caption="Email templates">
          <THead><TH>Template</TH><TH>Type</TH><TH className="hidden md:table-cell">Subject</TH><TH className="hidden lg:table-cell">Last changed</TH></THead>
          <TBody>
            {templates.map((t) => (
              <TR key={t.id}>
                <TD><RowLink href={`/communications/templates/${t.id}`}>{t.name}</RowLink><div className="font-mono text-[12px] text-muted">{t.key}</div></TD>
                <TD>{t.kind === "transactional" ? "Automatic email" : "Campaign"}{t.is_system && <> <Badge tone="navy">System</Badge></>}</TD>
                <TD className="hidden md:table-cell">{t.subject}</TD>
                <TD className="hidden lg:table-cell">{formatDateTime(t.updated_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
