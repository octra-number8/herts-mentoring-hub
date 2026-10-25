"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { sendMagicLink, signInWithPassword } from "../actions";

export function LoginForms({ next }: { next?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Sign-in method" className="mb-5 grid grid-cols-2 rounded-md bg-canvas p-1 text-sm font-medium">
        {(["password", "link"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
            className={mode === m ? "rounded bg-white py-1.5 text-navy-900 shadow-sm" : "py-1.5 text-muted hover:text-navy-900"}>
            {m === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>
      {mode === "password" ? (
        <ActionForm action={signInWithPassword}>
          <input type="hidden" name="next" value={next ?? ""} />
          <TextField label="Email address" name="email" type="email" autoComplete="email" required />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
          <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={sendMagicLink}>
          <input type="hidden" name="next" value={next ?? ""} />
          <TextField label="Email address" name="email" type="email" autoComplete="email" required hint="We'll email you a link that signs you in. No password needed." />
          <SubmitButton className="w-full" pendingText="Sending…">Send sign-in link</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
