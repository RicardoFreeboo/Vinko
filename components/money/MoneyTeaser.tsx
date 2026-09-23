import { t } from "@/lib/i18n";

// Teaser del modo dinero para la página de porra. Se renderiza SOLO para sesión
// real +18 (lo gatea el padre) y solo mientras el dinero real no está aprobado
// (loadMoneyDict null). No mueve dinero: es "muy pronto". Copy sin léxico
// prohibido. Menores y visitantes sin sesión NO lo ven (regla de oro 8).
export function MoneyTeaser({ options }: { options: { id: string; label: string }[] }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--gold)]/40 bg-[var(--ink2)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-[var(--gold)]">💶 {t("teaser.money.title")}</p>
        <span className="mono shrink-0 rounded-full border border-[var(--gold)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--gold)]">
          {t("teaser.money.soon")}
        </span>
      </div>
      <p className="text-[12px] leading-snug text-[var(--muted)]">{t("teaser.money.body")}</p>
      <div className="flex flex-col gap-1.5">
        {options.slice(0, 4).map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-[14px] font-bold text-[var(--cream)]">
            <span className="min-w-0 truncate">{o.label}</span>
            <span className="mono shrink-0 text-[var(--gold)]">€</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-[var(--muted2)]">{t("teaser.money.note")}</p>
    </section>
  );
}
