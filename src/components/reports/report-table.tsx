import type { Column, Row } from "@/server/export/format";
import { EmptyState } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export function formatCell(v: unknown, type?: Column["type"], key = ""): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "date") return formatDate(String(v));
  if (type === "boolean") return v ? "Yes" : "No";
  if (type === "number") return typeof v === "number" && !/number$/.test(key) ? v.toLocaleString("en-GB") : String(v);
  return String(v);
}

/** A plain, scrollable report table. Large results are capped on screen; exports include every row. */
export function ReportTable({ columns, rows, caption, limit = 500 }: { columns: Column[]; rows: Row[]; caption: string; limit?: number }) {
  if (!rows.length) return <EmptyState title="No records match these filters">Try a wider date range or clear a filter.</EmptyState>;
  const shown = rows.slice(0, limit);
  return (
    <>
      <Table caption={caption}>
        <THead>{columns.map((c) => <TH key={c.key} align={c.type === "number" ? "right" : undefined}>{c.label}</TH>)}</THead>
        <TBody>
          {shown.map((r, i) => (
            <TR key={i}>
              {columns.map((c) => <TD key={c.key} align={c.type === "number" ? "right" : undefined} className={c.type === "text" || !c.type ? "max-w-xs" : "whitespace-nowrap"}>{formatCell(r[c.key], c.type, c.key)}</TD>)}
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="mt-2 text-sm text-muted">
        {rows.length} {rows.length === 1 ? "record" : "records"}{rows.length > limit ? `. The first ${limit} are shown here; exports include every record.` : "."}
      </p>
    </>
  );
}

/** Export menu for a registered dataset (CSV, Excel, PDF), carrying the current filters. */
export function ExportMenu({ dataset, query }: { dataset: string; query: string }) {
  return (
    <details className="relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Export</summary>
      <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-white py-1 shadow-lg">
        {(["csv", "xlsx", "pdf"] as const).map((f) => (
          <a key={f} href={`/api/export/${dataset}?${query}${query ? "&" : ""}format=${f}`} className="block px-4 py-2 text-sm hover:bg-navy-50">{{ csv: "CSV", xlsx: "Excel", pdf: "PDF" }[f]}</a>
        ))}
      </div>
    </details>
  );
}
