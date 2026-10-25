"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { EVENT_FORMATS, EVENT_KINDS, EVENT_VISIBILITY, REGISTRATION_MODES } from "@/components/events/constants";
import { toLocalInput } from "@/components/events/datetime";
import { saveEvent } from "./actions";

export type EditableEvent = {
  id: string; title: string; description: string; kind: string; format: string; visibility: string; starts_at: string; ends_at: string;
  location: string | null; meeting_centre_id: string | null; capacity: number | null; waitlist_enabled: boolean; registration_mode: string;
  registration_opens_at: string | null; registration_closes_at: string | null; external_booking_url: string | null; external_ref: string | null; course_id: string | null;
  attendance_completes_course: boolean; certificate_on_attendance: boolean; feedback_enabled: boolean;
};

export function EventForm({ event, joining, centres, courses }: {
  event?: EditableEvent | null; joining?: { online_url: string | null; instructions: string | null } | null;
  centres: { id: string; name: string }[]; courses: { id: string; title: string }[];
}) {
  const [mode, setMode] = useState(event?.registration_mode ?? "hub");
  const [format, setFormat] = useState(event?.format ?? "in_person");
  const [visibility, setVisibility] = useState(event?.visibility ?? "internal");
  return (
    <ActionForm action={saveEvent} className="space-y-6">
      {event && <input type="hidden" name="event_id" value={event.id} />}

      <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-[15px] font-semibold text-navy-900">What and when</legend>
        <TextField label="Title" name="title" defaultValue={event?.title} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type of event" name="kind" defaultValue={event?.kind ?? "workshop"} options={EVENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            hint="Workshops, online training, training days, mentoring evenings and presentations count as training." />
          <SelectField label="Format" name="format" value={format} onChange={(e) => setFormat(e.target.value)} options={EVENT_FORMATS.map((f) => ({ value: f.value, label: f.label }))} />
          <TextField label="Starts" name="starts_at" type="datetime-local" defaultValue={toLocalInput(event?.starts_at)} required />
          <TextField label="Finishes" name="ends_at" type="datetime-local" defaultValue={toLocalInput(event?.ends_at)} required />
        </div>
        <TextAreaField label="Description" name="description" rows={5} defaultValue={event?.description ?? ""} hint="Shown to everyone who can see the event. Markdown is supported." />
        {format !== "online" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Meeting centre" name="meeting_centre_id" defaultValue={event?.meeting_centre_id ?? ""} placeholder="Not at a meeting centre" options={centres.map((c) => ({ value: c.id, label: c.name }))} />
            <TextField label="Location" name="location" defaultValue={event?.location ?? ""} hint="Room or address, if useful." />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-[15px] font-semibold text-navy-900">Who can see it</legend>
        <SelectField label="Visibility" name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}
          options={EVENT_VISIBILITY.map((v) => ({ value: v.value, label: v.label }))}
          hint={EVENT_VISIBILITY.find((v) => v.value === visibility)?.hint} />
        {visibility === "invited" && <p className="text-sm text-muted">Invite people from the event page once it is saved.</p>}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-[15px] font-semibold text-navy-900">Registration</legend>
        <SelectField label="How people book" name="registration_mode" value={mode} onChange={(e) => setMode(e.target.value)} options={REGISTRATION_MODES.map((m) => ({ value: m.value, label: m.label }))} />
        {mode === "external" && (
          <TextField label="Octra-Lodge booking link" name="external_booking_url" type="url" defaultValue={event?.external_booking_url ?? ""} required
            hint="Paste the event's booking page from Octra-Lodge. Paid and externally managed events are booked there, and Octra-Lodge remains the record of bookings and payments." />
        )}
        {mode === "external" && (
          <TextField label="Octra-Lodge event ID (optional)" name="external_ref" defaultValue={event?.external_ref ?? ""}
            hint="Kept for a future read-only connection. Bookings are not imported today." />
        )}
        {mode === "hub" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Capacity" name="capacity" type="number" min={1} inputMode="numeric" defaultValue={event?.capacity ?? ""} hint="Leave blank for no limit." />
              <TextField label="Registration opens" name="registration_opens_at" type="datetime-local" defaultValue={toLocalInput(event?.registration_opens_at)} hint="Blank: as soon as published." />
              <TextField label="Registration closes" name="registration_closes_at" type="datetime-local" defaultValue={toLocalInput(event?.registration_closes_at)} hint="Blank: when the event starts." />
            </div>
            <CheckboxField label="Keep a waiting list when full" name="waitlist_enabled" defaultChecked={event?.waitlist_enabled ?? true}
              hint="When someone cancels, the next person is offered the place automatically and told by email." />
          </>
        )}
      </fieldset>

      {format !== "in_person" && (
        <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <legend className="px-1 text-[15px] font-semibold text-navy-900">Joining details</legend>
          <p className="text-sm text-muted">Only organisers and people with a confirmed place can see these.</p>
          <TextField label="Online meeting link" name="online_url" type="url" defaultValue={joining?.online_url ?? ""} />
          <TextAreaField label="Joining instructions" name="joining_instructions" rows={3} defaultValue={joining?.instructions ?? ""} />
        </fieldset>
      )}
      {format === "in_person" && joining?.instructions && <input type="hidden" name="joining_instructions" value={joining.instructions} />}

      <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-[15px] font-semibold text-navy-900">Learning and feedback</legend>
        <SelectField label="Linked course" name="course_id" defaultValue={event?.course_id ?? ""} placeholder="No linked course" options={courses.map((c) => ({ value: c.id, label: c.title }))} />
        <CheckboxField label="Attendance completes the linked course" name="attendance_completes_course" defaultChecked={event?.attendance_completes_course}
          hint="Verified attendance is added to the person's learning record." />
        <CheckboxField label="Issue a certificate of attendance" name="certificate_on_attendance" defaultChecked={event?.certificate_on_attendance} />
        <CheckboxField label="Ask attendees for feedback" name="feedback_enabled" defaultChecked={event?.feedback_enabled ?? true} />
      </fieldset>

      <FormActions>
        <SubmitButton>{event ? "Save changes" : "Save as draft"}</SubmitButton>
        <Link href={event ? `/events/${event.id}` : "/events"} className={buttonClass("subtle")}>Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}
