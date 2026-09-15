"use client";
import { useEffect, useState } from "react";
import { pushSupported, requestPushPermission, isIosSafari, isStandalone } from "@/lib/push";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// §5.2: el permiso de push se pide con pre-prompt propio, SOLO tras un momento
// de valor (hasValue). "Ahora no" no quema el permiso del navegador.
export function PushPrePrompt({ hasValue }: { hasValue: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasValue || !pushSupported()) return;
    if (Notification.permission !== "default") return;
    try {
      if (localStorage.getItem("vinko_push_preprompt") === "no") return;
    } catch { /* sin storage */ }
    setShow(true);
  }, [hasValue]);

  if (!show) return null;

  async function accept() {
    setShow(false);
    await requestPushPermission();
  }
  function later() {
    setShow(false);
    try { localStorage.setItem("vinko_push_preprompt", "no"); } catch { /* noop */ }
  }

  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <p className="text-sm font-bold text-[var(--cream)]">{t("push.pre.title")}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("push.pre.body")}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={accept}
          className="flex-1 rounded-[10px] bg-[var(--win)] px-3 py-2.5 text-[13px] font-black text-[var(--ink)]"
        >
          {t("push.pre.yes")}
        </button>
        <button
          onClick={later}
          className="flex-1 rounded-[10px] border border-[var(--line)] px-3 py-2.5 text-[13px] font-bold text-[var(--muted)]"
        >
          {t("push.pre.later")}
        </button>
      </div>
    </div>
  );
}

// Onboarding de instalación iOS (§5.1.3): Safari iOS no tiene prompt de
// instalación — hay que explicar Compartir → Añadir a pantalla de inicio.
// Solo tras el primer momento de valor, y solo si no está ya instalada.
export function InstallHint({ hasValue }: { hasValue: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasValue || !isIosSafari() || isStandalone()) return;
    try {
      if (localStorage.getItem("vinko_a2hs") === "no") return;
    } catch { /* noop */ }
    capture("pwa_install_prompt_shown", { is_seed: false });
    setShow(true);
  }, [hasValue]);

  if (!show) return null;

  return (
    <div className="rounded-[14px] border border-[var(--gold)] bg-[var(--ink2)] p-4">
      <p className="text-sm font-bold text-[var(--gold)]">{t("a2hs.title")}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t("a2hs.body")}</p>
      <button
        onClick={() => {
          setShow(false);
          try { localStorage.setItem("vinko_a2hs", "no"); } catch { /* noop */ }
        }}
        className="mt-3 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[13px] font-bold text-[var(--muted)]"
      >
        {t("a2hs.ok")}
      </button>
    </div>
  );
}
