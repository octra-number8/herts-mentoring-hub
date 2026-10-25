import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DescriptionList, PageHeader, Panel } from "@/components/ui/layout";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { isManagementUser, requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ContactChangeForm, FeedTokenForm, MfaReenrol, PasswordForm, RevokeFeed } from "./account-forms";

export const metadata: Metadata = { title: "My account" };

const REQUEST_STATUS: Record<string, string> = { open: "With the Provincial team", done: "Updated", declined: "Not changed" };

export default async function AccountPage() {
  const session = await requireSession();
  const db = await supabaseServer();
  const count = async (table: "registrations" | "enrolments" | "certificates" | "notifications", col: "person_id" | "account_id", id: string) =>
    (await db.from(table).select("id", { count: "exact", head: true }).eq(col as "id", id)).count ?? 0;
  const [{ data: person }, { data: roles }, factorsRes, { data: tokens }, { data: requests }, regs, enrols, certs, notes] = await Promise.all([
    db.from("persons").select("display_name, email, phone, membership_number, status").eq("id", session.personId).maybeSingle(),
    db.from("roles").select("key, name").in("key", session.roles.length ? session.roles : ["-"]),
    db.auth.mfa.listFactors(),
    db.from("calendar_feed_tokens").select("id, label, created_at, last_used_at").is("revoked_at", null).order("created_at"),
    db.from("contact_change_requests").select("id, details, status, created_at, handled_at").order("created_at", { ascending: false }).limit(5),
    count("registrations", "person_id", session.personId),
    count("enrolments", "person_id", session.personId),
    count("certificates", "person_id", session.personId),
    count("notifications", "account_id", session.accountId),
  ]);
  const verified = (factorsRes.data?.totp ?? []).filter((f) => f.status === "verified");
  const management = isManagementUser(session);
  const roleNames = (roles ?? []).map((r) => r.name);

  return (
    <>
      <PageHeader title="My account" description="Your details, sign-in security, calendar links and what the Hub holds about you." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Your details" actions={<ContactChangeForm />}>
            <DescriptionList items={[
              { label: "Name", value: person?.display_name ?? session.displayName },
              { label: "Email", value: person?.email ?? session.email },
              { label: "Phone", value: person?.phone },
              { label: "Membership number", value: person?.membership_number },
              { label: "Hub roles", value: roleNames.length ? roleNames.join(", ") : "Member" },
            ]} />
            <p className="mt-4 text-sm text-muted">Membership details come from the Provincial records, so you cannot change them here. Use Ask for a change and the Provincial team will update them. There should never be any surprises: you will see the change here once it is made.</p>
            {requests && requests.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                {requests.map((r) => (
                  <li key={r.id}>
                    <span className="text-muted">{formatDate(r.created_at)}:</span> {r.details.length > 120 ? `${r.details.slice(0, 120)}…` : r.details}
                    {" "}<Badge tone={r.status === "open" ? "navy" : r.status === "done" ? "success" : "neutral"}>{REQUEST_STATUS[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Password">
            <PasswordForm />
          </Panel>

          <Panel title="Two-step verification" description="A code from an authenticator app, as well as your password.">
            <div className="space-y-3 text-sm">
              {verified.length ? (
                <p>Two-step verification is <strong>on</strong>{verified[0].created_at ? `, set up ${formatDate(verified[0].created_at)}` : ""}.
                  {session.mfaRequired ? " It is required for your role." : ""}</p>
              ) : (
                <p>Two-step verification is <strong>off</strong>. {session.mfaRequired ? "It is required for your role, and you will be asked to set it up when you next sign in." : "It is optional for your account, and makes it much harder for anyone else to sign in as you."}</p>
              )}
              <p className="text-muted">{verified.length ? "New phone, or lost your authenticator? Set up a new one here while you are signed in. The old one stops working once the new one is confirmed." : ""}</p>
              <MfaReenrol label={verified.length ? "Set up a new authenticator" : "Turn on two-step verification"} />
            </div>
          </Panel>

          <Panel id="calendar-feeds" title="Calendar links" description="Subscribe in Outlook, Google or Apple Calendar to see your bookings and the events you lead. Joining links are never included.">
            {tokens?.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">
                {tokens.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{t.label}</span><span className="block text-muted">Created {formatDate(t.created_at)} · {t.last_used_at ? `last used ${formatDateTime(t.last_used_at)}` : "not used yet"}</span></span>
                    <RevokeFeed id={t.id} />
                  </li>
                ))}
              </ul>
            ) : <p className="mb-4 text-sm text-muted">You have no calendar links.</p>}
            <FeedTokenForm />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Notifications and email">
            <p className="text-sm">Choose how you hear about things, and which emails you receive.</p>
            <p className="mt-3"><Link href="/account/notifications" className="font-medium text-navy-800 underline">Notification and email settings</Link></p>
          </Panel>
          <Panel title="What the Hub holds about you">
            <div className="space-y-3 text-sm">
              <p>Your name, contact details, membership number, Lodge membership and degree dates, from the Provincial membership records.</p>
              <p>Your learning: {enrols} {enrols === 1 ? "course" : "courses"}, {certs} {certs === 1 ? "certificate" : "certificates"}, and your progress and reflections.</p>
              <p>Your event bookings and attendance ({regs}), and any feedback you give.</p>
              <p>{notes} {notes === 1 ? "notification" : "notifications"}, your email preferences, and a record of when you sign in.</p>
              {management && <p>As a member of the Provincial team, the Hub also records what you add: contacts, notes, tasks and decisions, with your name against them.</p>}
              <h3 className="pt-1 font-semibold text-navy-900">Who can see it</h3>
              <ul className="list-disc space-y-1 pl-5">
                <li>You can see your own learning, bookings and certificates.</li>
                <li>The Assistant Provincial Grand Mentor responsible for your Lodge, and the Provincial leadership, can see your mentoring journey.</li>
                <li>People responsible for learning across the Province can see learning records, to support you and report on the Academy.</li>
                <li>Event organisers see the bookings, attendance and feedback for their events.</li>
                <li>Learning users never see anyone else&apos;s records.</li>
              </ul>
              <p className="text-muted">Questions about your information? Contact {(session.org.settings as { comms?: { reply_to?: string } }).comms?.reply_to ?? "the Provincial office"}.</p>
            </div>
          </Panel>
          <Panel title="Account">
            <DescriptionList columns={1} items={[
              { label: "Signed in as", value: session.email },
              { label: "Account type", value: management ? "Provincial Hub and Academy" : session.portalLodgeIds.length ? "Lodge portal and Academy" : "Academy" },
              { label: "Membership status", value: person?.status ? label(person.status) : null },
            ]} />
          </Panel>
        </div>
      </div>
    </>
  );
}
