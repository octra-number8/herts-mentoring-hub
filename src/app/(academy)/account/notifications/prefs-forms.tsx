"use client";

import { ActionForm, CheckboxField, FormActions, SubmitButton } from "@/components/ui/form";
import { saveEmailPreferences, saveNotificationPreferences } from "../actions";

type Row = { type: string; label: string; description: string; essential: boolean; channel: string };
const CHANNELS = [
  { value: "in_app", label: "In the Hub only" }, { value: "email", label: "Email straight away" },
  { value: "daily", label: "Daily summary" }, { value: "weekly", label: "Weekly summary" }, { value: "off", label: "Off" },
];

export function NotificationPrefsForm({ rows }: { rows: Row[] }) {
  return (
    <ActionForm action={saveNotificationPreferences} className="space-y-4">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.type} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <label htmlFor={`pref-${r.type}`} className="font-medium text-ink">{r.label}</label>
              <p className="text-[13px] text-muted">{r.description}{r.essential ? " Essential: it can be moved to a summary but not switched off." : ""}</p>
            </div>
            <select id={`pref-${r.type}`} name={`pref_${r.type}`} defaultValue={r.channel}
              className="rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100 sm:w-56">
              {CHANNELS.filter((c) => !(r.essential && c.value === "off")).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <FormActions><SubmitButton>Save notification settings</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function EmailPrefsForm({ learning, events, news, unsubscribed }: { learning: boolean; events: boolean; news: boolean; unsubscribed: boolean }) {
  return (
    <ActionForm action={saveEmailPreferences} className="space-y-3">
      <CheckboxField label="Learning" name="learning" defaultChecked={learning} hint="Course reminders and suggestions from the Academy." />
      <CheckboxField label="Events" name="events" defaultChecked={events} hint="Event reminders, follow-ups and invitations to training." />
      <CheckboxField label="News and updates" name="news" defaultChecked={news} hint="Occasional news from the Provincial mentoring team. Off unless you choose it." />
      <div className="border-t border-line pt-3">
        <CheckboxField label="Unsubscribe from all optional email" name="unsubscribe_all" defaultChecked={unsubscribed}
          hint="You will still receive essential messages about your account security, your bookings and your role." />
      </div>
      <FormActions><SubmitButton>Save email preferences</SubmitButton></FormActions>
    </ActionForm>
  );
}
