"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { checkMapping, headerSignature, matchTemplate, suggestMapping } from "@/server/imports/mapping";
import { parseFile, ParseError, type ParsedTable } from "@/server/imports/parse";
import { stageTable } from "@/server/imports/stage";
import type { DB } from "@/server/supabase";

const MAX_BYTES = 20 * 1024 * 1024;

async function readBatchFile(db: DB, batchId: string): Promise<{ table: ParsedTable; batch: { id: string; file_name: string; storage_path: string | null; is_partial: boolean; status: string } }> {
  const batch = check(await db.from("import_batches").select("id, file_name, storage_path, is_partial, status").eq("id", batchId).maybeSingle());
  if (!batch) throw new UserError("Import not found.");
  if (!batch.storage_path) throw new UserError("The uploaded file is no longer available. Please upload it again.");
  const { data, error } = await db.storage.from("imports").download(batch.storage_path);
  if (error || !data) throw new UserError("The uploaded file could not be read. Please upload it again.");
  const table = await parseFile(batch.file_name, new Uint8Array(await data.arrayBuffer()));
  return { table, batch };
}

export const uploadImport = defineAction(
  z.object({
    file: z.instanceof(File, { message: "Choose a file to upload" }),
    source: z.enum(["hermes", "adelphi", "portal", "other"]),
    report_scope: z.enum(["partial", "full"]),
    template_id: zf.optionalUuid(),
  }),
  async (i, { db, session }) => {
    if (!i.file.size) throw new UserError("Choose a file to upload.");
    if (i.file.size > MAX_BYTES) throw new UserError("The file is larger than 20 MB. Please split the report.");
    const bytes = new Uint8Array(await i.file.arrayBuffer());
    let table: ParsedTable;
    try {
      table = await parseFile(i.file.name, bytes);
    } catch (e) {
      if (e instanceof ParseError) throw new UserError(e.message);
      throw new UserError("The file could not be read. Check it is a CSV or Excel (.xlsx) report.");
    }
    if (!table.rows.length) throw new UserError("The file has a header row but no members.");

    // Store the original file first, then record the batch with its path (batches are insert-only for users).
    const id = randomUUID();
    const path = `${session.orgId}/${id}/${i.file.name.replace(/[^\w.-]+/g, "_").slice(0, 120)}`;
    const up = await db.storage.from("imports").upload(path, bytes, { contentType: i.file.type || "application/octet-stream", upsert: false });
    if (up.error) throw new UserError("The file could not be stored. Please try again.");
    const batch = check(await db.from("import_batches").insert({ id, org_id: session.orgId, source: i.source, file_name: i.file.name.slice(0, 200), storage_path: path,
      is_partial: i.report_scope === "partial" }).select("id").single());

    const { data: templates } = await db.from("import_templates").select("id, name, mapping, header_signature");
    const chosen = i.template_id ? templates?.find((t) => t.id === i.template_id) : matchTemplate(table.headers, (templates ?? []) as never);
    if (chosen) {
      const mapping = chosen.mapping as Record<string, string>;
      const problems = checkMapping(mapping, table.headers);
      if (!problems.length) {
        await stageTable(db, { batchId: batch.id, table, mapping, isPartial: i.report_scope === "partial", templateId: chosen.id });
        return { redirect: `/imports/${batch.id}` };
      }
    }
    return { redirect: `/imports/${batch.id}` };
  },
  { permission: ["imports.run"] },
);

export const mapAndStage = defineAction(
  z.object({ batch_id: zf.uuid(), save_as: zf.optionalText(80), source: z.enum(["hermes", "adelphi", "portal", "other"]).default("other") }).loose(),
  async (i, { db, session }) => {
    const { table, batch } = await readBatchFile(db, i.batch_id);
    if (!["uploaded", "validated"].includes(batch.status)) throw new UserError("This import has already been approved or closed.");
    const raw = i as Record<string, unknown>;
    const mapping: Record<string, string> = {};
    table.headers.forEach((h, idx) => {
      const t = raw[`map_${idx}`];
      if (typeof t === "string" && t) mapping[h] = t;
    });
    const problems = checkMapping(mapping, table.headers);
    if (problems.length) throw new UserError(problems.join(" "));
    let templateId: string | null = null;
    if (i.save_as) {
      const t = check(await db.from("import_templates").insert({ org_id: session.orgId, name: i.save_as, source: i.source, mapping, header_signature: headerSignature(table.headers) }).select("id").single());
      templateId = t.id;
    }
    const stats = await stageTable(db, { batchId: batch.id, table, mapping, isPartial: batch.is_partial, templateId });
    return { message: `Checked ${stats.rows} rows.`, redirect: `/imports/${batch.id}`, revalidate: [`/imports/${batch.id}`] };
  },
  { permission: ["imports.run"] },
);

