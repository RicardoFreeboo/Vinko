import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { AffiliateCta } from "./AffiliateCta";
import { t } from "@/lib/i18n";

// Slot de afiliación (server). Se pinta SOLO si: hay sesión real (no invitado),
// el usuario es +18 declarado, tiene país, y ese país tiene la afiliación
// habilitada con al menos un operador. En cualquier otro caso → null. Como está
// apagado en todos los países (0045), hoy no pinta nada: es el age-gate de la
// regla de oro 8 aplicado también a las vistas abiertas desde enlaces.
export async function AffiliateSlot({ porraId }: { porraId?: string }) {
  const session = await getMemberSession();
  if (!session || session.is_anonymous) return null;
  // SEC-01 (0055): birth_year y country son privados; llegan con la sesión
  // (me()). Un select directo a profiles falla y dejaba el slot siempre vacío.
  if (!session.birth_year || !session.country) return null;
  if (new Date().getFullYear() - session.birth_year < 18) return null;
  const sb = await supabaseServer();
  if (!sb) return null;

  const { data } = await sb.rpc("affiliate_offer", { p_country: session.country });
  const offers = Array.isArray(data) ? (data as { operator: string; country: string }[]) : [];
  if (offers.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("affiliate.title")}</p>
      {offers.map((o) => (
        <AffiliateCta key={o.operator} operator={o.operator} country={o.country} porraId={porraId} />
      ))}
    </section>
  );
}
