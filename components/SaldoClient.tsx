"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RewardedButton } from "@/components/ads/RewardedButton";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Pantalla de saldo (tras login). El rewarded corre aquí: ver anuncio (stub de
// prueba mientras no haya proveedor) → el SERVIDOR acredita +10 vía la Edge
// Function rewards-claim. El cliente NUNCA suma puntos: solo pinta lo que el
// servidor devolvió. Regla de oro 2: los puntos no se compran ni se canjean.
export function SaldoClient({
  initialPoints,
  isAdult,
  handle,
}: {
  initialPoints: number;
  isAdult: boolean;
  handle: string | null;
}) {
  const [points, setPoints] = useState(initialPoints);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onClaimed(impressionId: string) {
    setMsg(null);
    setBusy(true);
    const sb = supabaseBrowser();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!sb || !url) { setBusy(false); setMsg({ kind: "err", text: t("saldo.error") }); return; }
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) { setBusy(false); setMsg({ kind: "err", text: t("saldo.error") }); return; }
    try {
      const res = await fetch(`${url}/functions/v1/rewards-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ impression_id: impressionId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && (j.granted ?? 0) > 0) {
        setPoints((p) => p + j.granted);
        setMsg({ kind: "ok", text: t("saldo.granted", { n: String(j.granted) }) });
      } else if (res.ok && j.granted === 0) {
        setMsg({ kind: "ok", text: t("saldo.already") });
      } else if (typeof j.error === "string" && j.error.includes("VINKO_AD_CAP")) {
        setMsg({ kind: "err", text: t("saldo.cap") });
      } else {
        setMsg({ kind: "err", text: t("saldo.error") });
      }
    } catch {
      setMsg({ kind: "err", text: t("saldo.error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-6 px-5 py-8">
      <Logo mark={28} word={20} />
      {handle && <div className="text-sm text-[var(--muted)]">@{handle}</div>}

      <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-5 text-center">
        <div className="mono text-4xl font-black text-[var(--win)]">🪙 {points}</div>
        <div className="mt-1 text-[12px] text-[var(--muted)]">{t("saldo.points")}</div>
      </div>

      {isAdult ? (
        <div aria-busy={busy}>
          <RewardedButton isAdult={isAdult} force onClaimed={onClaimed} />
        </div>
      ) : (
        <p className="text-center text-xs text-[var(--muted)]">{t("saldo.adultOnly")}</p>
      )}

      {msg && (
        <p
          className={`text-center text-sm font-bold ${
            msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"
          }`}
        >
          {msg.text}
        </p>
      )}
    </main>
  );
}
