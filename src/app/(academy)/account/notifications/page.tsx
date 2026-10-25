import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui/layout";
import { DEFAULT_CHANNEL, NOTIFICATION_TYPES } from "@/server/comms/notification-types";
import { isManagementUser, requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { EmailPrefsForm, NotificationPrefsForm } from "./prefs-forms";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const session = await requireSession();
  const db = await supabaseServer();
  const [{ data: prefs }, { data: email }] = await Promise.all([
    db.from("notification_preferences").select("type, channel").eq("account_id", session.accountId),
    db.from("comm_preferences").select("learning, events, news, unsubscribed_all_at, email_status").eq("person_id", session.personId).maybeSingle(),
  ]);
  const management = isManagementUser(session) || session.portalLodgeIds.length > 0;
  const rows = NOTIFICATION_TYPES.filter((t) => management || !t.management).map((t) => ({
    ...t, channel: prefs?.find((p) => p.type === t.type)?.channel ?? (t.essential ? "email" : DEFAULT_CHANNEL),
  }));
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/account", label: "My account" }]} title="Notification settings"
        description="Everything appears in the Hub. Choose which you would also like by email, straight away or as a summary." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Notifications"><NotificationPrefsForm rows={rows} /></Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Email preferences" description={`Sent to ${session.email ?? "your email address"}.`}>
            {email ? (
              <>
                {["bounced", "complained", "invalid"].includes(email.email_status) && (
                  <p className="mb-3 rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-800">Emails to this address are not being delivered. Ask the Provincial team to check it, from My account.</p>
                )}
                <EmailPrefsForm learning={email.learning} events={email.events} news={email.news} unsubscribed={!!email.unsubscribed_all_at} />
              </>
            ) : <p className="text-sm text-muted">Email preferences are not set up for your record yet. Please contact the Provincial office.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
