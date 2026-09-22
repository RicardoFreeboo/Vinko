// Ficha de una página para mandar a un operador partner (Colossus/BetConstruct).
// Contenido de negocio (no es UI del alfa): va en JSX, no en messages/*. Interno,
// solo admin. Copiable/mostrable en el pitch o al contactar con ventas.

const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-5";
const h = "text-[13px] font-black uppercase tracking-[0.12em] text-[var(--win)]";

export function PartnerBrief() {
  return (
    <section id="partner" className="flex flex-col gap-4">
      <div className="rounded-[16px] border border-[var(--win)]/40 bg-[var(--win)]/8 p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--win)]">Ficha para partner · sendable</p>
        <h2 className="mt-1 text-[24px] font-black leading-tight text-[var(--cream)]">Vinko × operador licenciado</h2>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          Vinko aporta la capa social y los jugadores; vosotros operáis las bolsas bajo vuestra licencia.
          Cobráis la entrada, retenéis la comisión, pagáis a los ganadores y nos liquidáis nuestra parte.
          Vinko no toca el dinero: os llama por API y recibe vuestros webhooks.
        </p>
      </div>

      <div className={card}>
        <p className={h}>Qué es Vinko</p>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          Red social de predicciones («porras») sobre cualquier tema, formato móvil y viral. Producto en vivo en
          vinko.fun con puntos virtuales (free-to-play). Usuarios reales, registrados y con edad declarada.
        </p>
      </div>

      <div className={card}>
        <p className={h}>El encaje (producto: bolsas mutuas)</p>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          Bolsa <b>parimutuel</b>: todos ponen la misma entrada; el bote menos la comisión se reparte a partes
          iguales entre los acertantes. Sin cuotas. Resolución <b>solo</b> por fuente oficial (nunca juez humano
          con dinero). Es el modelo tote/pool, no la casa contra el jugador.
        </p>
      </div>

      <div className={card}>
        <p className={h}>Qué buscamos de vosotros</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px] leading-snug text-[var(--cream)]">
          <li>1 · Soporte de <b>bolsas mutuas (pari-mutuel)</b>, no solo cuota fija.</li>
          <li>2 · <b>Mercados que cubre vuestra licencia</b> (empezamos por uno).</li>
          <li>3 · <b>Reparto de comisión</b> para Vinko (setup + % de la comisión/NGR).</li>
          <li>4 · <b>Depósito y retirada, KYC, juego responsable</b> incluidos, en vuestro dominio.</li>
          <li>5 · <b>Sandbox</b> para integrar antes de producción.</li>
        </ul>
      </div>

      <div className={card}>
        <p className={h}>Qué ponemos nosotros</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px] leading-snug text-[var(--cream)]">
          <li>· Capa social y viral (loop de creador, invitaciones, feed de vídeo).</li>
          <li>· Usuarios registrados y con edad declarada; nosotros os enviamos el mínimo (id, email, país, idioma).</li>
          <li>· Integración rápida: adaptador <span className="font-mono text-[12px]">MoneyProvider</span> ya construido; mapear vuestra API es cuestión de días.</li>
          <li>· Cumplimiento del reparto de datos (DPA) y del flujo de webhooks firmados.</li>
        </ul>
      </div>

      <div className={card}>
        <p className={h}>Estado</p>
        <p className="mt-2 text-[14px] leading-snug text-[var(--cream)]">
          Producto en vivo (puntos) en vinko.fun. Arquitectura de la capa de dinero ya construida (referencias,
          proveedor, webhook, panel). Fase pre-seed. Buscamos partner para encender un primer mercado.
        </p>
      </div>

      <div className={card}>
        <p className={h}>Contacto</p>
        <p className="mt-2 text-[14px] text-[var(--cream)]">Ricardo Cano García · vinko.fun · hello@freebooadvertising.com</p>
        <p className="mt-1 text-[12px] text-[var(--muted)]">Candidatos: Colossus Bets (pools) · BetConstruct / SOFTSWISS (white-label con licencia).</p>
      </div>
    </section>
  );
}
