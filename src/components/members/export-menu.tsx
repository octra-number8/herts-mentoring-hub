/** Export dropdown for a registered dataset (served by /api/export/[dataset]). */
export function ExportMenu({ dataset, query }: { dataset: string; query: string }) {
  return (
    <details className="relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Export</summary>
      <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-white py-1 shadow-lg">
        {(["csv", "xlsx", "pdf"] as const).map((f) => (
          <a key={f} href={`/api/export/${dataset}?${query}${query ? "&" : ""}format=${f}`} className="block px-4 py-2 text-sm hover:bg-navy-50">
            {{ csv: "CSV", xlsx: "Excel", pdf: "PDF" }[f]}
          </a>
        ))}
      </div>
    </details>
  );
}
