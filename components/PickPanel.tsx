"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StakePicker } from "@/components/StakePicker";
import { GuestConvert } from "@/components/GuestConvert";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

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
// Toggle Puntos/Dinero: mismo teaser "muy pronto" del feed, sobre las MISMAS
// opciones (sin tarjeta aparte). Visible SOLO para +18 registrado (regla de
// oro 8: nunca a menores ni a invitados/visitantes sin sesión) y mientras el
// dinero real no esté aprobado (moneyLive=false). No mueve dinero: es maqueta.
type Opt = { id: string; label: string };

const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export function PickPanel({
  porraId, slug, options, status, isTemplate, closesAt, isAdult = false, moneyLive = false,
}: {
  porraId: string;
  slug: string;
  options: Opt[];
  status: string;
  isTemplate: boolean;
  closesAt: string;
  isAdult?: boolean;   // +18 registrado: ve el toggle del modo dinero ("muy pronto")
  moneyLive?: boolean; // el dinero real está aprobado → MoneyMount toma el relevo, sin maqueta
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);   // sesión anónima (user.is_anonymous)
  const [guestOff, setGuestOff] = useState(false); // sin modo invitado → CTA de entrar
  const [myPick, setMyPick] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [stake, setStake] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [money, setMoney] = useState(false);          // modo dinero (maqueta)
  const [moneyPick, setMoneyPick] = useState<string | null>(null);
  const [eurCents, setEurCents] = useState(1000);     // 10 € por defecto

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

  async function pick(optionId: string) {
    if (busy || myPick || closed) return;
    if (!loggedIn || isGuest) { await guestPick(optionId); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: optionId, p_stake: stake });
    setBusy(false);
    if (error) {
      const m = error.message;
      setErr(m.includes("NO_POINTS") ? t("pick.noPoints") : m.includes("CLOSED") ? t("resolve.closedErr") : t("pick.err"));
      return;
    }
    capture("pick_made", { is_seed: false, stake, is_guest: false });
    markPicked(optionId);
  }

  const total = Object.values(tallies).reduce((a, b) => a + b, 0);
  const guestMode = !loggedIn || isGuest;
  // El toggle solo para +18 registrado (nunca invitado ni sin sesión) y sin
  // dinero real aprobado. Si el dinero real está vivo, MoneyMount toma el relevo.
  const showToggle = isAdult && loggedIn && !isGuest && !moneyLive;

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
        {guestMode ? (
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("guest.free")}</p>
        ) : (
          <>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("resolve.spendN", { n: String(stake) })}</p>
            <StakePicker value={stake} onChange={setStake} />
          </>
        )}
        {options.map((o) => (
          <button key={o.id} onClick={() => pick(o.id)} disabled={busy}
            className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-left text-[15px] font-bold text-[var(--cream)] disabled:opacity-50 hover:border-[var(--win)]">
            {o.label}
          </button>
        ))}
        {guestMode && !isGuest && (
          <p className="text-center text-xs text-[var(--muted)]">{t("guest.tapHint")}</p>
        )}
        {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
      </section>
      {isGuest && <GuestConvert slug={slug} hasPick={false} />}
    </>
  );

  // Cuerpo de DINERO (maqueta "muy pronto"): las MISMAS opciones con entrada en
  // €. No hace pick real ni toca puntos; el importe solo se muestra.
  const moneyBody = (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-[12px] border border-[var(--gold)]/50 bg-[var(--ink2)] px-3 py-2.5">
        <span className="text-[15px] font-bold text-[var(--gold)]">€</span>
        <input type="number" inputMode="decimal" min={1} max={500} value={eurCents / 100}
          onChange={(e) => setEurCents(Math.max(100, Math.min(50000, Math.round(Number(e.target.value) * 100))))}
          aria-label={t("pick.modeMoney")}
          className="w-full bg-transparent text-[16px] font-black text-[var(--cream)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        <span className="mono shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">{t("pick.soon")}</span>
      </div>
      {options.map((o) => {
        const chosen = moneyPick === o.id;
        return (
          <button key={o.id} type="button" onClick={() => setMoneyPick(o.id)}
            className="flex items-center justify-between rounded-[14px] border-2 px-4 py-3.5 text-left text-[15px] font-bold text-[var(--cream)]"
            style={{
              borderColor: chosen ? "var(--gold)" : "var(--line)",
              background: chosen ? "rgba(255,209,102,0.14)" : "var(--ink2)",
            }}>
            <span className="min-w-0 truncate">{o.label}</span>
            {chosen
              ? <span className="mono shrink-0 text-[var(--gold)]">✓</span>
              : <span className="mono shrink-0 text-[13px] font-black text-[var(--gold)]">{eur(eurCents)}</span>}
          </button>
        );
      })}
      {moneyPick
        ? <p className="text-center text-[13px] font-bold text-[var(--gold)]">{t("pick.moneyMock", { amount: eur(eurCents) })}</p>
        : <p className="text-center text-[11px] leading-snug text-[var(--muted2)]">{t("teaser.money.note")}</p>}
    </section>
  );

  return (
    <>
      {showToggle && (
        <div className="flex w-max items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--ink2)] p-1">
          <button type="button" onClick={() => { setMoney(false); setMoneyPick(null); }}
            className={`rounded-full px-3 py-1 text-[12px] font-black ${!money ? "bg-[var(--win)] text-[var(--ink)]" : "text-[var(--muted)]"}`}>
            🪙 {t("pick.modePoints")}
          </button>
          <button type="button" onClick={() => setMoney(true)}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-black ${money ? "bg-[var(--gold)] text-[var(--ink)]" : "text-[var(--muted)]"}`}>
            💶 {t("pick.modeMoney")}
            <span className="rounded-full bg-black/25 px-1 text-[8px] font-bold uppercase tracking-wide">{t("pick.soon")}</span>
          </button>
        </div>
      )}
      {showToggle && money ? moneyBody : pointsBody}
    </>
  );
}
