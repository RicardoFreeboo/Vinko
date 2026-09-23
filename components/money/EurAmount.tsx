// Importe en EUROS (diseño frontend §3.3). Componente DISTINTO de CoinAmount a
// propósito: es imposible confundir euros con Vinkos por error. Crema + mono,
// 2 decimales, tabular-nums. `cents` es entero (nunca float).
export function EurAmount({ cents, size = "md", sign = false }: {
  cents: number; size?: "sm" | "md" | "lg" | "xl"; sign?: boolean;
}) {
  const px = { sm: "text-[13px]", md: "text-[16px]", lg: "text-[22px]", xl: "text-[32px]" }[size];
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
  const withSign = sign && cents > 0 ? `+${eur}` : eur;
  const color = !sign ? "var(--cream, #f4f1e9)" : cents < 0 ? "var(--red, #ff6b6b)" : "var(--win, #1fe07a)";
  return (
    <span className={`${px} font-semibold tabular-nums`} style={{ fontFamily: "var(--font-mono2, ui-monospace), monospace", color }}>
      {withSign}
    </span>
  );
}
