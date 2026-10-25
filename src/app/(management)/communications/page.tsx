import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { CAMPAIGN_STATUS, SCOPE_LABEL, categoryLabel } from "./labels";
import { NewCampaign } from "./new-campaign";

export const metadata: Metadata = { title: "Communications" };

const FILTERS: Record<string, string[] | null> = {
  all: null, drafts: ["draft"], pending: ["pending_approval"], scheduled: ["approved", "scheduled", "sending"], sent: ["sent"], cancelled: ["cancelled", "failed"],
};

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requirePermission("comms.use");
  const sp = await searchParams;
  const status = sp.status && sp.status in FILTERS ? sp.status : "all";
  const db = await supabaseServer();
  let q = db.from("campaigns").select("id, title, subject, status, scope, category, recipient_count, created_at, sent_at, scheduled_for, created_by, user_accounts!campaigns_created_by_fkey(persons(display_name))")
    .order("created_at", { ascending: false }).limit(200);
  if (FILTERS[status]) q = q.in("status", FILTERS[status]!);
  const [{ data: campaigns }, { count: pending }] = await Promise.all([
    q,
    can(session, "comms.approve") ? db.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "pending_approval").neq("created_by", session.accountId) : Promise.resolve({ count: 0 }),
  ]);
  const scopes = [
    ...(can(session, "comms.send.province") ? [{ value: "province", label: "Province-wide", hint: "Needs approval by the Provincial Grand Mentor or Deputy." }] : []),
    ...(can(session, "comms.send.allocated") ? [{ value: "allocated", label: "My allocated Lodges", hint: "Members and office holders of Lodges allocated to you." }] : []),
  ];
  const replyTo = (session.org.settings as { comms?: { reply_to?: string } }).comms?.reply_to;

  return (
    <>
      <PageHeader title="Communications" description={`Email campaigns to Lodge Mentors, Personal Mentors and members. Replies go to ${replyTo ?? "the Provincial office inbox"}.`}
        actions={<>
          <LinkButton href="/communications/contacts">Contacts</LinkButton>
          {can(session, "comms.templates") && <LinkButton href="/communications/templates">Templates</LinkButton>}
          {scopes.length > 0 && <NewCampaign scopes={scopes} />}
        </>} />
      {(pending ?? 0) > 0 && (
        <div className="mb-4"><Alert tone="info" title={`${pending} ${pending === 1 ? "campaign is" : "campaigns are"} awaiting your approval`}>
          <Link href="/communications?status=pending" className="underline">Review them</Link>
        </Alert></div>
      )}
      <Tabs current={status} tabs={Object.keys(FILTERS).map((k) => ({
        key: k, href: k === "all" ? "/communications" : `/communications?status=${k}`,
        label: { all: "All", drafts: "Drafts", pending: "Awaiting approval", scheduled: "Scheduled", sent: "Sent", cancelled: "Cancelled" }[k]!,
      }))} />
      {!campaigns?.length ? (
        <EmptyState title={status === "all" ? "No campaigns yet" : "Nothing here"}>
          {status === "all" ? "Create a campaign to write to a group of members. You will see exactly who it reaches before anything is sent." : <Link href="/communications" className="underline">Show all campaigns</Link>}
        </EmptyState>
      ) : (
        <Table caption="Campaigns">
          <THead><TH>Campaign</TH><TH>Status</TH><TH className="hidden md:table-cell">Audience</TH><TH className="hidden lg:table-cell">Sender</TH><TH className="hidden sm:table-cell">Date</TH><TH className="hidden md:table-cell" align="right">Recipients</TH></THead>
          <TBody>
            {campaigns.map((c) => (
              <TR key={c.id}>
                <TD><RowLink href={`/communications/${c.id}`}>{c.title}</RowLink><div className="text-[13px] text-muted">{c.subject}</div></TD>
                <TD><Badge tone={statusTone(c.status)}>{CAMPAIGN_STATUS[c.status]}</Badge></TD>
                <TD className="hidden md:table-cell">{SCOPE_LABEL[c.scope]}<div className="text-[13px] text-muted">{categoryLabel(c.category)}</div></TD>
                <TD className="hidden lg:table-cell">{c.created_by === session.accountId ? "You" : (c.user_accounts as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name ?? "A colleague"}</TD>
                <TD className="hidden sm:table-cell whitespace-nowrap">{c.sent_at ? `Sent ${formatDateTime(c.sent_at)}` : c.scheduled_for ? `For ${formatDateTime(c.scheduled_for)}` : formatDateTime(c.created_at)}</TD>
                <TD className="hidden md:table-cell" align="right">{c.recipient_count ?? "-"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