export const restage = defineAction(
  z.object({ batch_id: zf.uuid() }),
  async (i, { db }) => {
    const { table, batch } = await readBatchFile(db, i.batch_id);
    const b = check(await db.from("import_batches").select("template_id, import_templates(mapping)").eq("id", batch.id).single());
    const mapping = (b.import_templates as unknown as { mapping: Record<string, string> } | null)?.mapping ?? suggestMapping(table.headers);
    const stats = await stageTable(db, { batchId: batch.id, table, mapping, isPartial: batch.is_partial, templateId: b.template_id });
    return { message: `Checked again: ${stats.rows} rows. Earlier decisions were reset.`, revalidate: [`/imports/${batch.id}`] };
  },
  { permission: ["imports.run"] },
);

const ALLOWED: Record<string, string[]> = {
  new: ["accept", "skip", "merge"],
  update: ["accept", "skip"],
  unchanged: ["accept", "skip"],
  duplicate: ["merge", "create_new", "skip"],
  conflict: ["accept", "skip", "merge"],
  invalid: ["skip"],
  possible_removal: ["accept", "skip"],
};

export const decideRow = defineAction(
  z.object({ batch_id: zf.uuid(), row_id: zf.uuid(), decision: z.enum(["accept", "skip", "merge", "create_new"]), person_id: zf.optionalUuid() }),
  async (i, { db, session }) => {
    const row = check(await db.from("import_rows").select("id, outcome, candidate_person_ids, matched_person_id").eq("id", i.row_id).eq("batch_id", i.batch_id).maybeSingle());
    if (!row) throw new UserError("Row not found.");
    if (!ALLOWED[row.outcome]?.includes(i.decision)) throw new UserError("That decision is not available for this row.");
    let personId: string | null = null;
    if (i.decision === "merge") {
      personId = i.person_id ?? (row.candidate_person_ids.length === 1 ? row.candidate_person_ids[0] : null);
      if (!personId) throw new UserError("Choose the existing record to merge into.");
    }
    const res = await db.from("import_rows").update({ decision: i.decision, decision_person_id: personId, decided_by: session.accountId }).eq("id", i.row_id).select("id");
    if (!check(res).length) throw new UserError("Decisions can only be changed before the import is approved.");
    return { message: "Decision saved.", revalidate: [`/imports/${i.batch_id}`] };
  },
  { permission: ["imports.run"] },
);

export const decideAllPending = defineAction(
  z.object({ batch_id: zf.uuid(), outcome: z.enum(["new", "update", "unchanged", "duplicate", "conflict", "invalid", "possible_removal"]), decision: z.enum(["accept", "skip", "create_new"]) }),
  async (i, { db, session }) => {
    if (!ALLOWED[i.outcome].includes(i.decision)) throw new UserError("That decision is not available for these rows.");
    const res = await db.from("import_rows").update({ decision: i.decision, decided_by: session.accountId }).eq("batch_id", i.batch_id).eq("outcome", i.outcome).eq("decision", "pending").select("id");
    const n = check(res).length;
    return { message: n ? `${n} ${n === 1 ? "row" : "rows"} decided.` : "Nothing was waiting for a decision.", revalidate: [`/imports/${i.batch_id}`] };
  },
  { permission: ["imports.run"] },
);

export const commitImport = defineAction(
  z.object({ batch_id: zf.uuid() }),
  async (i, { db }) => {
    const res = check(await db.rpc("import_commit", { p_batch: i.batch_id })) as Record<string, number>;
    kickJobs();
    return {
      message: `Committed: ${res.created} new, ${res.updated} updated, ${res.degree_events} degree dates, ${res.new_initiates} new Initiates, ${res.review_tasks} review tasks.`,
      revalidate: [`/imports/${i.batch_id}`, "/imports"],
    };
  },
  { permission: ["imports.approve"] },
);

export const cancelImport = defineAction(
  z.object({ batch_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("import_cancel", { p_batch: i.batch_id }));
    return { message: "Import cancelled. Nothing was changed.", revalidate: [`/imports/${i.batch_id}`, "/imports"] };
  },
  { permission: ["imports.run"] },
);

export const deleteTemplate = defineAction(
  z.object({ template_id: zf.uuid() }),
  async (i, { db }) => {
    const { count } = await db.from("import_batches").select("id", { count: "exact", head: true }).eq("template_id", i.template_id);
    if (count) throw new UserError("This template has been used by earlier imports and is kept for their history.");
    check(await db.from("import_templates").delete().eq("id", i.template_id));
    return { message: "Template removed.", revalidate: ["/imports"] };
  },
  { permission: ["imports.run"] },
);
