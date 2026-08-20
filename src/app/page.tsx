import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-medium text-neutral-900">Mosa Mian Photography</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        The portfolio homepage is still under construction. Published galleries are live at their
        own URLs in the meantime.
      </p>
      <Link href="/contact" className="mt-4 text-sm text-neutral-600 underline hover:text-neutral-900">
        Get in touch
      </Link>
    </main>
  );
}
