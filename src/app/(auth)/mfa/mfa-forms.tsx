"use client";

import { useEffect, useState } from "react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { startMfaEnrolment, verifyMfa } from "../actions";

export function MfaVerify({ factorId, next }: { factorId: string; next?: string }) {
  return (
    <ActionForm action={verifyMfa}>
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField label="Verification code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus required />
      <SubmitButton className="w-full" pendingText="Checking…">Verify</SubmitButton>
    </ActionForm>
  );
}

export function MfaEnrol({ next }: { next?: string }) {
  const [state, setState] = useState<{ factorId: string; qr: string; secret: string } | { error: string } | null>(null);
  useEffect(() => { startMfaEnrolment().then(setState); }, []);
  if (!state) return <p className="text-sm text-muted">Preparing…</p>;
  if ("error" in state) return <p role="alert" className="text-sm text-danger-700">{state.error}</p>;
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-ink">
        <li>Open your authenticator app and add an account.</li>
        <li>Scan this code, or enter the key below.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qr} alt="QR code for your authenticator app" width={180} height={180} className="mx-auto rounded border border-line" />
      <p className="text-center text-[13px] text-muted">Key: <code className="select-all break-all rounded bg-canvas px-1.5 py-0.5 font-mono text-ink" data-testid="totp-secret">{state.secret}</code></p>
      <MfaVerify factorId={state.factorId} next={next} />
    </div>
  );
}
