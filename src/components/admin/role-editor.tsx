"use client";

import { ActionForm, CheckboxField, FormActions, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

export function RolePermissionEditor({ action, roleId, roleName, groups, held }: {
  action: Action; roleId: string; roleName: string; groups: { feature: string; permissions: { key: string; description: string }[] }[]; held: string[];
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="role_id" value={roleId} />
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g.feature} className="space-y-2">
            <legend className="text-sm font-semibold text-navy-900">{g.feature}</legend>
            {g.permissions.map((p) => (
              <CheckboxField key={p.key} name="permissions[]" value={p.key} label={p.description} hint={p.key} defaultChecked={held.includes(p.key)} />
            ))}
          </fieldset>
        ))}
      </div>
      <div className="rounded-md border border-warning-800/20 bg-warning-50 p-3">
        <CheckboxField name="confirm" label={`I understand this changes access for everyone who holds the ${roleName} role`}
          hint="The change applies immediately and is recorded in the audit log. The database still enforces every rule." />
      </div>
      <FormActions><SubmitButton>Save permissions</SubmitButton></FormActions>
    </ActionForm>
  );
}
