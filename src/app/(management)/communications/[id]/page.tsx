import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Stat, Tabs } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime, label } from "@/lib/utils";
import { describeAudience, parseAudience, personalise } from "@/server/comms/audience";
import { DoneNotice } from "@/components/events/notice";
import { renderEmail } from "@/server/email/layout";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { CAMPAIGN_STATUS, RECIPIENT_STATUS, SCOPE_LABEL, categoryLabel } from "../labels";
import {
  AttachmentForm, AudienceForm, CancelCampaignButton, DecisionForm, DuplicateButton, EmailPreview, IncludePerson, MessageForm, PersonToggle,
  RemoveAttachment, SegmentControls, SubmitCampaignButton, TemplatePicker, TestEmailButton,
} from "./campaign-forms";

export const metadata: Metadata = { title: "Campaign" };

const OFFICES = ["lodge_mentor", "assistant_lodge_mentor", "secretary", "worshipful_master", "membership_officer", "almoner", "director_of_ceremonies", "royal_arch_representative", "charity_steward"];
const STAGES = ["candidate", "entered_apprentice", "fellow_craft", "master_mason", "established"];

type Tab = "message" | "audience" | "preview" | "review" | "delivery";
type Recipient = { person_id: string; email: string; name: string; excluded_reason: string | null };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; done?: string }> }) {
  const session = await requirePermission("comms.use");
  const { id } = await params;
  const sp = await searchParams;
  const db = await supabaseServer();
  const { data: c } = await db.from("campaigns").select("*, user_accounts!campaigns_created_by_fkey(persons(display_name)), approver:user_accounts!campaigns_approved_by_fkey(persons(display_name))").eq("id", id).maybeSingle();
  if (!c) notFound();

  const mine = c.created_by === session.accountId;
  const editable = mine && c.status === "draft";
  const delivered = ["sending", "sent", "failed"].includes(c.status) || (c.status === "cancelled" && !!c.approved_at);
  const tabs: Tab[] = ["message", "audience", "preview", "review", ...(delivered || ["approved", "scheduled"].includes(c.status) ? (["delivery"] as Tab[]) : [])];
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : delivered ? "delivery" : "message";
  const audience = parseAudience(c.audience);
  const sender = mine ? "You" : (c.user_accounts as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name ?? "A colleague";
  const approver = (c.approver as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name;
  const settings = session.org.settings as { comms?: { reply_to?: string; allocated_requires_approval?: boolean } };
  const needsApproval = c.scope === "province" || !!settings.comms?.allocated_requires_approval;
  const attachments = (c.attachments as { bucket: string; path: string; filename: string }[]) ?? [];

  // Audience preview is resolved by the database with the same rules used for sending.
  const previewNeeded = tab === "audience" || tab === "review";
  const { data: previewRows, error: previewError } = previewNeeded ? await db.rpc("campaign_preview_audience", { p_campaign: id }) : { data: null, error: null };
  const recipients = (previewRows ?? []) as Recipient[];
  const eligible = recipients.filter((r) => !r.excluded_reason);
  const excluded = recipients.filter((r) => r.excluded_reason);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/communications", label: "Communications" }]}
        title={c.title}
        description={c.subject}
        meta={<>
          <Badge tone={statusTone(c.status)}>{CAMPAIGN_STATUS[c.status]}</Badge>
          <span className="text-sm text-muted">{SCOPE_LABEL[c.scope]} · {categoryLabel(c.category)} · by {sender}</span>
          {c.scheduled_for && !c.sent_at && <span className="text-sm text-muted">Scheduled for {formatDateTime(c.scheduled_for)}</span>}
        </>}
        actions={<>
          <DuplicateButton campaignId={id} />
          {(mine || can(session, "comms.approve")) && ["draft", "pending_approval", "approved", "scheduled"].includes(c.status) && <CancelCampaignButton campaignId={id} />}
        </>}
      />
      <DoneNotice done={sp.done} messages={{
        submitted: "Submitted for approval. The Provincial Grand Mentor and Deputy have been notified.",
        queued: "Approved and queued. Sending starts within a few minutes, or at the scheduled time.",
        approved: "Approved. Sending starts within a few minutes, or at the scheduled time.",
        returned: "Returned to the sender with your note.",
        cancelled: "Campaign cancelled. Nothing further will be sent.",
      }} />
      {c.status === "draft" && c.approval_note && <div className="mb-4"><Alert tone="warning" title="Returned for changes">{c.approval_note}</Alert></div>}
      {!editable && c.status === "draft" && <div className="mb-4"><Alert tone="info">This draft belongs to {sender}. Only they can change it.</Alert></div>}
      <Tabs current={tab} tabs={tabs.map((t) => ({
        key: t, href: `/communications/${id}?tab=${t}`,
        label: { message: "Message", audience: "Audience", preview: "Preview", review: editable ? "Review and send" : "Approval", delivery: "Delivery" }[t],
      }))} />
      {tab === "message" && <Message />}
      {tab === "audience" && <Audience />}
      {tab === "preview" && <Preview />}
      {tab === "review" && <Review />}
      {tab === "delivery" && <Delivery />}
    </>
  );

  async function Message() {
    const { data: templates } = editable ? await db.from("email_templates").select("id, name").eq("kind", "campaign").order("name") : { data: [] };
    const scopes = [
      ...(can(session, "comms.send.province") ? [{ value: "province", label: "Province-wide" }] : []),
      ...(can(session, "comms.send.allocated") ? [{ value: "allocated", label: "My allocated Lodges" }] : []),
    ];
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Message" actions={editable ? <TemplatePicker campaignId={id} templates={templates ?? []} /> : undefined}>
            {editable ? <MessageForm c={c!} scopes={scopes} replyTo={c!.reply_to ?? settings.comms?.reply_to ?? null} /> : (
              <DescriptionList columns={1} items={[
                { label: "Subject", value: c!.subject },
                { label: "Preview text", value: c!.preheader },
                { label: "Message", value: <pre className="whitespace-pre-wrap font-sans text-sm">{c!.body_markdown}</pre> },
                { label: "Replies go to", value: c!.reply_to ?? settings.comms?.reply_to },
              ]} />
            )}
          </Panel>
        </div>
        <Panel title="Attachments">
          {attachments.length ? (
            <ul className="mb-4 space-y-2 text-sm">
              {attachments.map((a) => (
                <li key={a.path} className="flex items-center justify-between gap-2"><span className="break-all">{a.filename}</span>{editable && <RemoveAttachment campaignId={id} path={a.path} />}</li>
              ))}
            </ul>
          ) : <p className="mb-4 text-sm text-muted">No attachments.</p>}
          {editable && <AttachmentForm campaignId={id} />}
        </Panel>
      </div>
    );
  }

  async function Audience() {
    const allocated = c!.scope === "allocated";
    const creatorLodges = mine ? session.allocatedLodgeIds : null;
    let lq = db.from("lodges").select("id, name, number").order("number");
    if (allocated && creatorLodges) lq = lq.in("id", creatorLodges.length ? creatorLodges : ["00000000-0000-0000-0000-000000000000"]);
    const [{ data: lodges }, { data: areas }, { data: roles }, { data: courses }, { data: events }, { data: segments }, { data: people }] = await Promise.all([
      lq, db.from("areas").select("id, name").order("code"), db.from("roles").select("key, name").order("name"),
      db.from("courses").select("id, title").is("archived_at", null).order("title"),
      db.from("events").select("id, title, starts_at").neq("status", "draft").order("starts_at", { ascending: false }).limit(60),
      db.from("segments").select("id, name, created_by").order("name"),
      audience.include.length || audience.exclude.length ? db.from("persons").select("id, display_name").in("id", [...audience.include, ...audience.exclude]) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    ]);
    const names = new Map((people ?? []).map((p) => [p.id, p.display_name ?? "Member"]));
    const lookups = {
      lodges: new Map((lodges ?? []).map((l) => [l.id, `${l.name} No. ${l.number}`])), areas: new Map((areas ?? []).map((a) => [a.id, a.name])),
      courses: new Map((courses ?? []).map((x) => [x.id, x.title])), events: new Map((events ?? []).map((e) => [e.id, e.title])), label,
    };
    return (
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Choose the audience" description={allocated ? "Allocated-scope campaigns only reach members and office holders of the sender's allocated Lodges." : "Province-wide: approval by the Provincial Grand Mentor or Deputy is needed before sending."}>
            {editable ? (
              <AudienceForm campaignId={id} filters={audience.filters as Record<string, string | string[]>}
                lodges={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` }))}
                areas={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))}
                offices={OFFICES.map((o) => ({ value: o, label: label(o) }))}
                roles={(roles ?? []).map((r) => ({ value: r.key, label: r.name }))}
                stages={STAGES.map((s) => ({ value: s, label: label(s) }))}
                courses={(courses ?? []).map((x) => ({ value: x.id, label: x.title }))}
                events={(events ?? []).map((e) => ({ value: e.id, label: `${e.title} (${formatDateTime(e.starts_at)})` }))} />
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">{describeAudience(audience.filters, c!.scope as "province", lookups).map((d) => <li key={d}>{d}</li>)}</ul>
            )}
          </Panel>
          <Panel title="Saved segments" description="Reuse a set of filters.">
            <SegmentControls campaignId={id} editable={editable} canSave={Object.keys(audience.filters).length > 0}
              segments={(segments ?? []).map((s) => ({ id: s.id, name: s.name, mine: s.created_by === session.accountId }))} />
          </Panel>
          {(audience.include.length > 0 || audience.exclude.length > 0) && (
            <Panel title="Manual changes">
              <ul className="space-y-1.5 text-sm">
                {audience.include.map((p) => <li key={p} className="flex items-center justify-between gap-2"><span>Added: {names.get(p) ?? "Member"}</span>{editable && <PersonToggle campaignId={id} personId={p} list="reset">Undo</PersonToggle>}</li>)}
                {audience.exclude.map((p) => <li key={p} className="flex items-center justify-between gap-2"><span>Excluded: {names.get(p) ?? "Member"}</span>{editable && <PersonToggle campaignId={id} personId={p} list="reset">Undo</PersonToggle>}</li>)}
              </ul>
            </Panel>
          )}
        </div>
        <div className="space-y-6 xl:col-span-3">
          <RecipientPreview />
        </div>
      </div>
    );
  }

  function RecipientPreview() {
    if (previewError) return <Alert tone="danger">The recipient list could not be worked out. Please try again.</Alert>;
    const reasons = [...excluded.reduce((m, r) => m.set(r.excluded_reason!, (m.get(r.excluded_reason!) ?? 0) + 1), new Map<string, number>())];
    return (
      <Panel title="Who will receive it" description="Worked out now, with the same rules used when sending. It is checked again at submission." padded={false}
        actions={editable ? <IncludePerson campaignId={id} /> : undefined}>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          <Stat label="Will receive" value={eligible.length} />
          <Stat label="Not sent" value={excluded.length} hint="See reasons below" />
        </div>
        {reasons.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-sm">
            <p className="font-medium text-navy-900">Why some people are not included</p>
            <ul className="mt-1 space-y-0.5">{reasons.map(([r, n]) => <li key={r}>{r}: <span className="tabular-nums">{n}</span></li>)}</ul>
          </div>
        )}
        {recipients.length === 0 ? <div className="p-5"><EmptyState title="Nobody matches yet">Widen the filters, or add people by name.</EmptyState></div> : (
          <Table className="rounded-none border-0 border-t" caption="Recipients">
            <THead><TH>Name</TH><TH className="hidden md:table-cell">Email</TH><TH>Status</TH>{editable && <TH><span className="sr-only">Change</span></TH>}</THead>
            <TBody>
              {recipients.slice(0, 300).map((r) => (
                <TR key={`${r.person_id}-${r.email}`}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="hidden md:table-cell break-all text-slate-ink">{r.email ?? ""}</TD>
                  <TD>{r.excluded_reason ? <span className="text-sm text-muted">Not sent: {r.excluded_reason}</span> : <Badge tone="success">Will receive</Badge>}</TD>
                  {editable && <TD>{r.excluded_reason === "Manually excluded"
                    ? <PersonToggle campaignId={id} personId={r.person_id} list="reset">Include</PersonToggle>
                    : !r.excluded_reason && <PersonToggle campaignId={id} personId={r.person_id} list="exclude">Exclude</PersonToggle>}</TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {recipients.length > 300 && <p className="border-t border-line px-5 py-3 text-sm text-muted">Showing the first 300 of {recipients.length}.</p>}
      </Panel>
    );
  }

  async function Preview() {
    const { data: org } = await db.from("organisations").select("name").single();
    const { html, text } = renderEmail({
      orgName: org?.name ?? session.org.name, subject: c!.subject, preheader: c!.preheader,
      markdown: personalise(c!.body_markdown || "_No message yet._", session.displayName),
      unsubscribeUrl: c!.category === "operational" ? null : "#unsubscribe-link",
    });
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Shown as {session.displayName} would receive it. Each recipient sees their own name in place of {"{{first_name}}"}.
          {c!.category !== "operational" && " Non-essential emails include an unsubscribe link."}</p>
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <div><span className="text-muted">Subject:</span> <strong>{c!.subject}</strong></div>
          {c!.preheader && <div><span className="text-muted">Preview text:</span> {c!.preheader}</div>}
          {attachments.length > 0 && <div><span className="text-muted">Attachments:</span> {attachments.map((a) => a.filename).join(", ")}</div>}
        </div>
        <EmailPreview html={html} text={text} />
      </div>
    );
  }

  async function Review() {
    const ready = c!.subject.trim() && c!.body_markdown.trim();
    const canDecide = can(session, "comms.approve") && c!.status === "pending_approval";
    const lookups = { label };
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Summary">
            <DescriptionList items={[
              { label: "Subject", value: c!.subject },
              { label: "Type", value: categoryLabel(c!.category) },
              { label: "Audience", value: <ul className="list-disc pl-5">{describeAudience(audience.filters, c!.scope as "province", lookups).map((d) => <li key={d}>{d}</li>)}</ul>, wide: true },
              { label: "Will receive", value: previewError ? "Could not be worked out" : `${eligible.length} ${eligible.length === 1 ? "person" : "people"}` },
              { label: "Not sent", value: `${excluded.length} (see the Audience tab for reasons)` },
              { label: "Approval", value: needsApproval ? (c!.scope === "province" ? "Province-wide: the Provincial Grand Mentor or Deputy approves" : "Required by Provincial settings") : "Not required for allocated Lodges" },
              { label: "When", value: c!.scheduled_for ? formatDateTime(c!.scheduled_for) : "As soon as approved" },
              { label: "Sender", value: sender },
              { label: "Replies go to", value: c!.reply_to ?? settings.comms?.reply_to },
              ...(c!.submitted_at ? [{ label: "Submitted", value: formatDateTime(c!.submitted_at) }] : []),
              ...(c!.approved_at ? [{ label: "Approved", value: `${formatDateTime(c!.approved_at)}${approver ? ` by ${approver}` : ""}` }] : []),
              ...(c!.approval_note ? [{ label: "Approval note", value: c!.approval_note, wide: true }] : []),
            ]} />
          </Panel>
        </div>
        <div className="space-y-6">
          {editable && (
            <Panel title="Send">
              <div className="space-y-4 text-sm">
                <p>Send yourself a test first. It goes only to {session.email ?? "your address"}.</p>
                <TestEmailButton campaignId={id} />
                {!ready && <Alert tone="warning">Add a subject and message before submitting.</Alert>}
                {ready && eligible.length === 0 && <Alert tone="warning">Nobody in the audience can receive this. Adjust the audience first.</Alert>}
                {ready && eligible.length > 0 && <SubmitCampaignButton campaignId={id} needsApproval={needsApproval} eligible={eligible.length} />}
              </div>
            </Panel>
          )}
          {canDecide && (
            <Panel title="Your decision" description={mine ? "You wrote this campaign. Provincial settings allow you to approve it, but a second pair of eyes is good practice." : "Approve to send, or return it to the sender with a note."}>
              <DecisionForm campaignId={id} />
            </Panel>
          )}
          {!editable && !canDecide && (
            <Panel title="Status">
              <p className="text-sm">{{
                draft: "This is a draft.", pending_approval: "Waiting for approval by the Provincial Grand Mentor or Deputy.", approved: "Approved. Sending will start shortly.",
                scheduled: `Approved and scheduled for ${formatDateTime(c!.scheduled_for)}.`, sending: "Sending now.", sent: `Sent ${formatDateTime(c!.sent_at)}.`,
                cancelled: "Cancelled. Nothing further will be sent.", failed: "Sending failed. See Delivery.",
              }[c!.status]}</p>
            </Panel>
          )}
        </div>
      </div>
    );
  }

  async function Delivery() {
    const { data: rows } = await db.from("campaign_recipients")
      .select("id, name, email, status, exclusion_reason, sent_at, delivered_at, first_opened_at, open_count, first_clicked_at, click_count, unsubscribed_at, error")
      .eq("campaign_id", id).order("name").limit(2000);
    const r = rows ?? [];
    const n = (f: (x: (typeof r)[number]) => boolean) => r.filter(f).length;
    const sent = n((x) => ["sent", "delivered", "bounced", "complained"].includes(x.status));
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Sent" value={sent} />
          <Stat label="Queued" value={n((x) => x.status === "queued")} />
          <Stat label="Delivered" value={n((x) => x.status === "delivered" || !!x.delivered_at)} />
          <Stat label="Bounced or failed" value={n((x) => ["bounced", "failed", "complained"].includes(x.status))} tone={n((x) => ["bounced", "failed"].includes(x.status)) ? "attention" : undefined} />
          <Stat label="Opened" value={n((x) => !!x.first_opened_at)} hint="where measurable" />
          <Stat label="Clicked a link" value={n((x) => !!x.first_clicked_at)} />
          <Stat label="Unsubscribed" value={n((x) => !!x.unsubscribed_at)} />
        </div>
        <Alert tone="info">Opens are recorded only where the email program loads images, so they are an estimate. An open is not proof that someone read the message, and a missing open does not mean they did not.</Alert>
        <DescriptionList columns={3} items={[
          { label: "Sender", value: sender },
          { label: "Approved", value: c!.approved_at ? `${formatDateTime(c!.approved_at)}${approver ? ` by ${approver}` : ""}` : null },
          { label: "Sent", value: c!.sent_at ? formatDateTime(c!.sent_at) : CAMPAIGN_STATUS[c!.status] },
        ]} />
        <Panel title="Recipients" padded={false}>
          {r.length === 0 ? <div className="p-5"><EmptyState title="No recipients recorded yet">The list is fixed when the campaign is approved.</EmptyState></div> : (
            <Table className="rounded-none border-0" caption="Delivery by recipient">
              <THead><TH>Name</TH><TH className="hidden md:table-cell">Email</TH><TH>Status</TH><TH className="hidden lg:table-cell">Sent</TH><TH className="hidden lg:table-cell">Opened</TH><TH className="hidden lg:table-cell">Clicks</TH></THead>
              <TBody>
                {r.map((x) => (
                  <TR key={x.id}>
                    <TD className="font-medium">{x.name}</TD>
                    <TD className="hidden md:table-cell break-all text-slate-ink">{x.email.endsWith("@invalid") ? "No email address" : x.email}</TD>
                    <TD>
                      <Badge tone={x.status === "excluded" ? "neutral" : statusTone(x.status)}>{RECIPIENT_STATUS[x.status] ?? x.status}</Badge>
                      {x.exclusion_reason && <div className="text-[13px] text-muted">{x.exclusion_reason}</div>}
                      {x.error && <div className="text-[13px] text-danger-700">{x.error}</div>}
                      {x.unsubscribed_at && <div className="text-[13px] text-muted">Unsubscribed {formatDateTime(x.unsubscribed_at)}</div>}
                    </TD>
                    <TD className="hidden lg:table-cell">{formatDateTime(x.sent_at)}</TD>
                    <TD className="hidden lg:table-cell">{x.first_opened_at ? formatDateTime(x.first_opened_at) : <span className="text-muted">Not measured</span>}</TD>
                    <TD className="hidden lg:table-cell tabular-nums">{x.click_count || ""}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      </div>
    );
  }
}
