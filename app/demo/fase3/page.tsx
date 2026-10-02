import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { moneyUiEnabled } from "@/lib/flags";
import { Fase3Journey } from "@/components/Fase3Journey";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vinko — Vinko con dinero", robots: { index: false, follow: false } };

// Recorrido guiado (paso a paso) de la visión completa de Vinko con dinero, para
// inversores. Datos de ejemplo; la custodia la hace el operador con licencia
// (Luckia, Fase 2). El núcleo solo guarda referencias, nunca custodia. noindex.

// MON-01: material de inversores. Solo existe con el flag de dinero encendido Y
// para un admin con sesión; para cualquier otro, 404.
async function guardMoneyAdmin(): Promise<void> {
  const sb = await supabaseServer();
  if (!(await moneyUiEnabled(sb))) notFound();
  const { data: adm } = sb ? await sb.rpc("is_admin") : { data: false };
  if (adm !== true) notFound();
}

export default async function Fase3() {
  await guardMoneyAdmin();
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 py-8">
      <Fase3Journey />
    </main>
  );
}
