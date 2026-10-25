import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/session";
import { supabaseServer, supabaseService } from "@/server/supabase";

/**
 * Download a document version. The version is first read through the user's
 * own client, so RLS decides (classification, status, archive). Only then is a
 * short-lived signed URL issued for exactly that version's stored file.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: v } = await db.from("document_versions").select("id, storage_path, file_name").eq("id", versionId).maybeSingle();
  if (!v?.storage_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: signed, error } = await supabaseService().storage.from("documents").createSignedUrl(v.storage_path, 60, { download: v.file_name ?? true });
  if (error || !signed) return NextResponse.json({ error: "The file is not available" }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
