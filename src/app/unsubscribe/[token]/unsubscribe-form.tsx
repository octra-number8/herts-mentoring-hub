"use client";

import { useState } from "react";
import { ActionForm, FormActions, RadioGroup, SubmitButton } from "@/components/ui/form";
import { unsubscribe } from "./actions";

const DONE: Record<string, string> = {
  news: "You will no longer receive news and updates.",
  learning: "You will no longer receive learning reminders and suggestions.",
  events: "You will no longer receive event reminders and invitations.",
  all: "You will no longer receive any optional email from the Hub.",
};

export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState<string | null>(null);
  if (done) {
    return (
      <div role="status" className="space-y-3">
        <p className="font-semibold text-navy-900">Done. {DONE[done]}</p>
        <p className="text-sm text-slate-ink">You will still receive essential messages: account and sign-in security, confirmations and changes for events you have booked, and anything needed for a role you hold.</p>
        <p className="text-sm text-muted">Changed your mind? Sign in and choose your email preferences under My account.</p>
      </div>
    );
  }
  return (
    <ActionForm action={unsubscribe} onSuccess={(s) => setDone((s.data as { scope: string }).scope)}>
      <input type="hidden" name="token" value={token} />
      <RadioGroup legend="Which emails would you like to stop?" name="scope" defaultValue="news" options={[
        { value: "news", label: "News and updates only" },
        { value: "learning", label: "Learning reminders and suggestions" },
        { value: "events", label: "Event reminders and invitations" },
        { value: "all", label: "Everything optional", hint: "Essential messages about your account, bookings and role still arrive." },
      ]} />
      <FormActions><SubmitButton pendingText="Saving…">Unsubscribe</SubmitButton></FormActions>
    </ActionForm>
  );
}
