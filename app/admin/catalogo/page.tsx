import { supabaseServer } from "@/lib/supabase/server";
import { CatalogoAdmin, type Entidad } from "@/components/admin/CatalogoAdmin";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Catálogo del agente de tendencias (tracked_entities): qué se vigila para
// buscar noticias. Se lee entero (son decenas de filas) y el cliente agrupa
// por categoría. Baja lógica con activo=false; nunca se borra (0032).
export default async function AdminCatalogo() {
  const sb = await supabaseServer();
  let rows: Entidad[] = [];
  if (sb) {
    const { data } = await sb.from("tracked_entities").select("*")
      .order("categoria").order("nombre");
    rows = (data ?? []) as Entidad[];
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.catalogo.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.catalogo.how")}
        </p>
      </div>
      <CatalogoAdmin initial={rows} />
    </div>
  );
}
