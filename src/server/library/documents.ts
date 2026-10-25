import "server-only";
import type { DB } from "../supabase";

export const CLASSIFICATIONS = [
  { value: "learning", label: "Academy learners", hint: "Approved learning material for all learners" },
  { value: "mentors", label: "Mentors", hint: "Lodge and Personal Mentors and the Provincial team" },
  { value: "internal", label: "Provincial team", hint: "Provincial team only" },
  { value: "leadership", label: "Leadership only", hint: "Provincial leadership only" },
] as const;
export const classificationLabel = (c: string) => CLASSIFICATIONS.find((x) => x.value === c)?.label ?? c;

export const ARTICLE_KINDS = [
  { value: "faq", label: "Frequently asked question" },
  { value: "guidance", label: "Guidance" },
  { value: "example", label: "Practical example" },
  { value: "good_practice", label: "Approved good practice" },
  { value: "training", label: "Training resource" },
] as const;
export const articleKindLabel = (k: string) => ARTICLE_KINDS.find((x) => x.value === k)?.label ?? k;

export const AUDIENCES = [
  { value: "learning", label: "Academy learners" },
  { value: "mentors", label: "Mentors" },
  { value: "internal", label: "Provincial team" },
] as const;

export type AckDoc = { id: string; requires_ack: boolean; renew_ack_on_revision: boolean; current_version_id: string | null };

/**
 * Whether the caller still needs to acknowledge each document. Acknowledgement
 * is recorded against a precise version; when a document asks for renewed
 * acknowledgement on revision, only the current version counts.
 */
export async function pendingAcknowledgements(db: DB, personId: string, docs: AckDoc[]): Promise<Set<string>> {
  const needing = docs.filter((d) => d.requires_ack && d.current_version_id);
  if (!needing.length) return new Set();
  const { data: versions } = await db.from("document_versions").select("id, document_id").in("document_id", needing.map((d) => d.id));
  const allVersionIds = (versions ?? []).map((v) => v.id);
  const { data: acks } = allVersionIds.length
    ? await db.from("document_acknowledgements").select("document_version_id").eq("person_id", personId).in("document_version_id", allVersionIds)
    : { data: [] };
  const acked = new Set((acks ?? []).map((a) => a.document_version_id));
  const docOfVersion = new Map((versions ?? []).map((v) => [v.id, v.document_id]));
  const ackedDocs = new Set([...acked].map((v) => docOfVersion.get(v)));
  return new Set(needing.filter((d) => (d.renew_ack_on_revision ? !acked.has(d.current_version_id!) : !ackedDocs.has(d.id))).map((d) => d.id));
}

/** Storage-safe file name, keeping the extension. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.-]+/, "").slice(-120);
  return cleaned || "document";
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "article";
}

export const ALLOWED_TYPES = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "image/png", "image/jpeg", "application/rtf", "application/vnd.oasis.opendocument.text",
];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
