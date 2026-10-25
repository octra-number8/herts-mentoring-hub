"use client";

import { ActionButton } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, RadioGroup, SubmitButton, TextAreaField } from "@/components/ui/form";
import { cancelMyPlace, giveFeedback, registerForEvent } from "./actions";

export function RegisterButton({ eventId, full }: { eventId: string; full: boolean }) {
  return <ActionButton action={registerForEvent} fields={{ event_id: eventId }} variant="primary" size="md">{full ? "Join the waiting list" : "Book a place"}</ActionButton>;
}

export function CancelPlaceButton({ eventId, registrationId, waitlisted }: { eventId: string; registrationId: string; waitlisted: boolean }) {
  return (
    <ActionButton action={cancelMyPlace} fields={{ event_id: eventId, registration_id: registrationId }} variant="secondary" size="md"
      confirm={waitlisted ? "Leave the waiting list?" : "Cancel your place? It will be offered to the next person on the waiting list."}>
      {waitlisted ? "Leave the waiting list" : "Cancel my place"}
    </ActionButton>
  );
}

export function FeedbackForm({ eventId, registrationId }: { eventId: string; registrationId: string }) {
  return (
    <ActionForm action={giveFeedback}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="registration_id" value={registrationId} />
      <RadioGroup legend="How useful was it?" name="rating" options={[
        { value: "5", label: "5 Very useful" }, { value: "4", label: "4" }, { value: "3", label: "3" }, { value: "2", label: "2" }, { value: "1", label: "1 Not useful" }]} />
      <TextAreaField label="Anything you would like to tell the organisers?" name="comment" rows={3} hint="Optional." />
      <FormActions><SubmitButton>Send feedback</SubmitButton></FormActions>
    </ActionForm>
  );
}
