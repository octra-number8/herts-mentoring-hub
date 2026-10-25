import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Column = { key: string; label: string; type?: "text" | "number" | "date" | "boolean"; width?: number };
export type Row = Record<string, unknown>;

const cell = (v: unknown, type?: Column["type"]) => {
  if (v === null || v === undefined) return "";
  if (type === "date" && typeof v === "string") return new Date(v).toLocaleDateString("en-GB");
  if (type === "boolean") return v ? "Yes" : "No";
  return String(v);
};

export function toCsv(columns: Column[], rows: Row[]): string {
  const esc = (s: string) => {
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(cell(r[c.key], c.type))).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(title: string, columns: Column[], rows: Row[], meta?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hertfordshire Mentoring Hub";
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: "FF003668" } };
  ws.addRow([meta ?? `Generated ${new Date().toLocaleString("en-GB")}`]).font = { italic: true, color: { argb: "FF5D6B7A" } };
  ws.addRow([]);
  const header = ws.addRow(columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003668" } }; });
  for (const r of rows) {
    ws.addRow(columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return null;
      if (c.type === "number") return Number(v);
      if (c.type === "date") return new Date(String(v));
      if (c.type === "boolean") return v ? "Yes" : "No";
      return String(v);
    }));
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.min(40, Math.max(12, c.label.length + 4));
    if (c.type === "date") col.numFmt = "dd mmm yyyy";
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Paginated A4 landscape table with branded header. */
export async function toPdfTable(title: string, columns: Column[], rows: Row[], meta?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36, size = 8.5, lineH = 14;
  const widths = columns.map((c) => c.width ?? 1);
  const total = widths.reduce((a, b) => a + b, 0);
  const colW = widths.map((w) => ((W - 2 * M) * w) / total);
  const clip = (s: string, w: number, f = font) => {
    // Standard fonts only cover WinAnsi; replace other characters.
    let t = s.replace(/[^\x20-\x7E -ÿ]/g, "?");
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > w - 6) t = t.slice(0, -2) + "…".replace("…", ".");
    return t;
  };
  let page = pdf.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: rgb(0, 0.212, 0.408) });
    page.drawText(clip(title, W - 2 * M, bold), { x: M, y: y - 12, size: 14, font: bold, color: rgb(0, 0.212, 0.408) });
    page.drawText(meta ?? `Generated ${new Date().toLocaleString("en-GB")}`, { x: M, y: y - 28, size: 8, font, color: rgb(0.36, 0.42, 0.48) });
    y -= 48;
    let x = M;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: lineH + 2, color: rgb(0.95, 0.97, 0.99) });
    columns.forEach((c, i) => { page.drawText(clip(c.label, colW[i], bold), { x: x + 3, y, size, font: bold, color: rgb(0.11, 0.15, 0.2) }); x += colW[i]; });
    y -= lineH + 2;
  };
  const footer = () => page.drawText(`Page ${pageNo}`, { x: W - M - 40, y: 20, size: 8, font, color: rgb(0.36, 0.42, 0.48) });
  header();
  for (const r of rows) {
    if (y < M + 20) { footer(); page = pdf.addPage([W, H]); pageNo++; y = H - M; header(); }
    let x = M;
    columns.forEach((c, i) => { page.drawText(clip(cell(r[c.key], c.type), colW[i]), { x: x + 3, y, size, font, color: rgb(0.11, 0.15, 0.2) }); x += colW[i]; });
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.3, color: rgb(0.86, 0.89, 0.93) });
    y -= lineH;
  }
  if (rows.length === 0) page.drawText("No records match these filters.", { x: M, y, size: 10, font });
  footer();
  return pdf.save();
}

export function fileResponse(body: BodyInit, filename: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\- ]/g, "_")}"`, "Cache-Control": "no-store" } });
}
