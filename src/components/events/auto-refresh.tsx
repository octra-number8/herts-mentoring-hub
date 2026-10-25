"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Refreshes server-rendered data on an interval (live counts on the presenter screen). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-navy-800" />
      Update counts every {seconds} seconds
    </label>
  );
}
