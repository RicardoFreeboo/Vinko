import type { Metadata } from "next";
import { Fase3Journey } from "@/components/Fase3Journey";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vinko — Vinko con dinero", robots: { index: false, follow: false } };

// Recorrido guiado (paso a paso) de la visión completa de Vinko con dinero, para
// inversores. Datos de ejemplo; la custodia la hace el operador con licencia
// (Luckia, Fase 2). El núcleo solo guarda referencias, nunca custodia. noindex.
export default function Fase3() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 py-8">
      <Fase3Journey />
    </main>
  );
}
