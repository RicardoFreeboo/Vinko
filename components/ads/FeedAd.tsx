"use client";
import Link from "next/link";
import { ADS_ENABLED } from "@/lib/ads";
import { t } from "@/lib/i18n";

// FeedAdAdapter (PASO 6): 1 hueco cada 5 tarjetas, SOLO en el feed de HOME.
// JAMÁS en /p (este componente no se importa allí). Cascada real =
// patrocinador → programático → HOUSE; sin inventario pagado mostramos siempre
// la house ad (promo de la capa social) para que el hueco no quede vacío.
// Reglas de oro: cero dinero y cero juego real — solo invita/crea/racha.
const HOUSE = [
  { emoji: "🤝", key: "invite", href: "/grupos" },
  { emoji: "✏️", key: "create", href: "/nueva" },
  { emoji: "🔥", key: "streak", href: "/hoy" },
] as const;

export function FeedAd({ seed = 0 }: { seed?: number }) {
  if (!ADS_ENABLED) return null;
  const h = HOUSE[seed % HOUSE.length];
  return (
    <Link href={h.href}
      className="relative block overflow-hidden rounded-[16px] border border-[var(--gold)]/40 bg-gradient-to-br from-[var(--ink2)] to-[var(--ink3)] p-4">
      <span className="mono absolute right-3 top-3 rounded-full border border-[var(--muted2)]/50 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--muted2)]">
        {t("ad.label")}
      </span>
      <div className="flex items-center gap-3 pr-16">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-[var(--gold)]/15 text-2xl">{h.emoji}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-black leading-tight text-[var(--cream)]">{t(`ad.house.${h.key}.title`)}</p>
          <p className="text-[12px] text-[var(--muted)]">{t(`ad.house.${h.key}.sub`)}</p>
        </div>
      </div>
      <span className="mt-3 flex items-center justify-center rounded-[10px] bg-[var(--gold)] py-2 text-[13px] font-black text-[var(--ink)]">
        {t(`ad.house.${h.key}.cta`)}
      </span>
    </Link>
  );
}
