import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hertfordshire Mentoring Hub", template: "%s · Mentoring Hub" },
  description: "Hertfordshire Provincial Mentoring Hub and Herts Mentoring Academy",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#003668" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request so Next.js can apply the CSP nonce set in proxy.ts.
  await connection();
  return (
    <html lang="en-GB" className={dmSans.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
