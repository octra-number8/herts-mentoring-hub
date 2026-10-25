/**
 * Membership import pipeline, step 1: read a report file into header + rows.
 *
 * The pipeline is parse -> mapping -> validate -> match -> stage. Every step
 * except stage is pure, so a future approved automated source (for example an
 * authorised Hermes/Adelphi feed) can plug in at the adapter seam: produce a
 * `ParsedTable` (headers plus string rows) and hand it to the same mapping,
 * validation, matching and staging steps. Nothing downstream knows or cares
 * whether the rows came from an uploaded CSV, an Excel workbook or a feed, and
 * an approver still reviews and commits every batch.
 */
import Papa from "papaparse";

export type ParsedTable = { headers: string[]; rows: Record<string, string>[] };

export class ParseError extends Error {}

const clean = (h: string) => h.replace(/^﻿/, "").replace(/\s+/g, " ").trim();

/** Parse CSV text. The first non-empty row is the header row. */
export function parseCsv(text: string): ParsedTable {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: clean,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  if (!headers.length) throw new ParseError("The file has no header row.");
  const fatal = res.errors.find((e) => e.type === "Delimiter" && res.data.length === 0);
  if (fatal) throw new ParseError("The file could not be read as CSV.");
  const rows = res.data
    .map((r) => Object.fromEntries(headers.map((h) => [h, r[h] == null ? "" : String(r[h])])))
    .filter((r) => Object.values(r).some((v) => v !== ""));
  return { headers, rows };
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
    return "";
  }
  return String(v).trim();
}

/** Parse the first worksheet of an .xlsx workbook. Excel dates become ISO dates. */
export async function parseXlsx(data: ArrayBuffer | Uint8Array): Promise<ParsedTable> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ParseError("The file could not be read as an Excel workbook (.xlsx).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ParseError("The workbook has no worksheets.");
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) values.push(cellText(row.getCell(c).value).trim());
    grid.push(values);
  });
  const headerIdx = grid.findIndex((r) => r.filter(Boolean).length >= 2);
  if (headerIdx < 0) throw new ParseError("The worksheet has no header row.");
  const rawHeaders = grid[headerIdx].map(clean);
  const cols = rawHeaders.map((h, i) => ({ h, i })).filter((x) => x.h);
  const headers = cols.map((c) => c.h);
  const rows = grid.slice(headerIdx + 1)
    .map((r) => Object.fromEntries(cols.map((c) => [c.h, r[c.i] ?? ""])))
    .filter((r) => Object.values(r).some((v) => v !== ""));
  return { headers, rows };
}

/** Parse by file extension (CSV or Excel). */
export async function parseFile(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ParsedTable> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsx(data);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(new TextDecoder("utf-8").decode(data));
  throw new ParseError("Upload a CSV (.csv) or Excel (.xlsx) file.");
}

/**
 * Parse a date written as dd/mm/yyyy (also with - or . separators, and
 * two-digit days and months optional) or ISO yyyy-mm-dd (optionally with a
 * time). Returns an ISO date, null for an empty value, or "invalid".
 */
export function parseDate(input: string | null | undefined): string | null | "invalid" {
  const s = (input ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else return "invalid";
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1800 || y > 2200) return "invalid";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return dt.toISOString().slice(0, 10);
}
