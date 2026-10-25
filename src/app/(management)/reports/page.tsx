import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { formatDate, label } from "@/lib/utils";
import { getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";
import "@/server/reports/datasets-reports";
import { STANDARD_REPORTS } from "@/server/reports/standard";
import { can, canAny, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requirePermission("reports.read", "reports.quarterly");
  const db = await supabaseServer();
  const canRead = can(session, "reports.read");
  const { data: saved } = canRead
    ? await db.from("saved_reports").select("id, name, dataset, shared, schedule, owner_account_id, created_at").order("name")
    : { data: [] };
  const reports = canRead ? STANDARD_REPORTS.filter((r) => canAny(session, r.permission)) : [];
  const sections = [...new Set(reports.map((r) => r.section))];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Standard reports, your saved reports and the quarterly report. Every figure respects what your role may see."
        actions={canRead ? <LinkButton href="/reports/builder" variant="primary">Build a report</LinkButton> : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {sections.map((s) => (
            <Panel key={s} title={s} padded={false}>
              <ul className="divide-y divide-line">
                {reports.filter((r) => r.section === s).map((r) => (
                  <li key={r.key} className="px-5 py-3">
                    <Link href={`/reports/${r.key}`} className="font-medium text-navy-800 hover:underline">{r.title}</Link>
                    <p className="text-sm text-muted">{getDataset(r.key)?.description}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
          {!canRead && <EmptyState title="Standard reports are not part of your role">You can work on the quarterly report.</EmptyState>}
        </div>
        <div className="space-y-6">
          {can(session, "reports.quarterly") && (
            <Panel title="Quarterly report" actions={<LinkButton href="/reports/quarterly" size="sm">Open</LinkButton>}>
              <p className="text-sm text-muted">Generate, review, approve and publish the Provincial quarterly report from a frozen snapshot of the figures.</p>
            </Panel>
          )}
          {canRead && (
            <Panel title="Saved reports" padded={false}>
              {saved?.length ? (
                <ul className="divide-y divide-line">
                  {saved.map((r) => (
                    <li key={r.id} className="px-5 py-3 text-sm">
                      <Link href={`/reports/builder?saved=${r.id}`} className="font-medium text-navy-800 hover:underline">{r.name}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted">
                        <span>{getDataset(r.dataset)?.label ?? label(r.dataset)}</span>
                        {r.owner_account_id !== session.accountId && <Badge tone="navy">Shared with you</Badge>}
                        {r.shared && r.owner_account_id === session.accountId && <Badge tone="teal">Shared</Badge>}
                        {r.schedule !== "none" && <Badge>{label(r.schedule)} email</Badge>}
                        <span>{formatDate(r.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5"><EmptyState title="No saved reports yet"><Link href="/reports/builder" className="underline">Build a report</Link> and save it to find it here.</EmptyState></div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
