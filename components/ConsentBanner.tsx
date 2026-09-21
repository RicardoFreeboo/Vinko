"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

// Banner de consentimiento (RGPD, spec F-10). La analítica arranca APAGADA:
// GA/PostHog solo tras «Aceptar». Respuesta en cookie vinko_consent=1|0 (1 año,
// SameSite=Lax, path=/) + copia en localStorage. El layout la lee en servidor
// (cookies()) y se la pasa a <Analytics consent={…}>; /ajustes la reescribe.
export const CONSENT_COOKIE = "vinko_consent";
export type Consent = "1" | "0";
const ONE_YEAR = 60 * 60 * 24 * 365;

// Lee la respuesta guardada. Si la cookie caducó pero localStorage la tiene,
// la rehace (así el banner no vuelve a salir cada año).
export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)vinko_consent=([01])(?:;|$)/);
  if (m) return m[1] as Consent;
  try {
    const ls = localStorage.getItem(CONSENT_COOKIE);
    if (ls === "1" || ls === "0") { writeConsent(ls); return ls; }
  } catch { /* sin storage: solo cookie */ }
  return null;
}

// Guarda la respuesta y la aplica a GA al instante (sin esperar al servidor).
export function writeConsent(v: Consent): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${v}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
  try { localStorage.setItem(CONSENT_COOKIE, v); } catch { /* noop */ }
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.(
      "consent", "update", { analytics_storage: v === "1" ? "granted" : "denied" },
    );
  } catch { /* la analítica jamás rompe la UI */ }
}

export function ConsentBanner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Solo en cliente: el servidor no sabe si ya se respondió (evita parpadeo).
  useEffect(() => { setOpen(readConsent() === null); }, []);

  if (!open) return null;

  function answer(v: Consent) {
    writeConsent(v);
    setOpen(false);
    router.refresh(); // el layout relee la cookie y Analytics recibe el nuevo consent
  }

  return (
    <div
      role="dialog"
      aria-label={t("consent.title")}
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-[430px] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)]/95 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
        <p className="text-[13px] font-black text-[var(--cream)]">{t("consent.title")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          {t("consent.body")}{" "}
          <Link href="/privacidad" className="font-bold text-[var(--win)] underline-offset-2 hover:underline">
            {t("consent.privacy")}
          </Link>
        </p>
        {/* Rechazar es tan fácil como aceptar (RGPD): mismo tamaño, misma fila. */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => answer("0")}
            className="flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] px-3 py-2.5 text-[13px] font-bold text-[var(--cream)]"
          >
            {t("consent.essential")}
          </button>
          <button
            type="button"
            onClick={() => answer("1")}
            className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-2.5 text-[13px] font-black text-[var(--ink)]"
          >
            {t("consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
