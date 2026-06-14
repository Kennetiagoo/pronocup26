export default function AdminLoading() {
  return (
    <main className="wc-page min-h-screen px-4 py-6 text-zinc-900 sm:py-8 md:px-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
        <section className="wc-card rounded-[2rem] p-5 sm:p-7">
          <div className="h-4 w-36 rounded-full bg-zinc-200" />
          <div className="mt-4 h-12 w-72 max-w-full rounded-2xl bg-zinc-200 sm:h-16" />
          <div className="mt-4 h-4 w-full max-w-2xl rounded-full bg-zinc-100" />
        </section>
        <section className="wc-card-soft rounded-2xl p-3">
          <div className="flex gap-2 overflow-hidden">
            {["Usuarios", "Resultados", "Bonos", "Pagos"].map((item) => (
              <div key={item} className="h-10 min-w-28 rounded-xl bg-zinc-100" />
            ))}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow">
              <div className="h-4 w-28 rounded-full bg-zinc-200" />
              <div className="mt-4 h-8 w-16 rounded-xl bg-zinc-100" />
            </div>
          ))}
        </section>
        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <div className="h-10 w-56 rounded-2xl bg-zinc-200" />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 rounded-xl bg-zinc-100" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
