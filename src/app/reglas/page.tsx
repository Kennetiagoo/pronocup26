import Link from "next/link";

const rules = [
  {
    title: "Puntaje base",
    items: [
      "El puntaje oficial visible en la app depende de la configuración activa del admin.",
      "Resultado correcto significa acertar si gana el local, gana el visitante o empatan.",
      "Goles por equipo significa acertar la cantidad exacta de goles de una selección, aunque no aciertes todo el marcador.",
      "Ejemplo: pronosticas 2-1 y el resultado oficial es 2-0. Acertaste los goles del local, pero no el marcador completo.",
    ],
  },
  {
    title: "Eliminatorias",
    items: [
      "El puntaje se calcula sobre los 90 minutos más reposición.",
      "No cuentan prórroga ni penales para el marcador del pronóstico.",
      "Si un partido termina 1-1 en 90 minutos y luego se define 2-1 en prórroga, el resultado válido para la app es 1-1.",
      "Desde dieciseisavos en adelante el multiplicador de eliminatorias es x2: el pleno base maximo es 20 puntos si la regla base vale 10.",
    ],
  },
  {
    title: "Bonificador X2",
    items: [
      "X2 duplica solamente el puntaje base del partido. Los puntos de goleadores se suman aparte y no se duplican con X2.",
      "Debes activar X2 antes de guardar el pronóstico del partido. Si no lo activas antes del cierre, no se puede aplicar después.",
      "En grupos hay límites: máximo 12 X2 en toda la fase de grupos, máximo 4 por fecha y máximo 1 por día de partidos.",
      "Si usas X2 y ese partido te da 0 puntos base, el X2 se devuelve automáticamente y vuelve a quedar disponible.",
      "Ejemplo: sin X2 haces 5 puntos base. Con X2 haces 10 puntos base. Si además aciertas goleadores, esos puntos se agregan después.",
      "Ejemplo: si ya usaste 1 X2 en una fecha de partido, no puedes activar otro X2 en otro partido de ese mismo día.",
    ],
  },
  {
    title: "Goleadores",
    items: [
      "Los goleadores solo aparecen cuando el módulo está activo para esa fase y cuando escribes goles en tu marcador.",
      "Debes elegir un jugador por cada gol pronosticado. Si pronosticas 2 goles para una selección, aparecen 2 espacios de goleador para esa selección.",
      "Cada espacio acertado suma los puntos extra configurados por el admin. Por defecto, cada goleador acertado suma 1 punto.",
      "El orden no importa: cada jugador cuenta hasta el minimo entre las veces que lo escogiste y los goles reales que marco.",
      "Ejemplo: si pusiste una vez a un jugador y marca 2 goles, solo suma 1 acierto; si lo pusiste dos veces y marca 1, solo suma 1 acierto.",
      "Si pronosticas goles y dejas goleadores vacíos, puedes guardar, pero renuncias a esos puntos extra.",
      "Si el resultado oficial de una selección es 0 goles, no hay espacios de goleador para esa selección.",
      "Los goleadores no cambian el resultado del partido. Solo son puntos extra sobre el marcador guardado.",
    ],
  },
  {
    title: "Cierre y pagos",
    items: [
      "Cada partido se bloquea minutos antes del inicio, según configuración admin.",
      "Solo usuarios con pago aprobado pueden guardar pronósticos.",
      "Si tu comprobante es rechazado, puedes volver a subir uno nuevo.",
      "Cuando el partido está bloqueado, ya no se puede cambiar marcador, X2 ni goleadores.",
    ],
  },
  {
    title: "Premios",
    items: [
      "Cada apostador aprobado aporta 50.000 COP a la bolsa del juego, salvo que el admin cambie el valor de inscripción.",
      "La bolsa se reparte así: primer lugar 70%, segundo lugar 20% y tercer lugar 10%.",
      "Los valores se recalculan automáticamente según la cantidad de apostadores que aparecen en el ranking.",
      "Ejemplo con 10 apostadores: bolsa de 500.000 COP, primer lugar 350.000 COP, segundo 100.000 COP y tercero 50.000 COP.",
    ],
  },
];

export default function RulesPage() {
  return (
    <main className="wc-page min-h-screen px-4 py-6 text-zinc-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5">
        <header className="wc-card rounded-[2rem] p-5 sm:p-7">
          <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="wc-eyebrow text-zinc-800">
              Prono Cup 2026
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-700 hover:bg-zinc-50"
              >
                Inicio
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-900 hover:bg-cyan-100"
              >
                Entrar
              </Link>
            </div>
          </nav>
          <div className="mt-8">
            <p className="wc-eyebrow">Reglamento</p>
            <h1 className="wc-title mt-2 text-5xl text-zinc-950 sm:text-7xl">Cómo se juega</h1>
            <p className="mt-3 max-w-3xl text-base text-zinc-700">
              Lee esto antes de participar: el pago habilita tus picks, cada partido tiene hora de cierre y los
              bonificadores solo cuentan si los guardas antes del bloqueo.
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {rules.map((section) => (
            <article key={section.title} className="wc-card-soft rounded-[1.7rem] p-5">
              <h2 className="text-xl font-extrabold text-zinc-950">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {section.items.map((item) => (
                  <li key={item} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="wc-card-soft rounded-[1.7rem] p-5">
          <p className="wc-eyebrow">Desempates</p>
          <h2 className="mt-2 text-2xl font-extrabold text-zinc-950">Orden de la tabla</h2>
          <p className="mt-2 text-sm text-zinc-700">
            La tabla ordena primero por puntos totales. Si hay empate, queda mejor ubicado quien haya usado menos X2
            activos en fase de grupos; si el empate sigue, queda mejor ubicado quien tenga más X2 disponibles sin usar.
            Luego se aplican plenos, aciertos parciales, cantidad de picks y fecha de registro. Si todo sigue igual, se
            usa el usuario visible en orden alfabético.
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            El admin puede aparecer en la tabla si también participa como apostador. En ese caso compite bajo las mismas
            reglas de puntaje, cierre, X2 y goleadores.
          </p>
        </section>
      </div>
    </main>
  );
}
