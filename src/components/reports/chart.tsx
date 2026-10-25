"use client";

import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buttonClass } from "@/components/ui/button";

/**
 * Categorical slots, fixed order (never cycled): navy-blue, teal, amber, violet.
 * Validated with the dataviz palette checker (lightness, chroma, CVD and
 * normal-vision separation pass on a light surface). Amber is below 3:1
 * contrast, so every chart ships a legend, a text summary and a data table.
 */
export const SERIES_COLOURS = ["#1f63a8", "#0e9d8c", "#d98200", "#9b5bd0"] as const;

export type ChartSeries = { key: string; label: string };
export type ChartSpec = {
  title: string;
  /** One or two sentences that state what the chart shows, for every reader. */
  summary: string;
  type: "bar" | "stacked" | "line" | "hbar";
  data: Record<string, string | number | null>[];
  x: string;
  series: ChartSeries[];
  /** Unit suffix for values in tooltips and the table, e.g. "%". */
  unit?: string;
  height?: number;
};

const AXIS = { fontSize: 12, fill: "#5d6b7a" };

export function Chart({ spec, filename }: { spec: ChartSpec; filename?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data, series, x, type, unit } = spec;
  const height = spec.height ?? (type === "hbar" ? Math.max(180, data.length * 30 + 60) : 260);
  const multi = series.length > 1;
  const fmt = (v: unknown) => (v === null || v === undefined ? "Not available" : `${v}${unit ?? ""}`);

  const download = () => downloadPng(ref.current, spec.title, filename ?? spec.title);

  const common = { data, margin: { top: 8, right: 16, bottom: 8, left: type === "hbar" ? 8 : 0 } };
  const tooltip = <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: "rgba(29,95,140,0.06)" }} contentStyle={{ borderRadius: 6, borderColor: "#dbe3ec", fontSize: 13 }} />;
  const legend = multi ? <Legend wrapperStyle={{ fontSize: 13, color: "#3d4a57" }} iconType="square" /> : null;
  const grid = <CartesianGrid stroke="#e8edf3" vertical={false} horizontal={type !== "hbar"} />;

  let chart: React.ReactElement;
  if (type === "line") {
    chart = (
      <LineChart {...common}>
        {grid}
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dbe3ec" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        {tooltip}{legend}
        {series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={SERIES_COLOURS[i % 4]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} isAnimationActive={false} connectNulls />)}
      </LineChart>
    );
  } else if (type === "hbar") {
    chart = (
      <BarChart {...common} layout="vertical" barCategoryGap={6}>
        <CartesianGrid stroke="#e8edf3" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dbe3ec" }} width={150} />
        {tooltip}{legend}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLOURS[i % 4]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />)}
      </BarChart>
    );
  } else {
    chart = (
      <BarChart {...common} barGap={2}>
        {grid}
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: "#dbe3ec" }} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        {tooltip}{legend}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLOURS[i % 4]} stackId={type === "stacked" ? "a" : undefined}
            radius={type === "stacked" ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}
            stroke={type === "stacked" ? "#ffffff" : undefined} strokeWidth={type === "stacked" ? 1 : 0} />
        ))}
      </BarChart>
    );
  }

  return (
    <figure className="rounded-lg border border-line bg-surface p-4" aria-label={spec.title}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <figcaption>
          <span className="block text-[15px] font-semibold text-navy-900">{spec.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{spec.summary}</span>
        </figcaption>
        {data.length > 0 && <button type="button" onClick={download} className={buttonClass("subtle", "sm", "no-print")}>Download chart (PNG)</button>}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No data to chart for these filters.</p>
      ) : (
        <div ref={ref} role="img" aria-label={`${spec.title}. ${spec.summary}`}>
          <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>
        </div>
      )}
      {data.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-navy-800 underline-offset-2 hover:underline">Show the data</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{spec.title}</caption>
              <thead className="text-[13px] text-muted"><tr><th scope="col" className="py-1 pr-4 font-medium">{label(x)}</th>{series.map((s) => <th key={s.key} scope="col" className="py-1 pr-4 text-right font-medium">{s.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {data.map((d, i) => (
                  <tr key={i}><td className="py-1 pr-4">{String(d[x] ?? "")}</td>{series.map((s) => <td key={s.key} className="py-1 pr-4 text-right tabular-nums">{fmt(d[s.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Serialise the rendered SVG to a titled, white-backed PNG for presentations. */
function downloadPng(container: HTMLElement | null, title: string, filename: string) {
  const svg = container?.querySelector("svg.recharts-surface") as SVGSVGElement | null;
  if (!svg || !container) return;
  const legend = container.querySelector(".recharts-legend-wrapper") as HTMLElement | null;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const scale = 2, header = 44;
  const legendItems = legend ? [...legend.querySelectorAll("li")].map((li) => ({ text: li.textContent ?? "", colour: (li.querySelector("path, rect") as SVGElement | null)?.getAttribute("fill") ?? "#1f63a8" })) : [];
  const footer = legendItems.length ? 30 : 0;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = (width + 32) * scale;
    canvas.height = (height + header + footer + 16) * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width + 32, height + header + footer + 16);
    ctx.fillStyle = "#03294f";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(title, 16, 28);
    ctx.drawImage(img, 16, header, width, height);
    let lx = 16;
    ctx.font = "13px system-ui, sans-serif";
    for (const it of legendItems) {
      ctx.fillStyle = it.colour;
      ctx.fillRect(lx, header + height + 10, 12, 12);
      ctx.fillStyle = "#3d4a57";
      ctx.fillText(it.text, lx + 18, header + height + 21);
      lx += ctx.measureText(it.text).width + 40;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${filename.replace(/[^\w\- ]+/g, "").trim() || "chart"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}
