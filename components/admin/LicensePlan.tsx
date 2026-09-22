// Plan de la vía con licencia propia: coste, plazos y pasos (licencia de juego +
// PAM + PSP, y la entidad de pago si se internaliza). Contenido de negocio en JSX
// (no en messages/*). Interno, solo admin. Cifras a confirmar con asesor.

const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-5";
const h = "text-[13px] font-black uppercase tracking-[0.12em] text-[var(--gold)]";
const th = "py-1.5 pr-3 text-left text-[12px] font-bold text-[var(--muted)]";
const td = "py-1.5 pr-3 text-[13px] text-[var(--cream)] align-top";

export function LicensePlan() {
  return (
    <section id="licencia" className="flex flex-col gap-4">
      <div className="rounded-[16px] border border-[var(--gold)]/40 bg-[var(--gold)]/8 p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--gold)]">Vía con licencia propia · números reales</p>
        <h2 className="mt-1 text-[24px] font-black leading-tight text-[var(--cream)]">Montar Vinko como operador</h2>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          Aquí la comisión es ingreso íntegro de Vinko, pero eres el operador regulado. Necesitas DOS cosas:
          licencia de juego (para operar las porras) y, para el dinero, un PSP licenciado o tu propia entidad de pago.
          Cifras orientativas a confirmar con asesor.
        </p>
      </div>

      <div className={card}>
        <p className={h}>Las dos autorizaciones</p>
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>Pieza</th><th className={th}>Para qué</th><th className={th}>Plazo / coste</th></tr></thead>
          <tbody>
            <tr className="border-t border-[var(--line)]"><td className={td}>Licencia de juego (UKGC / DGOJ)</td><td className={td}>Operar las porras con dinero</td><td className={td}>meses · garantías + certificación</td></tr>
            <tr className="border-t border-[var(--line)]"><td className={td}>PSP licenciado (o entidad propia)</td><td className={td}>Cobrar depósitos y pagar retiradas</td><td className={td}>alquilado: semanas · propio (EMI): 6–18 meses</td></tr>
          </tbody>
        </table>
      </div>

      <div className={card}>
        <p className={h}>Ruta A (recomendada): licencia de juego + alquilar las tuberías</p>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          No montas tu propia entidad de pago: usas un PSP y un PAM ya licenciados. Es lo que hacen casi todos los operadores.
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug text-[var(--cream)]">
          <li><b>PAM (cuenta de jugador)</b>: alquilar EveryMatrix, FSB o Pragmatic Solutions. Aquí viven los saldos, no en Vinko.</li>
          <li><b>Orquestador/cajero</b>: PaymentIQ (recoge y paga con una integración, retirada closed-loop).</li>
          <li><b>PSP</b>: Nuvei o Paysafe (tarjetas, métodos locales, pagos salientes).</li>
          <li><b>Open banking</b>: TrueLayer (depósito/retirada instantánea EU/UK). <b>Local</b>: Bizum (ES), dLocal/EBANX (LatAm).</li>
          <li><b>KYC/AML</b>: Sumsub/Veriff/Onfido + ComplyAdvantage. <b>Juego responsable</b>: RGIAJ (ES) / GAMSTOP (UK).</li>
        </ul>
        <p className="mt-2 text-[12px] text-[var(--muted)]">Nada de esto es alta online: son contratos B2B, y el PSP de juego te pide la licencia antes de abrirte cuenta.</p>
      </div>

      <div className={card}>
        <p className={h}>Ruta B: además tu propia entidad de pago (EMI, FCA)</p>
        <p className="mt-2 text-[13px] leading-snug text-[var(--cream)]">Recoger/guardar/pagar dinero tú mismo = ser Electronic Money Institution. Solo tiene sentido a escala.</p>
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>Concepto (EMI autorizada, UK)</th><th className={th}>Cifra</th></tr></thead>
          <tbody>
            <tr className="border-t border-[var(--line)]"><td className={td}>Capital inicial mínimo</td><td className={td}>350.000 £</td></tr>
            <tr className="border-t border-[var(--line)]"><td className={td}>Tasa FCA</td><td className={td}>~5.000 £ (autorizada) / ~1.100 £ (pequeña)</td></tr>
            <tr className="border-t border-[var(--line)]"><td className={td}>Expediente con abogados</td><td className={td}>40.000–120.000 £</td></tr>
            <tr className="border-t border-[var(--line)]"><td className={td}>Plazo</td><td className={td}>3 meses desde expediente completo; en la práctica 6–18</td></tr>
            <tr className="border-t border-[var(--line)]"><td className={td}>Novedad</td><td className={td}>régimen de salvaguarda CASS 15, en vigor mayo 2026</td></tr>
          </tbody>
        </table>
      </div>

      <div className={card}>
        <p className={h}>Secuencia</p>
        <ol className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug text-[var(--cream)]">
          <li>1 · Sociedad separada (no Axis) + dictamen legal del modelo.</li>
          <li>2 · Licencia de juego (UKGC o DGOJ) — bloqueante para las porras con dinero.</li>
          <li>3 · Alquilar PAM + contratar orquestador/PSP (Ruta A) contra sandbox.</li>
          <li>4 · Integrar con el adaptador ya construido; probar; encender un país.</li>
          <li>5 · (Opcional, a escala) tu propia EMI para internalizar los pagos.</li>
        </ol>
      </div>

      <div className={card}>
        <p className={h}>Coste realista para arrancar</p>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          <b>Ruta A</b>: licencia de juego + integración de tuberías alquiladas = meses y decenas de miles.
          <b> Ruta B</b> (con EMI propia): del orden de <b>medio millón de £ y 6–18 meses</b> solo la parte de pagos, más la licencia de juego aparte.
          Recomendación: Ruta A cuando decidas licencia propia; la EMI, solo a escala. Antes de todo esto, el <b>partner</b> te da ingresos sin nada de esto.
        </p>
      </div>
    </section>
  );
}
