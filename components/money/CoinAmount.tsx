import { VinkoCoin } from "@/components/VinkoCoin";

// Importe en VINKOS (puntos virtuales). Oro + icono de moneda. DISTINTO de
// EurAmount para no confundir nunca los puntos con euros (diseño frontend §3.3).
export function CoinAmount({ coins, size = "md" }: { coins: number; size?: "sm" | "md" | "lg" | "xl" }) {
  const px = { sm: "text-[13px]", md: "text-[16px]", lg: "text-[22px]", xl: "text-[32px]" }[size];
  const icon = { sm: 12, md: 14, lg: 18, xl: 24 }[size];
  const n = new Intl.NumberFormat("es-ES").format(coins || 0);
  return (
    <span className={`${px} inline-flex items-center gap-1 font-semibold tabular-nums`}
      style={{ fontFamily: "var(--font-mono2, ui-monospace), monospace", color: "var(--gold, #ffc23d)" }}>
      <VinkoCoin size={icon} />{n}
    </span>
  );
}
