"use client";
import { useEffect, type ReactNode } from "react";
import { t } from "@/lib/i18n";

// Hoja inferior del diseño (VINKO_PANTALLAS 14 y 15): velo oscuro + hoja con
// asa, botón verde y «Ahora no». Tocar el velo o pulsar Esc = cerrar.
//
// Un solo aviso a la vez: el de instalar (A2HSPrompt) y el de notificaciones
// (PushPrePrompt) piden la hoja con claimSheet; si ya hay otra abierta, ese
// aviso no sale esta vez (nunca se apilan).
let owner: string | null = null;
export function claimSheet(id: string): boolean {
  if (owner !== null && owner !== id) return false;
  owner = id;
  return true;
}
export function releaseSheet(id: string): void {
  if (owner === id) owner = null;
}

export function BottomSheet({ labelledBy, onClose, center = false, children }: {
  labelledBy: string; onClose: () => void; center?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label={t("sheet.close")} onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(5,8,8,0.66)]" />
      <section role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[26px] border-t border-[var(--line2)] bg-[var(--ink2)] px-5 pt-3 pb-[max(34px,env(safe-area-inset-bottom))] ${center ? "text-center" : ""}`}>
        <div aria-hidden className="mx-auto mb-4 h-[5px] w-[42px] rounded-[3px] bg-[var(--line2)]" />
        {children}
      </section>
    </div>
  );
}

// .btn.pri del diseño: píldora verde con canto (sombra dura windeep).
export function SheetPrimary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--win)] text-[17px] font-black text-[var(--ink)]"
      style={{ boxShadow: "0 5px 0 var(--windeep), 0 10px 26px -8px rgba(31,224,122,0.45)" }}>
      {children}
    </button>
  );
}

// .btn.ghost del diseño: «Ahora no».
export function SheetGhost({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-1 flex h-11 w-full items-center justify-center text-[15px] font-semibold text-[var(--muted)]">
      {children}
    </button>
  );
}
