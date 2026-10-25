"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StakePicker } from "@/components/StakePicker";
import { GuestConvert } from "@/components/GuestConvert";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { PushPrePrompt } from "@/components/PushPrePrompt";

// Enhancement de /p (la landing SSR sigue usable sin JS: título+opciones ya
// están en el HTML). Con sesión se hace el pick (make_pick con el importe del
// StakePicker) y se ve "El termómetro" (consenso).
//
// Sin sesión (F-01, pronóstico invitado): las opciones se pueden tocar igual.
// Al tocar una se abre una sesión ANÓNIMA de Supabase (signInAnonymously) y se
// guarda el pick con make_guest_pick (0 Vinkos, cuenta en el termómetro, no en
// la clasificación). Debajo, <GuestConvert/>: Google en 1 toque conserva el
// mismo usuario y activa el pick. Si el proyecto no admite sesiones anónimas
// (signInAnonymously falla) → CTA de entrar de siempre (/login?next=…).
//
// Pasada la hora de cierre → estado "Cerrada" (el juez resolverá). Resuelta →
// no pinta nada: el ranking de la porra (SSR) toma el relevo.
//
// Solo-puntos: no hay modo dinero. El pick es siempre con Vinkos (o invitado,
// gratis); ni € ni maqueta de dinero.
type Opt = { id: string; label: string };

