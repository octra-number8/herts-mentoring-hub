import "server-only";
import { after } from "next/server";
import { runAllJobs } from "./index";

/**
 * Run background processing shortly after the response is sent, so emails and
 * notifications follow user actions promptly. The scheduled cron remains the
 * guarantee; this only shortens the wait.
 */
export function kickJobs() {
  after(async () => {
    try {
      await runAllJobs();
    } catch (e) {
      console.error("Background jobs failed", e);
    }
  });
}
