"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, safeFileName, slugify } from "@/server/library/documents";

const CLASS = z.enum(["learning", "mentors", "internal", "leadership"]);

const docFields = {
  title: zf.required("Title", 200),
  summary: zf.optionalText(2000),
  category_id: zf.uuid("Category"),
  classification: CLASS,
  owner_person_id: zf.optionalUuid(),
  requires_ack: zf.checkbox(),
  renew_ack_on_revision: zf.checkbox(),
  review_on: zf.optionalDate(),
};

export const createDocument = defineAction(
  z.object({ reference: zf.required("Reference", 30), ...docFields }),
  async (i, { db, session }) => {
    const doc = check(await db.from("documents").insert({
      org_id: session.orgId, reference: i.reference.toUpperCase(), title: i.title, summary: i.summary ?? "", category_id: i.category_id,
      classification: i.classification, owner_person_id: i.owner_person_id ?? session.personId, requires_ack: i.requires_ack,
      renew_ack_on_revision: i.renew_ack_on_revision, review_on: i.review_on,
    }).select("id").single());
    return { message: "Document created. Upload the first draft next.", redirect: `/library/${doc.id}?done=created`, revalidate: ["/library"] };
  },
  { permission: ["docs.manage"] },
);

export const updateDocument = defineAction(
  z.object({ document_id: zf.uuid(), ...docFields }),
  async (i, { db }) => {
    const { document_id, summary, ...rest } = i;
    const res = await db.from("documents").update({ ...rest, summary: summary ?? "" }).eq("id", document_id).select("id");
    if (!check(res).length) throw new UserError("You cannot edit this document.");
    return { message: "Document details saved.", revalidate: [`/library/${document_id}`, "/library"] };
  },
  { permission: ["docs.manage"] },
);

export const setReviewDate = defineAction(
  z.object({ document_id: zf.uuid(), review_on: zf.optionalDate() }),
  async (i, { db }) => {
    const res = await db.from("documents").update({ review_on: i.review_on }).eq("id", i.document_id).select("id");
    if (!check(res).length) throw new UserError("You cannot edit this document.");
    return { message: i.review_on ? "Review date set." : "Review date cleared.", revalidate: [`/library/${i.document_id}`, "/library"] };
  },
  { permission: ["docs.manage"] },
);

export const archiveDocument = defineAction(
  z.object({ document_id: zf.uuid(), restore: zf.checkbox() }),
  async (i, { db }) => {
    const res = await db.from("documents").update({ archived_at: i.restore ? null : new Date().toISOString() }).eq("id", i.document_id).select("id");
    if (!check(res).length) throw new UserError("You cannot change this document.");
    return { redirect: `/library/${i.document_id}?done=${i.restore ? "restored" : "doc_archived"}`, revalidate: [`/library/${i.document_id}`, "/library"] };
  },
  { permission: ["docs.manage"] },
);

/**
 * Upload a file as a new draft version (or attach it to an existing draft).
 * The version row is created first, then the file is stored at
 * <org>/<document>/<version>/<file> through the user's own storage access.
 */
export const uploadVersion = defineAction(
  z.object({
    document_id: zf.uuid(),
    version_id: zf.optionalUuid(),
    version_label: zf.optionalText(120),
    change_summary: zf.optionalText(2000),
    file: z.instanceof(File, { message: "Choose a file to upload" }),
  }),
  async (i, { db, session }) => {
    if (!i.file.size) throw new UserError("Choose a file to upload.");
    if (i.file.size > MAX_UPLOAD_BYTES) throw new UserError("Files must be 25 MB or smaller.");
    const type = i.file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.includes(type)) throw new UserError("Upload a PDF, Word, Excel, PowerPoint, text or image file.");
    const { data: doc } = await db.from("documents").select("id").eq("id", i.document_id).maybeSingle();
    if (!doc) throw new UserError("Document not found.");

    let versionId = i.version_id;
    if (versionId) {
      const { data: v } = await db.from("document_versions").select("status").eq("id", versionId).eq("document_id", i.document_id).maybeSingle();
      if (v?.status !== "draft") throw new UserError("Files can only be replaced on a draft version.");
    } else {
      if (!i.version_label) throw new UserError("Give the version a label, for example \"Issue 2, November 2026\".");
      const { data: last } = await db.from("document_versions").select("version_no").eq("document_id", i.document_id).order("version_no", { ascending: false }).limit(1).maybeSingle();
      const v = check(await db.from("document_versions").insert({
        org_id: session.orgId, document_id: i.document_id, version_no: (last?.version_no ?? 0) + 1, version_label: i.version_label, change_summary: i.change_summary, status: "draft",
      }).select("id").single());
      versionId = v.id;
    }
    const path = `${session.orgId}/${i.document_id}/${versionId}/${Date.now().toString(36)}-${safeFileName(i.file.name)}`;
    const up = await db.storage.from("documents").upload(path, i.file, { contentType: type, upsert: false });
    if (up.error) throw new UserError("The file could not be stored. Please try again.");
    const patch: { storage_path: string; file_name: string; mime_type: string; size_bytes: number; change_summary?: string | null } = { storage_path: path, file_name: i.file.name.slice(0, 200), mime_type: type, size_bytes: i.file.size };
    if (i.version_id && i.change_summary) patch.change_summary = i.change_summary;
    const res = await db.from("document_versions").update(patch).eq("id", versionId!).select("id");
    if (!check(res).length) throw new UserError("The version could not be updated.");
    return { message: "Draft uploaded. Submit it for review when ready.", revalidate: [`/library/${i.document_id}`] };
  },
  { permission: ["docs.manage"] },
);

