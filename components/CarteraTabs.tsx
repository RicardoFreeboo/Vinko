"use client";
import { useState, type ReactNode } from "react";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Dos pestañas en la Cartera: Vinkos (puntos, economía viva) y Euros (dinero,
// motor del proveedor). Ambas quedan montadas (display:none la inactiva) para no
// perder estado ni re-consultar. Vinkos y euros JAMÁS se mezclan (diseño §3.3).
export function CarteraTabs({ vinkos, dinero, initial = "vinkos" }: {
  vinkos: ReactNode; dinero: ReactNode; initial?: "vinkos" | "dinero";
}) {
  const [tab, setTab] = useState<"vinkos" | "dinero">(initial);
  const base = "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-black transition-colors";
  return (
    <>
      <div className="flex gap-1 rounded-full border border-[var(--line)] bg-[var(--ink2)] p-1">
        <button onClick={() => setTab("vinkos")} className={base}
          style={{ background: tab === "vinkos" ? "var(--gold)" : "transparent", color: tab === "vinkos" ? "#060b09" : "var(--muted)" }}>
          <VinkoCoin size={15} />{t("cartera.tab.vinkos")}
        </button>
        <button onClick={() => setTab("dinero")} className={base}
          style={{ background: tab === "dinero" ? "var(--win)" : "transparent", color: tab === "dinero" ? "var(--ink)" : "var(--muted)" }}>
          €<span>{t("cartera.tab.euros")}</span>
        </button>
      </div>
      <div className={tab === "vinkos" ? "flex flex-col gap-5" : "hidden"}>{vinkos}</div>
      <div className={tab === "dinero" ? "flex flex-col gap-5" : "hidden"}>{dinero}</div>
    </>
  );
}
