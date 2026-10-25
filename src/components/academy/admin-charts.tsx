"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type MonthPoint = { month: string; enrolments: number; completions: number };

/** Enrolments and completions by month. The same numbers are listed in a table beside it. */
export function MonthlyActivityChart({ data }: { data: MonthPoint[] }) {
  return (
    <figure>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#dbe3ec" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "#dbe3ec" }} tick={{ fill: "#5d6b7a", fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#5d6b7a", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "#f2f7fc" }} contentStyle={{ borderRadius: 6, borderColor: "#dbe3ec", fontSize: 13, color: "#1d2733" }} />
            <Legend wrapperStyle={{ fontSize: 13, color: "#3d4a57" }} iconType="square" />
            <Bar dataKey="enrolments" name="Enrolments" fill="#003668" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="completions" name="Completions" fill="#1b8e90" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Enrolments and completions by month. The figures are listed in the table that follows.</figcaption>
    </figure>
  );
}
