import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * After a reset, PostgREST reloads its schema cache asynchronously. Wait until
 * tables and functions are visible, or the seed and tests race it (PGRST002/PGRST202).
 */
async function waitForApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  for (let i = 0; i < 120; i++) {
    const [table, fn, storage] = await Promise.all([
      fetch(`${url}/rest/v1/organisations?select=id&limit=1`, { headers }).catch(() => null),
      fetch(`${url}/rest/v1/rpc/my_context`, { method: "POST", headers, body: "{}" }).catch(() => null),
      fetch(`${url}/storage/v1/bucket`, { headers }).catch(() => null),
    ]);
    // 403 means the function exists but the service role may not call it: the schema is loaded.
    if (table?.status === 200 && (fn?.status === 200 || fn?.status === 403) && storage?.status === 200) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Supabase API did not become ready after reset");
}

/** Every test run starts from a clean, freshly seeded local database. */
export default async function setup() {
  if (process.env.SKIP_DB_RESET === "1") return;
  try {
    execSync("npx supabase db reset", { stdio: "pipe" });
  } catch (e) {
    // The CLI gives up if Storage is slow to report healthy after the restart, even
    // though the reset and migrations completed. Anything else is a real failure.
    const out = `${(e as { stdout?: Buffer }).stdout ?? ""}${(e as { stderr?: Buffer }).stderr ?? ""}`;
    if (!/container is not ready/.test(out)) throw new Error(`supabase db reset failed:\n${out}`);
    console.warn("db reset: waiting for slow-starting containers");
  }
  await waitForApi();
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
  await waitForApi();
}
