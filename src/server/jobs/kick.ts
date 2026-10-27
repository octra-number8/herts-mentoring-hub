import "server-only";
import { after } from "next/server";
import { runAllJobs } from "./index";

let running = false;
let startedAt = 0;
let again = false;
// A run that never finished (an instance frozen mid-run) stops blocking kicks after this.
const STALE_MS = 120_000;

/**
 * Run background processing shortly after the response is sent, so emails and
 * notifications follow user actions promptly. The scheduled cron remains the
 * guarantee; this only shortens the wait. Kicks are coalesced: at most one run
 * per server instance at a time, plus one more if kicks arrived during it, so
 * a burst of requests cannot start a burst of job runs.
 */
export function kickJobs() {
  if (running && Date.now() - startedAt < STALE_MS) { again = true; return; }
  running = true;
  startedAt = Date.now();
  after(async () => {
    try {
      // At most one follow-up run, so a busy instance cannot keep one request alive indefinitely.
      for (let i = 0; i < 2; i++) {
        again = false;
        try {
          await runAllJobs();
        } catch (e) {
          console.error("Background jobs failed", e);
        }
        if (!again) break;
      }
    } finally {
      running = false;
    }
  });
}
