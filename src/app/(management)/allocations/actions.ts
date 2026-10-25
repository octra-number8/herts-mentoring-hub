"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

export const allocateLodge = defineAction(
  z.object({
    lodge_id: zf.uuid("Lodge"),
    person_id: zf.uuid("Assistant"),
    kind: z.enum(["primary", "cover"]),
    starts_on: zf.date("Start date"),
    ends_on: zf.optionalDate(),
    reason: zf.optionalText(500),
    transfer_open_work: zf.checkbox(),
  }),
  async (i, { db }) => {
    if (i.kind === "cover" && !i.ends_on) throw new UserError("Temporary cover needs an end date.");
    if (i.ends_on && i.ends_on < i.starts_on) throw new UserError("The end date must be after the start date.");
    check(await db.rpc("allocate_lodge", {
      p_lodge: i.lodge_id, p_person: i.person_id, p_kind: i.kind, p_starts: i.starts_on, p_ends: i.ends_on ?? undefined,
      p_reason: i.reason ?? undefined, p_transfer_open_work: i.kind === "primary" && i.transfer_open_work,
    }));
    kickJobs();
    return {
      message: i.kind === "cover" ? "Temporary cover recorded." : `Lodge allocated.${i.transfer_open_work ? " Open tasks and support requests for this Lodge moved with it." : ""}`,
      revalidate: ["/allocations", "/lodges", `/lodges/${i.lodge_id}`],
    };
  },
  { permission: ["allocations.manage"] },
);

export const endAllocation = defineAction(
  z.object({ allocation_id: zf.uuid(), effective: zf.date("Effective date"), lodge_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("end_allocation", { p_allocation: i.allocation_id, p_effective: i.effective }));
    return { message: "Allocation ended. The history is kept.", revalidate: ["/allocations", "/lodges", `/lodges/${i.lodge_id}`] };
  },
  { permission: ["allocations.manage"] },
);

export const endAppointment = defineAction(
  z.object({ person_id: zf.uuid(), effective: zf.date("Effective date"), reason: zf.required("Reason", 500) }),
  async (i, { db }) => {
    const res = check(await db.rpc("end_provincial_appointment", { p_person: i.person_id, p_effective: i.effective, p_reason: i.reason })) as Record<string, number>;
    const open = (res.open_tasks ?? 0) + (res.open_cases ?? 0);
    return {
      message: `Appointment ended: ${res.allocations_ended} allocations and ${res.roles_ended} management roles closed.${open ? ` ${res.open_tasks} open tasks and ${res.open_cases} support requests remain with them: transfer them below.` : " No open work remains."}`,
      revalidate: ["/allocations", "/lodges"],
    };
  },
  { permission: ["allocations.manage"] },
);

export const transferWork = defineAction(
  z.object({ from_account: zf.uuid(), to_account: zf.uuid("Recipient"), reason: zf.required("Reason", 500) }),
  async (i, { db }) => {
    if (i.from_account === i.to_account) throw new UserError("Choose someone else to receive the work.");
    const res = check(await db.rpc("transfer_open_work", { p_from_account: i.from_account, p_to_account: i.to_account, p_reason: i.reason })) as Record<string, number>;
    kickJobs();
    return { message: `${res.tasks} tasks and ${res.cases} support requests transferred. Earlier activity stays attributed to the person who did it.`, revalidate: ["/allocations"] };
  },
  { permission: ["allocations.manage", "tasks.manage_all"] },
);
