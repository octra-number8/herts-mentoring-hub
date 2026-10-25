/**
 * Copies every object in every Storage bucket to a local folder, or restores one.
 * Database backups do not include Storage files, so run this alongside them.
 *
 *   npx tsx scripts/storage-backup.ts backup  <dir>
 *   npx tsx scripts/storage-backup.ts restore <dir>
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from the environment
 * (.env.local by default; set ENV_FILE to use another file).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (data.length < 1000) break;
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

async function backup(dir: string) {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw error;
  const manifest: { bucket: string; path: string; bytes: number; sha256: string }[] = [];
  for (const b of buckets) {
    for (const path of await listAll(b.id)) {
      const { data, error: e } = await db.storage.from(b.id).download(path);
      if (e) throw new Error(`${b.id}/${path}: ${e.message}`);
      const buf = Buffer.from(await data.arrayBuffer());
      const file = join(dir, b.id, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      manifest.push({ bucket: b.id, path, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") });
    }
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ created_at: new Date().toISOString(), buckets: buckets.map((b) => ({ id: b.id, public: b.public })), objects: manifest }, null, 2));
  console.log(`Backed up ${manifest.length} objects from ${buckets.length} buckets to ${dir}`);
}

async function restore(dir: string) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  for (const b of manifest.buckets) await db.storage.createBucket(b.id, { public: b.public }).catch(() => undefined);
  let n = 0;
  for (const o of manifest.objects as { bucket: string; path: string; sha256: string }[]) {
    const buf = readFileSync(join(dir, o.bucket, o.path));
    if (createHash("sha256").update(buf).digest("hex") !== o.sha256) throw new Error(`Checksum mismatch: ${o.bucket}/${o.path}`);
    const { error } = await db.storage.from(o.bucket).upload(o.path, buf, { upsert: true });
    if (error) throw new Error(`${o.bucket}/${o.path}: ${error.message}`);
    n++;
  }
  console.log(`Restored ${n} objects (checksums verified). Files not in the manifest: ${walk(dir).filter((f) => !f.endsWith("manifest.json")).length - n}`);
}

/** Restore drill only: delete every file listed in a backup manifest. Refuses hosted projects. */
async function wipe(dir: string) {
  if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("wipe is for the local restore drill only");
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { objects: { bucket: string; path: string }[] };
  for (const bucket of new Set(manifest.objects.map((o) => o.bucket))) {
    const { error } = await db.storage.from(bucket).remove(manifest.objects.filter((o) => o.bucket === bucket).map((o) => o.path));
    if (error) throw error;
  }
  console.log(`Deleted ${manifest.objects.length} objects`);
}

const [mode, dir] = process.argv.slice(2);
if (!dir || !["backup", "restore", "wipe"].includes(mode)) { console.error("Usage: storage-backup.ts backup|restore|wipe <dir>"); process.exit(2); }
(mode === "backup" ? backup(dir) : mode === "restore" ? restore(dir) : wipe(dir)).catch((e) => { console.error(e); process.exit(1); });
void relative;
