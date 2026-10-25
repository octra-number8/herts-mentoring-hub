import { execSync } from "node:child_process";

/** Every test run starts from a clean, freshly seeded local database. */
export default function setup() {
  if (process.env.SKIP_DB_RESET === "1") return;
  execSync("npx supabase db reset", { stdio: "ignore" });
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
}
