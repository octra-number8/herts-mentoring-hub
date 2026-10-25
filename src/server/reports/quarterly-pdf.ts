import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { QUARTERLY_SECTIONS, type PeriodData } from "./analysis";
import { keyFigures, quarterlyCharts } from "./quarterly";

const NAVY = rgb(0, 0.212, 0.408);
const TEAL = rgb(0.055, 0.616, 0.549);
const BLUE = rgb(0.122, 0.388, 0.659);
const INK = rgb(0.11, 0.15, 0.2);
const MUTED = rgb(0.36, 0.42, 0.48);
const LINE = rgb(0.86, 0.89, 0.93);

/** Standard fonts only cover WinAnsi: replace anything else. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");

/** Branded A4 PDF: narrative, key figures with the previous quarter, and simple bar charts. */
export async function quarterlyPdf(opts: {
  orgName: string; year: number; quarter: number; status: string; data: PeriodData; narrative: Record<string, string>; generatedAt?: string | null; approvedAt?: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Quarterly report Q${opts.quarter} ${opts.year}`);
  pdf.setAuthor(opts.orgName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;

  const footer = () => {
    page.drawLine({ start: { x: M, y: 36 }, end: { x: W - M, y: 36 }, thickness: 0.5, color: LINE });
    page.drawText(safe(`${opts.orgName} · Quarterly report Q${opts.quarter} ${opts.year} · ${opts.status === "published" || opts.status === "approved" ? "Approved" : "Draft for review"}`), { x: M, y: 24, size: 8, font, color: MUTED });
    page.drawText(`Page ${pageNo}`, { x: W - M - 36, y: 24, size: 8, font, color: MUTED });
  };
  const newPage = () => { footer(); page = pdf.addPage([W, H]); pageNo++; y = H - M; page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY }); };
  const need = (h: number) => { if (y - h < 56) newPage(); };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of safe(text).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
    }
    return lines;
  };
  const para = (text: string, size = 10, f = font, color = INK) => {
    for (const l of wrap(text, f, size, W - 2 * M)) { need(size + 4); page.drawText(l, { x: M, y: y - size, size, font: f, color }); y -= size + 4; }
  };
  const heading = (text: string) => { need(30); y -= 8; page.drawText(safe(text), { x: M, y: y - 13, size: 13, font: bold, color: NAVY }); y -= 22; };

  // Cover band
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: NAVY });
  page.drawText(safe(opts.orgName), { x: M, y: H - 50, size: 11, font, color: rgb(0.87, 0.91, 0.96) });
  page.drawText(safe(`Provincial Mentoring Quarterly Report`), { x: M, y: H - 78, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(`Quarter ${opts.quarter} ${opts.year}${opts.data.period ? ` (${fmt(opts.data.period.start)} to ${fmt(opts.data.period.end)})` : ""}`), { x: M, y: H - 100, size: 11, font, color: rgb(0.87, 0.91, 0.96) });
  y = H - 150;
  para(`Status: ${opts.status === "published" ? "Published" : opts.status === "approved" ? "Approved" : opts.status === "review" ? "In review" : "Draft"}.${opts.generatedAt ? ` Figures taken ${fmt(opts.generatedAt)}.` : ""}${opts.approvedAt ? ` Approved ${fmt(opts.approvedAt)}.` : ""}`, 9, font, MUTED);
  para("Figures are a snapshot taken when the report was generated. Membership figures depend on the imports received and may be partial.", 9, font, MUTED);

  for (const s of QUARTERLY_SECTIONS) {
    const text = opts.narrative[s.key];
    if (!text) continue;
    heading(s.label);
    para(text);
  }

  // Key figures table
  heading("Key figures");
  const figures = keyFigures(opts.data);
  const colX = [M, W - M - 170, W - M - 70];
  need(18);
  page.drawText("Measure", { x: colX[0], y: y - 10, size: 9, font: bold, color: MUTED });
  page.drawText("This quarter", { x: colX[1], y: y - 10, size: 9, font: bold, color: MUTED });
  page.drawText("Previous", { x: colX[2], y: y - 10, size: 9, font: bold, color: MUTED });
  y -= 16;
  let lastSection = "";
  for (const f of figures) {
    if (f.section !== lastSection) { need(18); y -= 4; page.drawText(safe(f.section), { x: M, y: y - 10, size: 9.5, font: bold, color: NAVY }); y -= 15; lastSection = f.section; }
    need(14);
    page.drawText(safe(f.label), { x: colX[0] + 8, y: y - 9, size: 9.5, font, color: INK });
    page.drawText(String(f.value), { x: colX[1], y: y - 9, size: 9.5, font: bold, color: INK });
    page.drawText(f.previous === null || f.previous === undefined ? "-" : String(f.previous), { x: colX[2], y: y - 9, size: 9.5, font, color: MUTED });
    page.drawLine({ start: { x: M, y: y - 13 }, end: { x: W - M, y: y - 13 }, thickness: 0.3, color: LINE });
    y -= 14;
  }

  // Charts: horizontal bars, previous and current, with values printed (never colour alone).
  for (const c of quarterlyCharts(opts.data)) {
    const rows = c.data;
    if (!rows.length) continue;
    const twoSeries = c.series.length > 1;
    const rowH = twoSeries ? 26 : 16;
    need(rows.length * rowH + 60); // keep the heading with its chart
    heading(c.title);
    const max = Math.max(1, ...rows.flatMap((r) => c.series.map((s) => Number(r[s.key] ?? 0))));
    const labelW = 130, barW = W - 2 * M - labelW - 40;
    for (const r of rows) {
      page.drawText(safe(String(r[c.x] ?? "")).slice(0, 28), { x: M, y: y - 10, size: 9, font, color: INK });
      c.series.forEach((s, i) => {
        const val = Number(r[s.key] ?? 0);
        const by = y - 11 - i * 11;
        const w = Math.max(1, (val / max) * barW);
        page.drawRectangle({ x: M + labelW, y: by, width: w, height: 9, color: twoSeries && i === 0 ? BLUE : TEAL });
        page.drawText(r[s.key] === null || r[s.key] === undefined ? "n/a" : String(val), { x: M + labelW + w + 4, y: by + 1, size: 8, font, color: INK });
      });
      y -= rowH;
    }
    if (twoSeries) {
      need(16);
      page.drawRectangle({ x: M + labelW, y: y - 9, width: 9, height: 9, color: BLUE });
      page.drawText(safe(c.series[0].label), { x: M + labelW + 13, y: y - 8, size: 8, font, color: MUTED });
      page.drawRectangle({ x: M + labelW + 120, y: y - 9, width: 9, height: 9, color: TEAL });
      page.drawText(safe(c.series[1].label), { x: M + labelW + 133, y: y - 8, size: 8, font, color: MUTED });
      y -= 16;
    }
  }
  footer();
  return pdf.save();
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}
