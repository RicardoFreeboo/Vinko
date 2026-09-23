import { t } from "@/lib/i18n";

// Botón de afiliación a un operador licenciado (regla de oro 5). Es publicidad,
// va con +18 y mensaje de juego responsable. El enlace pasa por /api/afiliado,
// que valida y traza el clic en el servidor. Vinko no gestiona juego ni dinero.
export function AffiliateCta({ operator, country, porraId }: { operator: string; country: string; porraId?: string }) {
  const href =
    `/api/afiliado?op=${encodeURIComponent(operator)}&c=${encodeURIComponent(country)}` +
    (porraId ? `&p=${encodeURIComponent(porraId)}` : "");
  return (
    <a href={href} target="_blank" rel="nofollow sponsored noopener"
      className="flex flex-col gap-1 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-[var(--cream)]">{t("affiliate.cta", { operator })}</span>
        <span className="mono shrink-0 rounded-full border border-[var(--gold)] px-2 py-0.5 text-[11px] font-black text-[var(--gold)]">
          {t("affiliate.age")}
        </span>
      </div>
      <span className="text-[11px] text-[var(--muted)]">{t("affiliate.rg")}</span>
      <span className="text-[10px] leading-snug text-[var(--muted)]">{t("affiliate.note")}</span>
    </a>
  );
}