export const transitionVersion = defineAction(
  z.object({ document_id: zf.uuid(), version_id: zf.uuid(), to: z.enum(["draft", "review", "approved", "published", "archived"]), note: zf.optionalText(1000), back: z.enum(["approvals"]).optional() }),
  async (i, { db }) => {
    check(await db.rpc("document_transition_version", { p_version: i.version_id, p_to: i.to, p_note: i.note ?? undefined }));
    kickJobs();
    const msg = {
      review: "Submitted for review. Approvers have been notified.", draft: "Returned to draft with your note.", approved: "Version approved. It can now be published.",
      published: "Published. The previous issue has been superseded.", archived: "Version archived.",
    }[i.to];
    return { message: msg, redirect: i.back === "approvals" ? `/library/approvals?done=${i.to}` : `/library/${i.document_id}?done=${i.to}`, revalidate: [`/library/${i.document_id}`, "/library", "/library/approvals"] };
  },
);

export const acknowledgeDocument = defineAction(
  z.object({ document_id: zf.uuid(), version_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("document_acknowledge", { p_version: i.version_id }));
    // The acknowledge button is replaced by a confirmation on the page once recorded.
    return { message: "Thank you. Your acknowledgement of this issue has been recorded.", revalidate: [`/library/${i.document_id}`, "/library", "/academy/resources"] };
  },
);

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

const articleFields = {
  title: zf.required("Title", 200),
  kind: z.enum(["faq", "guidance", "example", "good_practice", "training"]),
  audience: z.enum(["learning", "mentors", "internal"]),
  body_markdown: zf.required("Content", 50000),
  tags: zf.optionalText(300),
  anonymisation_confirmed: zf.checkbox(),
};
const tagList = (t: string | null) => (t ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 12);

export const createArticle = defineAction(
  z.object(articleFields),
  async (i, { db, session }) => {
    const base = slugify(i.title);
    const { data: taken } = await db.from("knowledge_articles").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((t) => t.slug));
    let slug = base, n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    check(await db.from("knowledge_articles").insert({
      org_id: session.orgId, slug, title: i.title, kind: i.kind, audience: i.audience, body_markdown: i.body_markdown, tags: tagList(i.tags),
      anonymisation_confirmed: i.kind === "example" ? i.anonymisation_confirmed : false, status: "draft",
    }));
    return { message: "Draft saved.", redirect: `/library/knowledge/${slug}?done=saved`, revalidate: ["/library/knowledge"] };
  },
  { permission: ["knowledge.manage"] },
);

export const updateArticle = defineAction(
  z.object({ id: zf.uuid(), ...articleFields }),
  async (i, { db, session }) => {
    const { data: a } = await db.from("knowledge_articles").select("slug, status").eq("id", i.id).maybeSingle();
    if (!a) throw new UserError("Article not found.");
    // Changing a published article sends it back for approval unless the editor is an approver.
    const status = a.status === "published" && !session.permissions.has("docs.approve") ? "draft" : a.status;
    if (status === "published" && i.kind === "example" && !i.anonymisation_confirmed) throw new UserError("Confirm the example is anonymised: it is published.");
    const res = await db.from("knowledge_articles").update({
      title: i.title, kind: i.kind, audience: i.audience, body_markdown: i.body_markdown, tags: tagList(i.tags), status,
      anonymisation_confirmed: i.kind === "example" ? i.anonymisation_confirmed : false,
    }).eq("id", i.id).select("id");
    if (!check(res).length) throw new UserError("You cannot edit this article.");
    return { message: status !== a.status ? "Saved. The article has returned to draft for approval." : "Article saved.", redirect: `/library/knowledge/${a.slug}?done=${status !== a.status ? "saved_draft" : "saved"}`, revalidate: ["/library/knowledge", `/library/knowledge/${a.slug}`] };
  },
  { permission: ["knowledge.manage"] },
);

export const articleTransition = defineAction(
  z.object({ id: zf.uuid(), slug: z.string(), to: z.enum(["draft", "review", "published", "archived"]), back: z.enum(["approvals"]).optional() }),
  async (i, { db }) => {
    if (i.to === "published") {
      check(await db.rpc("knowledge_publish", { p_article: i.id }));
    } else {
      const res = await db.from("knowledge_articles").update({ status: i.to }).eq("id", i.id).select("id");
      if (!check(res).length) throw new UserError("You cannot change this article.");
    }
    const msg = { draft: "Returned to draft.", review: "Submitted for review.", published: "Article published.", archived: "Article archived." }[i.to];
    return { message: msg, redirect: i.back === "approvals" ? `/library/approvals?done=article_${i.to}` : `/library/knowledge/${i.slug}?done=${i.to}`, revalidate: ["/library/knowledge", `/library/knowledge/${i.slug}`, "/library/approvals"] };
  },
  { permission: ["knowledge.manage", "docs.approve"] },
);
