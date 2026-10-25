import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/layout";
import { interpolate } from "@/lib/markdown";
import { formatDateTime } from "@/lib/utils";
import { renderEmail } from "@/server/email/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { EmailPreview } from "../../[id]/campaign-forms";
import { DeleteTemplate, TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Template" };

const SAMPLE: Record<string, string> = {
  first_name: "Thomas", name: "Bro Thomas Example", org_short: "Herts", event_title: "Mentoring Skills Workshop", event_date: "12 Nov 2026, 19:00",
  course_title: "Your First Steps", link: "https://example.org/academy", period: "daily", items: "- **Task due today**: Call the Lodge Mentor", subject: "Sample subject",
};

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("comms.templates");
  const { id } = await params;
  const db = await supabaseServer();
  const { data: t } = await db.from("email_templates").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const placeholders = [...new Set([...`${t.subject} ${t.body_markdown}`.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1]))];
  const { html, text } = renderEmail({ orgName: session.org.name, subject: interpolate(t.subject, SAMPLE, { escape: false }), markdown: interpolate(t.body_markdown, SAMPLE),
    unsubscribeUrl: t.kind === "campaign" ? "#unsubscribe-link" : null });
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/communications", label: "Communications" }, { href: "/communications/templates", label: "Templates" }]} title={t.name}
        meta={<><span className="font-mono text-[13px] text-muted">{t.key}</span>{t.is_system && <Badge tone="navy">System</Badge>}<span className="text-sm text-muted">Last changed {formatDateTime(t.updated_at)}</span></>}
        actions={!t.is_system ? <DeleteTemplate id={t.id} /> : undefined} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Wording" description={t.is_system ? "Used by the Hub for automatic emails. Keep the placeholders so the details are filled in." : undefined}>
          <TemplateForm t={t} placeholders={placeholders.length ? placeholders : ["first_name", "name"]} />
        </Panel>
        <Panel title="Preview" description="With sample details. Save to update the preview.">
          <EmailPreview html={html} text={text} />
        </Panel>
      </div>
    </>
  );
}
