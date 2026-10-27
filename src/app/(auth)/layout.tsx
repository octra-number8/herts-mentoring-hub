import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/brand/wordmark.png" alt="Provincial Grand Lodge of Hertfordshire" width={300} height={100} priority />
        </div>
        <main className="rounded-lg border border-line bg-white p-6 shadow-sm sm:p-8">{children}</main>
        <p className="mt-6 text-center text-[13px] text-muted">Hertfordshire Mentoring Hub · Prepare · Guide · Support · Enlighten · <Link href="/privacy" className="underline underline-offset-2 hover:text-navy-900">Privacy notice</Link></p>
      </div>
    </div>
  );
}
