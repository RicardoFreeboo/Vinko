import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { AffiliateCta } from "./AffiliateCta";
import { t } from "@/lib/i18n";

// Slot de afiliación (server). Se pinta SOLO si: hay sesión real (no invitado),
// el usuario es +18 declarado, tiene país, y ese país tiene la afiliación
// habilitada con al menos un operador. En cualquier otro caso → null. Como está
// apagado en todos los países (0045), hoy no pinta nada: es el age-gate de la
// regla de oro 8 aplicado también a las vistas abiertas desde enlaces.
export async function AffiliateSlot({ porraId }: { porraId?: string }) {
  const session = await getSession();
  if (!session || session.is_anonymous) return null;
  const sb = await supabaseServer();
  if (!sb) return null;

  const { data: prof } = await sb.from("profiles").select("birth_year, country").eq("id", session.id).maybeSingle();
  const p = prof as { birth_year?: number | null; country?: string | null } | null;
  if (!p?.birth_year || !p.country) return null;
  if (new Date().getFullYear() - p.birth_year < 18) return null;

  const { data } = await sb.rpc("affiliate_offer", { p_country: p.country });
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
