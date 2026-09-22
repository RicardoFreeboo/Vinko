import { PartnerBrief } from "@/components/admin/PartnerBrief";
import { LicensePlan } from "@/components/admin/LicensePlan";

// Panel de negocio (solo admin, dentro del layout de /admin que ya comprueba
// role=admin y es noindex). Dos documentos internos: la ficha para mandar a un
// partner y el plan de la vía con licencia propia. Contenido confidencial: nunca
// enlazado en público.
export const dynamic = "force-dynamic";

export default function NegocioPage() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-black text-[var(--cream)]">Negocio · capa de dinero</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Interno. Dos rutas para monetizar las porras con dinero: partner (rápido, sin licencia propia) o
          licencia propia (más ingreso, más lento). Cifras a confirmar con asesor.
        </p>
        <nav className="mt-3 flex gap-2">
          <a href="#partner" className="rounded-full border border-[var(--win)]/40 px-3 py-1.5 text-[12px] font-bold text-[var(--win)]">Ficha para partner</a>
          <a href="#licencia" className="rounded-full border border-[var(--gold)]/40 px-3 py-1.5 text-[12px] font-bold text-[var(--gold)]">Plan licencia propia</a>
        </nav>
      </div>
      <PartnerBrief />
      <LicensePlan />
    </div>
  );
}
