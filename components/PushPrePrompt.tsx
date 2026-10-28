"use client";
import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { pushSupported, requestPushPermission } from "@/lib/push";
import { BottomSheet, SheetGhost, SheetPrimary, claimSheet, releaseSheet } from "@/components/BottomSheet";
import { t } from "@/lib/i18n";

// «¿Te aviso cuando se resuelva?» (VINKO_PANTALLAS 14, §5.2): el permiso de
// push se pide con hoja propia, SOLO tras un momento de valor (hasValue).
// «Ahora no» no quema el permiso del navegador y no vuelve a salir.
// (El aviso de instalar en iOS vive en A2HSPrompt: un solo aviso, una clave.)
const KEY = "vinko_push_preprompt"; // "no" | timestamp de cuando se abrió el permiso
const ASKED_MS = 7 * 86400000;
// Respondida en esta carga de página: aunque el storage falle, no vuelve.
let answeredNow = false;

// "no" (o cualquier valor no numérico) = no volver a preguntar. Un timestamp =
// se abrió el permiso del navegador y se cerró sin decidir: 7 días de calma.
function snoozed(): boolean {
  if (answeredNow) return true;
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return false;
    const at = Number(v);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < ASKED_MS;
  } catch { return true; }
}

function remember(v: string): void {
  answeredNow = true;
  try { localStorage.setItem(KEY, v); } catch { /* sin storage: vale answeredNow */ }
}

export function PushPrePrompt({ hasValue }: { hasValue: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasValue || !pushSupported()) return;
    if (Notification.permission !== "default" || snoozed()) return;
    if (!claimSheet("push")) return; // ya hay otra hoja abierta: esta vez no
    setShow(true);
    return () => releaseSheet("push");
  }, [hasValue]);

  const later = useCallback(() => {
    remember("no");
    setShow(false);
    releaseSheet("push");
  }, []);

  if (!show) return null;

  async function accept() {
    remember(String(Date.now()));
    setShow(false);
    releaseSheet("push");
    await requestPushPermission();
  }

  return (
    <BottomSheet labelledBy="push-pre-title" onClose={later} center>
      <span aria-hidden className="mx-auto mt-1 grid h-16 w-16 place-items-center rounded-[20px] bg-[rgba(31,224,122,0.12)] text-[var(--win)]">
        <BellRing size={30} strokeWidth={2.2} />
      </span>
      <h2 id="push-pre-title" className="mt-3.5 text-[26px] font-black leading-[1.1] tracking-[-0.03em] text-[var(--cream)]">{t("push.pre.title")}</h2>
      <p className="mt-2 text-[15.5px] leading-snug text-[var(--muted)]">{t("push.pre.body")}</p>
      <SheetPrimary onClick={accept}>{t("push.pre.yes")}</SheetPrimary>
      <SheetGhost onClick={later}>{t("push.pre.later")}</SheetGhost>
    </BottomSheet>
  );
}
