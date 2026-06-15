export default function PronosticoLoading() {
  return (
    <main className="wc-page min-h-screen px-3 py-6 text-zinc-900 sm:px-4 sm:py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6">
        <section className="wc-card rounded-[2rem] p-5 sm:p-7">
          <div className="h-4 w-32 rounded-full bg-zinc-200" />
          <div className="mt-4 h-12 w-64 max-w-full rounded-2xl bg-zinc-200 sm:h-16" />
          <div className="mt-3 h-4 w-full max-w-md rounded-full bg-zinc-100" />
        </section>
        <section className="wc-card-soft rounded-2xl p-3">
          <div className="flex gap-2 overflow-hidden">
            {["Próximo", "Pendientes", "Ranking", "Tabla"].map((item) => (
              <div key={item} className="h-10 min-w-28 rounded-xl bg-zinc-100" />
            ))}
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-72 rounded-[1.6rem] border border-zinc-200 bg-white/90 p-4 shadow">
              <div className="h-4 w-24 rounded-full bg-zinc-200" />
              <div className="mt-6 h-8 w-full rounded-xl bg-zinc-100" />
              <div className="mt-4 h-8 w-full rounded-xl bg-zinc-100" />
              <div className="mt-8 h-12 w-full rounded-2xl bg-zinc-200" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
