"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { handleContactChangeRequest } from "@/app/(management)/members/actions";

/** Decide a member's request to change their contact details (raised from My Account). */
export function ContactRequestDecision({ personId, requestId }: { personId: string; requestId: string }) {
  return (
    <ActionForm action={handleContactChangeRequest} className="mt-2 space-y-2">
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="request_id" value={requestId} />
      <TextField label="Note (optional)" name="handled_note" placeholder="e.g. Updated; Secretary informed" />
      <div className="flex gap-2">
        <SubmitButton size="sm" name="status" value="done">Mark done</SubmitButton>
        <SubmitButton size="sm" variant="secondary" name="status" value="declined">Decline</SubmitButton>
      </div>
    </ActionForm>
  );
}
