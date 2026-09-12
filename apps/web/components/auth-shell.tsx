import Link from 'next/link';

export function AuthShell({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-10 inline-block text-xl font-semibold tracking-tight text-slate-900">Sauber<span className="text-teal-700">Werk</span></Link>
        <section className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
