import Image from "next/image";
import Link from "next/link";

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Image src="/brand/shield-256.png" alt="" width={30} height={35} priority />
          <span className="text-[16px] font-semibold text-navy-900">Mentoring Hub check-in</span>
        </div>
        <main className="rounded-lg border border-line bg-white p-6 shadow-sm">{children}</main>
        <p className="mt-6 text-center text-[13px] text-muted"><Link href="/privacy" className="underline underline-offset-2 hover:text-navy-900">Privacy notice</Link></p>
      </div>
    </div>
  );
}
