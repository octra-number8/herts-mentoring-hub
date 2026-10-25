import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export class EmailSendError extends Error {
  constructor(message: string, public retryable = true) { super(message); }
}

export const memoryOutbox: OutgoingEmail[] = [];

/**
 * Sends one email through the configured driver:
 *  - smtp: local development capture (Mailpit in the Supabase stack)
 *  - resend: production, requires RESEND_API_KEY and a verified domain
 *  - memory: unit tests
 * EMAIL_SIMULATE_FAILURES=1 makes addresses ending @fail.test fail, to test recovery.
 */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const env = serverEnv();
  if (process.env.EMAIL_SIMULATE_FAILURES === "1" && email.to.endsWith("@fail.test")) {
    throw new EmailSendError("Simulated delivery failure");
  }
  if (env.emailDriver === "memory") {
    memoryOutbox.push(email);
    return { id: `memory-${memoryOutbox.length}` };
  }
  if (env.emailDriver === "resend") {
    if (!env.resendApiKey) throw new EmailSendError("Resend is not configured (RESEND_API_KEY missing)", false);
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send(
      {
        from: env.emailFrom,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: email.replyTo ?? undefined,
        headers: email.headers,
        attachments: email.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey.slice(0, 256) } : undefined,
    );
    if (error || !data) {
      const name = (error as { name?: string } | null)?.name ?? "";
      const retryable = !["validation_error", "invalid_from_address", "missing_required_field"].includes(name);
      throw new EmailSendError(error?.message ?? "Resend send failed", retryable);
    }
    return { id: data.id };
  }
  const transport = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: false });
  try {
    const info = await transport.sendMail({
      from: env.emailFrom, to: email.to, subject: email.subject, html: email.html, text: email.text,
      replyTo: email.replyTo ?? undefined, headers: email.headers, attachments: email.attachments,
    });
    return { id: info.messageId };
  } catch (e) {
    throw new EmailSendError(`SMTP send failed: ${(e as Error).message}`);
  }
}
