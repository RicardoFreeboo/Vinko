"use client";
import dynamic from "next/dynamic";
import type { MoneyView } from "@/lib/money/server";

// Punto de montaje de la modalidad de dinero (M0, §B4). Es lo ÚNICO que importa
// app/p/[slug]/page.tsx. El componente pesado + copy regulado se carga en un
// chunk aparte con ssr:false, de modo que NO entra en los chunks eager de la
// página (lo verifica tests/unit/money-bundle.test.mjs) y jamás se renderiza en
// el HTML del servidor (cero copy de dinero en público, check h del smoke).
//
// Desviación documentada del contrato §B4: el contrato escribía
//   dynamic(() => import('./MoneyCta').then(m => m.MoneyCta), …)
// pero la propiedad `.MoneyCta` sobrevive a la minificación y dejaría la cadena
// "MoneyCta" en el chunk de la página (el path './MoneyCta' sí lo elimina
// webpack). Cargamos el export por defecto para no filtrar ese símbolo y que el
// bundle-test que pide el propio contrato pueda pasar.
const MoneyCta = dynamic(() => import("./MoneyCta"), { ssr: false, loading: () => null });

type Opt = { id: string; label: string };

export function MoneyMount({
  view,
  slug,
  dict,
  options,
}: {
  view: MoneyView;
  slug: string;
  dict: Record<string, string>;
  options: Opt[];
}) {
  return <MoneyCta view={view} slug={slug} dict={dict} options={options} />;
}
