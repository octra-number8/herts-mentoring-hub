"use client";

import { useState } from "react";
import { DialogForm } from "@/components/ui/dialog-form";
import { CheckboxField, RadioGroup, SelectField, TextAreaField, TextField, useFormState } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import type { ActionState } from "@/lib/action-state";
import { todayIso } from "@/lib/utils";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Role = { key: string; name: string; description: string; is_management: boolean; restricted?: boolean };

function RoleChoices({ roles }: { roles: Role[] }) {
  const error = useFormState().fieldErrors?.roles;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Roles <span className="text-danger-700" aria-hidden>*</span></legend>
      <p className="text-[13px] text-muted">Roles marked &quot;two-step verification&quot; require an authenticator app. Inviting a Lodge Mentor gives Academy access only: the Lodge Mentor portal stays closed unless activated separately.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <CheckboxField key={r.key} name="roles[]" value={r.key} label={`${r.name}${r.is_management ? " (two-step verification)" : ""}`} hint={r.description} />
        ))}
      </div>
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}

export function InviteForm({ action, roles, preset, trigger = "Invite someone", triggerVariant = "primary" }: {
  action: Action; roles: Role[]; preset?: { id: string; label: string; email: string | null }; trigger?: string; triggerVariant?: "primary" | "secondary" | "subtle";
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  return (
    <DialogForm trigger={trigger} triggerVariant={triggerVariant} triggerSize={preset ? "sm" : "md"} title="Invite someone to the Hub" action={action} submitLabel="Send invitation" wide
      description="They receive an email with a link to choose a password. The link expires after 7 days and works once.">
      {preset ? (
        <>
          <input type="hidden" name="mode" value="existing" />
          <input type="hidden" name="person_id" value={preset.id} />
          <p className="text-sm"><span className="text-muted">Inviting:</span> <strong>{preset.label}</strong></p>
        </>
      ) : (
        <div onChange={(e) => { const t = e.target as HTMLInputElement; if (t.name === "mode") setMode(t.value as "existing" | "new"); }}>
          <RadioGroup legend="Who?" name="mode" defaultValue="existing" options={[{ value: "existing", label: "Someone already in the Hub" }, { value: "new", label: "Someone new" }]} />
        </div>
      )}
      {!preset && mode === "existing" && <PersonPicker name="person_id" label="Person" required hint="Search by name or membership number." />}
      {!preset && mode === "new" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Title" name="title" placeholder="e.g. W Bro" />
          <TextField label="First name" name="first_name" required />
          <TextField label="Last name" name="last_name" required />
        </div>
      )}
      <TextField label="Email address" name="email" type="email" required defaultValue={preset?.email ?? ""} hint="The invitation is sent here and becomes their sign-in address." />
      <RoleChoices roles={roles.filter((r) => !r.restricted)} />
      <TextAreaField label="Personal message" name="message" rows={2} hint="Optional. Included in the email." />
    </DialogForm>
  );
}

export function StatusForm({ action, accountId, to, label, variant = "secondary" }: { action: Action; accountId: string; to: "active" | "suspended" | "deactivated"; label: string; variant?: "secondary" | "danger" | "subtle" }) {
  const descriptions = {
    active: "They can sign in again. Roles ended by a deactivation are not restored automatically.",
    suspended: "They are signed out everywhere and cannot sign in until reactivated. Roles are kept.",
    deactivated: "Ends every role, individual permission and portal activation, and signs them out everywhere. Their history stays attributed to them.",
  };
  return (
    <DialogForm trigger={label} triggerVariant={variant === "danger" ? "danger" : variant} triggerSize="md" title={label} description={descriptions[to]} action={action}
      submitLabel={label} submitVariant={to === "active" ? "primary" : "danger"}>
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="status" value={to} />
      <TextAreaField label="Reason" name="reason" rows={2} required hint="Recorded in the audit log." />
    </DialogForm>
  );
}

export function AddRoleForm({ action, accountId, roles }: { action: Action; accountId: string; roles: { id: string; name: string; is_management: boolean }[] }) {
  return (
    <DialogForm trigger="Add role" triggerSize="sm" triggerVariant="subtle" title="Add a role" action={action}>
      <input type="hidden" name="account_id" value={accountId} />
      <SelectField label="Role" name="role_id" required placeholder="Choose a role" options={roles.map((r) => ({ value: r.id, label: `${r.name}${r.is_management ? " (two-step verification)" : ""}` }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="From" name="starts_on" type="date" defaultValue={todayIso()} required />
        <TextField label="Until" name="ends_on" type="date" hint="Optional: leave blank for no end." />
      </div>
      <TextField label="Reason" name="reason" placeholder="e.g. Appointed at the Provincial meeting" />
    </DialogForm>
  );
}

export function EndRoleForm({ action, accountId, assignmentId, name }: { action: Action; accountId: string; assignmentId: string; name: string }) {
  return (
    <DialogForm trigger="End" triggerSize="sm" triggerVariant="subtle" title={`End ${name}`} action={action} submitLabel="Record end" submitVariant="danger">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <TextField label="Last day in the role" name="ends_on" type="date" defaultValue={todayIso()} required />
    </DialogForm>
  );
}

export function AddGrantForm({ action, accountId, permissions }: { action: Action; accountId: string; permissions: { key: string; description: string }[] }) {
  return (
    <DialogForm trigger="Grant a permission" triggerSize="sm" triggerVariant="subtle" title="Grant an individual permission" action={action} wide
      description="For delegated access or a recorded exception. A reason is required and the grant is audited.">
      <input type="hidden" name="account_id" value={accountId} />
      <SelectField label="Permission" name="permission_key" required placeholder="Choose a permission" options={permissions.map((p) => ({ value: p.key, label: `${p.description} (${p.key})` }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="From" name="starts_on" type="date" defaultValue={todayIso()} required />
        <TextField label="Expires after" name="ends_on" type="date" hint="Optional, but recommended." />
      </div>
      <CheckboxField label="This is an override of the normal role rules" name="is_override" />
      <TextAreaField label="Reason" name="reason" rows={2} required />
    </DialogForm>
  );
}
