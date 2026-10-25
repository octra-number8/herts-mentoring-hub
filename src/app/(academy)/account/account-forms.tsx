"use client";

import { useState } from "react";
import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { beginMfaEnrol, changePassword, createFeedToken, finishMfaEnrol, requestContactChange, revokeFeedToken } from "./actions";

export function ContactChangeForm() {
  return (
    <DialogForm trigger="Ask for a change" triggerSize="sm" title="Update my contact details" action={requestContactChange} submitLabel="Send request"
      description="Your membership record is kept by the Provincial team. Tell them what has changed and they will update it.">
      <TextAreaField label="What should change?" name="details" rows={4} required placeholder="e.g. My new email address is … / My phone number is now …" />
    </DialogForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} resetOnSuccess className="max-w-md space-y-4">
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 12 characters, with letters and a number or symbol." />
      <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <FormActions><SubmitButton>Change password</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function FeedTokenForm() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <ActionForm action={createFeedToken} resetOnSuccess onSuccess={(s) => { setUrl((s.data as { url: string }).url); setCopied(false); }} className="flex flex-wrap items-end gap-2 space-y-0">
        <TextField label="Name for this link" name="label" defaultValue="My calendar" required fieldClassName="min-w-[14rem] flex-1" />
        <SubmitButton variant="secondary">Create calendar link</SubmitButton>
      </ActionForm>
      {url && (
        <div className="rounded-md border border-teal-100 bg-teal-50 p-3 text-sm">
          <label htmlFor="feed-url" className="font-medium text-teal-800">Your private calendar link</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id="feed-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1.5 font-mono text-[13px]" />
            <button type="button" className={buttonClass("secondary", "sm")} onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="mt-2 text-[13px] text-teal-800">Add it to Outlook, Google or Apple Calendar as a subscription. Anyone with the link can see the events in it, so keep it to yourself.</p>
        </div>
      )}
    </div>
  );
}

export function RevokeFeed({ id }: { id: string }) {
  return <ActionButton action={revokeFeedToken} fields={{ id }} variant="subtle" confirm="Revoke this link? Calendars using it will stop updating.">Revoke</ActionButton>;
}

export function MfaReenrol({ label }: { label: string }) {
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done) return <p role="status" className="rounded-md border border-success-700/20 bg-success-50 px-4 py-2.5 text-sm text-success-700">Your new authenticator is set up.</p>;
  if (!setup) {
    return (
      <div className="space-y-2">
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <button type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={async () => {
          setBusy(true);
          const r = await beginMfaEnrol();
          setBusy(false);
          if ("error" in r) setError(r.error); else setSetup(r);
        }}>{busy ? "Starting…" : label}</button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded border border-line bg-white p-2" />
      <p className="text-[13px] text-muted">Cannot scan? Enter this key: <code className="break-all font-mono">{setup.secret}</code></p>
      <ActionForm action={finishMfaEnrol} onSuccess={() => setDone(true)} className="max-w-xs space-y-3">
        <input type="hidden" name="factorId" value={setup.factorId} />
        <TextField label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
        <FormActions>
          <SubmitButton>Confirm</SubmitButton>
          <button type="button" className={buttonClass("subtle")} onClick={() => setSetup(null)}>Cancel</button>
        </FormActions>
      </ActionForm>
    </div>
  );
}