export function PickPanel({
  porraId, slug, options, status, isTemplate, closesAt,
}: {
  porraId: string;
  slug: string;
  options: Opt[];
  status: string;
  isTemplate: boolean;
  closesAt: string;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);   // sesión anónima (user.is_anonymous)
  const [guestOff, setGuestOff] = useState(false); // sin modo invitado → CTA de entrar
  const [myPick, setMyPick] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [stake, setStake] = useState(10);
  const [confirmId, setConfirmId] = useState<string | null>(null); // FX-10: opción tocada, pendiente de confirmar
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isReal = !isTemplate && /^[0-9a-f-]{36}$/.test(porraId);
  const closed = status === "open" && Date.parse(closesAt) <= Date.now();

  useEffect(() => {
    if (!isReal) { setReady(true); return; }
    const sb = supabaseBrowser();
    if (!sb) { setGuestOff(true); setReady(true); return; }
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      setLoggedIn(!!user);
      setIsGuest(!!user?.is_anonymous);
      if (user) {
        const { data } = await sb.from("picks").select("option_id").eq("porra_id", porraId).eq("user_id", user.id).maybeSingle();
        setMyPick(data?.option_id ?? null);
      }
      const { data: tal } = await sb.from("porra_tallies").select("option_id, n").eq("porra_id", porraId);
      const map: Record<string, number> = {};
      for (const row of tal ?? []) map[row.option_id] = row.n;
      setTallies(map);
      setReady(true);
    })();
  }, [porraId, isReal]);

  if (isTemplate) return null;
  if (!ready) return null;
  if (status !== "open") return null;

  // Comportamiento anterior: sin sesión y sin modo invitado → entrar.
  if (!loggedIn && !closed && guestOff) {
    return (
      <Link href={`/login?next=/p/${slug}`}
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)]">
        ⚡ {t("p.join")}
      </Link>
    );
  }

  function markPicked(optionId: string) {
    setMyPick(optionId);
    setTallies((tl) => ({ ...tl, [optionId]: (tl[optionId] ?? 0) + 1 }));
    router.refresh();
  }

  // Pick invitado (F-01): sesión anónima si aún no la hay + make_guest_pick.
  async function guestPick(optionId: string) {
    const sb = supabaseBrowser();
    if (!sb) { setGuestOff(true); return; }
    setBusy(true); setErr(null);
    if (!loggedIn) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data?.user) {
        // Sesiones anónimas apagadas en el proyecto (o sin red): CTA de entrar.
        setBusy(false); setGuestOff(true);
        return;
      }
      setLoggedIn(true); setIsGuest(true);
    }
    const { error } = await sb.rpc("make_guest_pick", { p_porra: porraId, p_option: optionId });
    setBusy(false);
    if (error) {
      if (error.code === "PGRST202") { // 0040 aún sin aplicar: fuera del modo invitado, CTA de entrar
        await sb.auth.signOut();
        setLoggedIn(false); setIsGuest(false); setGuestOff(true);
        return;
      }
      setErr(error.message.includes("CLOSED") ? t("resolve.closedErr") : t("guest.err"));
      return;
    }
    capture("pick_made", { is_seed: false, is_guest: true });
    markPicked(optionId);
  }

  // FX-10: con sesión real, tocar una opción NO gasta: abre la confirmación
  // (importe + botón). El pick invitado (gratis) sigue siendo de un toque.
  async function pick(optionId: string) {
    if (busy || myPick || closed) return;
    if (!loggedIn || isGuest) { await guestPick(optionId); return; }
    setErr(null);
    setConfirmId(optionId);
  }

  async function confirmPick() {
    if (busy || myPick || closed || !confirmId) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: confirmId, p_stake: stake });
    setBusy(false);
    if (error) {
      const m = error.message;
      setErr(m.includes("NO_POINTS") ? t("pick.noPoints") : m.includes("CLOSED") ? t("resolve.closedErr") : t("pick.err"));
      return;
    }
    capture("pick_made", { is_seed: false, stake, is_guest: false });
    const picked = confirmId;
    setConfirmId(null);
    markPicked(picked);
  }

  const total = Object.values(tallies).reduce((a, b) => a + b, 0);
  const guestMode = !loggedIn || isGuest;

  // Cuerpo de PUNTOS: termómetro (ya jugado/cerrado) o la propia selección.
  const pointsBody = (myPick || closed) ? (
    <>
      <section className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: closed ? "var(--gold)" : "var(--muted)" }}>
          {closed ? t("resolve.closedTag") : t("pick.meter")}
        </p>
        {options.map((o) => {
          const n = tallies[o.id] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <div key={o.id} className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-3">
              <div className="flex items-center justify-between text-sm font-bold text-[var(--cream)]">
                <span>{o.label}{myPick === o.id ? ` · ${t("pick.yours")}` : ""}</span>
                <span className="mono text-[var(--win)]">{pct}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--ink)]">
                <div className="h-full rounded-full bg-[var(--win)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        <p className="text-center text-xs text-[var(--muted)]">
          {closed ? t("resolve.closedNote") : isGuest ? t("guest.locked") : t("pick.locked")}
        </p>
      </section>
      {isGuest && <GuestConvert slug={slug} hasPick={!!myPick} />}
    </>
  ) : (
    <>
      <section className="flex flex-col gap-2">
        {guestMode && (
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("guest.free")}</p>
        )}
        {options.map((o) => (
          <button key={o.id} onClick={() => pick(o.id)} disabled={busy}
            className="rounded-[14px] border bg-[var(--ink2)] px-4 py-3.5 text-left text-[15px] font-bold text-[var(--cream)] disabled:opacity-50 hover:border-[var(--win)]"
            style={{ borderColor: confirmId === o.id ? "var(--win)" : "var(--line)" }}>
            {o.label}{confirmId === o.id ? " ✓" : ""}
          </button>
        ))}
        {/* FX-10: confirmación con el importe ANTES de gastar nada */}
        {!guestMode && confirmId && (
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--win)] bg-[var(--ink2)] p-3">
            <p className="text-[13px] font-black text-[var(--cream)]">
              {t("pick.confirmTitle", { opt: options.find((o) => o.id === confirmId)?.label ?? "" })}
            </p>
            <StakePicker value={stake} onChange={setStake} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmId(null)} disabled={busy}
                className="flex-none rounded-[12px] border border-[var(--line)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--cream)]">
                {t("pick.confirmCancel")}
              </button>
              <button type="button" onClick={confirmPick} disabled={busy}
                className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-2.5 text-[14px] font-black text-[var(--ink)] disabled:opacity-50">
                {busy ? "…" : t("pick.confirmCta", { n: String(stake) })}
              </button>
            </div>
          </div>
        )}
        {guestMode && !isGuest && (
          <p className="text-center text-xs text-[var(--muted)]">{t("guest.tapHint")}</p>
        )}
        {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
      </section>
      {isGuest && <GuestConvert slug={slug} hasPick={false} />}
    </>
  );

  return (
    <>
      {pointsBody}
      {/* RT-05: el pre-aviso de push sale cuando aporta algo — justo tras elegir */}
      {myPick && loggedIn && !isGuest && <PushPrePrompt hasValue />}
    </>
  );
}
