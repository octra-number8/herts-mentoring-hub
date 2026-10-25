"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import { checkInToSession } from "./actions";

export function CheckinForm({ eventId, secret }: { eventId: string; secret: string }) {
  const [done, setDone] = useState(false);
  return (
    <ActionForm action={checkInToSession} onSuccess={() => setDone(true)}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="secret" value={secret} />
      {done ? (
        <p className="text-sm"><Link href={`/academy/events/${eventId}`} className="font-medium text-navy-800 underline">View the event page</Link></p>
      ) : (
        <FormActions><SubmitButton pendingText="Checking in…" className="w-full sm:w-auto">Confirm my attendance</SubmitButton></FormActions>
      )}
    </ActionForm>
  );
}
