import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DB } from "../supabase";

const NAVY = rgb(0, 0.212, 0.408);
const TEAL = rgb(0.082, 0.478, 0.486);
const SLATE = rgb(0.239, 0.29, 0.341);

const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A4 landscape branded certificate. */
export async function renderCertificatePdf(c: { learner_name: string; title: string; completed_on: string; reference: string; kind: string; orgName: string; recognition_reason?: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate ${c.reference}`);
  pdf.setAuthor(c.orgName);
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const shield = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/brand/shield-256.png")));

  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: NAVY, borderWidth: 2 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: TEAL, borderWidth: 0.75 });

  const sh = shield.scale(0.32);
  page.drawImage(shield, { x: width / 2 - sh.width / 2, y: height - 70 - sh.height, width: sh.width, height: sh.height });

  const centre = (text: string, y: number, font: typeof sans, size: number, color = NAVY) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: width / 2 - w / 2, y, size, font, color });
  };
  let y = height - 70 - sh.height - 34;
  centre(c.orgName.toUpperCase(), y, serif, 15); y -= 20;
  centre("HERTS MENTORING ACADEMY", y, sans, 10, TEAL); y -= 44;
  centre(c.kind === "event" ? "Certificate of Attendance" : c.kind === "recognition" ? "Certificate of Recognition" : "Certificate of Completion", y, serifBold, 30); y -= 34;
  centre("This is to certify that", y, serif, 14, SLATE); y -= 38;

  let nameSize = 30;
  while (serifBold.widthOfTextAtSize(c.learner_name, nameSize) > width - 160 && nameSize > 16) nameSize -= 1;
  centre(c.learner_name, y, serifBold, nameSize); y -= 30;
  centre(c.kind === "event" ? "attended" : c.kind === "recognition" ? "is recognised for" : "has successfully completed", y, serif, 14, SLATE); y -= 32;

  let titleSize = 20;
  while (serif.widthOfTextAtSize(c.title, titleSize) > width - 160 && titleSize > 12) titleSize -= 1;
  centre(c.title, y, serif, titleSize); y -= 30;
  centre(`on ${longDate(c.completed_on)}`, y, serif, 13, SLATE);

  page.drawText("Prepare · Guide · Support · Enlighten".replace(/·/g, "-"), { x: 60, y: 58, size: 9, font: sans, color: TEAL });
  const ref = `Certificate reference ${c.reference}`;
  page.drawText(ref, { x: width - 60 - sans.widthOfTextAtSize(ref, 9), y: 58, size: 9, font: sans, color: SLATE });
  return pdf.save();
}

/** Generate and store the PDF for a certificate if it has not been stored yet. */
export async function ensureCertificateFile(db: DB, certificateId: string): Promise<string | null> {
  const { data: c } = await db.from("certificates").select("*, organisations(name)").eq("id", certificateId).single();
  if (!c || c.revoked_at) return null;
  if (c.storage_path) return c.storage_path;
  const bytes = await renderCertificatePdf({ ...c, orgName: (c.organisations as unknown as { name: string }).name });
  const storagePath = `${c.org_id}/${c.person_id}/${c.reference}.pdf`;
  const { error } = await db.storage.from("certificates").upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  await db.from("certificates").update({ storage_path: storagePath }).eq("id", certificateId);
  return storagePath;
}
