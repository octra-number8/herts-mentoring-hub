import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <p className="text-sm font-semibold text-teal-700">Not found</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">We could not find that page</h1>
      <p className="mt-2 text-muted">It may have moved, or you may not have access to it.</p>
      <Link href="/" className="mt-6 inline-block font-medium text-navy-700 underline underline-offset-2">Go to your home page</Link>
    </div>
  );
}
