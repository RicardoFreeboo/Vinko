"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Invitación a ser el juez de una porra (arbiter_status='invited'). Aceptar o
// rechazar → arbiter_respond (0031). `compact` = versión de lista del buzón.
export function ArbiterPanel({ porraId, slug, title, compact = false }: {
  porraId: string;
  slug: string;
  title?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "accepted" | "declined">(null);
  const [err, setErr] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (busy) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("arbiter_respond", { p_porra: porraId, p_accept: accept });
    setBusy(false);
    if (error) { setErr(t("arbiter.err")); return; }
    setDone(accept ? "accepted" : "declined");
    router.refresh();
  }

  const buttons = done ? (
    <p className="text-[13px] font-bold" style={{ color: done === "accepted" ? "var(--win)" : "var(--muted)" }}>
      {t(done === "accepted" ? "arbiter.accepted" : "arbiter.declined")}
    </p>
  ) : (
    <div className="flex gap-2">
      <button type="button" onClick={() => respond(true)} disabled={busy}
        className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-2.5 text-[13px] font-black text-[var(--ink)] disabled:opacity-50">
        {t("arbiter.accept")}
      </button>
      <button type="button" onClick={() => respond(false)} disabled={busy}
        className="rounded-[12px] border border-[var(--line)] px-3 py-2.5 text-[13px] font-bold text-[var(--muted)] disabled:opacity-50">
        {t("arbiter.decline")}
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--gold)] bg-[var(--ink2)] px-4 py-3">
        <Link href={`/p/${slug}`} className="text-[14px] font-bold text-[var(--cream)]">{title ?? slug}</Link>
        {buttons}
        {err && <p className="text-xs text-[var(--red)]">{err}</p>}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("arbiter.tag")}</p>
      <p className="text-[13px] text-[var(--muted)]">{t("arbiter.body")}</p>
      {buttons}
      {err && <p className="text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
