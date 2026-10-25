import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { runAllJobs } from "@/server/jobs";

export const maxDuration = 60;

/** Scheduled processing (Vercel Cron or Supabase pg_cron). Requires the cron secret. */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await runAllJobs();
  return NextResponse.json(result);
}
