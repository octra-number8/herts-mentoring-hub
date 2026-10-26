/** Central access to environment settings. Server-only values never reach the browser. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};

export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    orgSlug: process.env.ORG_SLUG ?? "herts",
    appUrl: (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, ""),
    emailDriver: (process.env.EMAIL_DRIVER ?? "smtp") as "smtp" | "resend" | "memory",
    emailFrom: process.env.EMAIL_FROM ?? "Hertfordshire Mentoring Hub <hub@localhost>",
    smtpHost: process.env.SMTP_HOST ?? "127.0.0.1",
    smtpPort: Number(process.env.SMTP_PORT ?? 55425),
    resendApiKey: process.env.RESEND_API_KEY,
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    cronSecret: process.env.CRON_SECRET,
    octraApiBase: process.env.OCTRA_API_BASE,
    octraApiKey: process.env.OCTRA_API_KEY,
  };
}
