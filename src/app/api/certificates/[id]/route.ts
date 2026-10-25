import { NextResponse, type NextRequest } from "next/server";
import { fileResponse } from "@/server/export/format";
import { ensureCertificateFile } from "@/server/pdf/certificate";
import { getSession } from "@/server/session";
import { supabaseServer, supabaseService } from "@/server/supabase";

/**
 * Certificate download. The certificate is first read through the user's
 * client, so RLS decides who may have it (the learner, or learning
 * administrators). Only then does the service role render or fetch the file.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = await supabaseServer();
  const { data: cert } = await db.from("certificates").select("id, reference, revoked_at").eq("id", id).maybeSingle();
  if (!cert || cert.revoked_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const svc = supabaseService();
  const path = await ensureCertificateFile(svc, cert.id);
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: file, error } = await svc.storage.from("certificates").download(path);
  if (error || !file) return NextResponse.json({ error: "The certificate could not be prepared. Please try again shortly." }, { status: 503 });
  return fileResponse(new Uint8Array(await file.arrayBuffer()), `Certificate ${cert.reference}.pdf`, "application/pdf");
}
