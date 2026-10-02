"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GuestConvert } from "@/components/GuestConvert";
import { PushPrePrompt } from "@/components/PushPrePrompt";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { porraUrl } from "@/lib/share";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// ============================================================================
// RT-03 — la vista de RETO de /p/[slug]: se usa en porras con premio y en
// porras de usuario pequeñas (≤6 participantes). Cara a cara, no termómetro:
// quién va con qué y qué se juega, de un vistazo.
//  · Opciones = botones grandes con los avatares de quien va con cada una.
//  · Elegir abre una hoja de confirmación; sin sesión pide SOLO el nombre
//    (pick de invitado) y después ofrece Google para no perderlo (RT-06).
//  · Se actualiza sola: porra_social cada 15 s con la pestaña visible, y un
//    temporizador la pasa a «Cerrado» a la hora exacta (RT-03).
//  · Tras el cierre, el JUEZ propone el resultado (RT-07) y quien perdería
//    puede estar de acuerdo o no, aquí mismo.
//  · Fechas SIEMPRE en la hora del dispositivo.
// En una porra prize no aparece ni un Vinko (RT-03: «qué desaparece»).
// ============================================================================

export type RetoPick = {
  handle: string | null;
  name: string;
  guest: boolean;
  avatar: string | null;
  option: string;
  idx: number;
  mine: boolean;
};
export type RetoProposal = {
  option_id: string;
  option: string;
  deadline: string;
  by: string;
  mine_objected: boolean;
  mine_confirmed: boolean;
} | null;
export type RetoSocial = { picks: RetoPick[]; proposal?: RetoProposal };

const STAKES = [10, 50, 100];

function fmtLocal(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function AvatarChip({ p, me }: { p: { name: string; avatar: string | null; mine?: boolean }; me?: boolean }) {
  const label = me ? t("reto.me") : p.name;
  return (
    <span className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--ink)] py-0.5 pl-0.5 pr-2">
      {p.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--ink3)] text-[9px] font-black text-[var(--win)]">
          {(p.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="max-w-[9ch] truncate text-[11px] font-bold" style={{ color: me ? "var(--win)" : "var(--cream)" }}>
        {label}
      </span>
    </span>
  );
}

export function RetoView({
  porraId, slug, options, status, winningOptionId, closesAt, resolvesAt,
  stakeKind, stakeText, creatorId, creatorName, judgeId, initialSocial,
}: {
  porraId: string;
  slug: string;
  options: { id: string; label: string }[];
  status: "open" | "resolved" | "disputed" | "taken_down";
  winningOptionId: string | null;
  closesAt: string;
  resolvesAt: string | null;
  stakeKind: "vinkos" | "prize";
  stakeText: string | null;
  creatorId: string | null;
  creatorName: string;
  judgeId: string | null;
  initialSocial: RetoSocial;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<RetoPick[]>(initialSocial.picks ?? []);
  const [proposal, setProposal] = useState<RetoProposal>(initialSocial.proposal ?? null);
  const [uid, setUid] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<{ id: string; label: string; idx: number } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [stake, setStake] = useState(10);
  const [judgePick, setJudgePick] = useState<string | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justPicked, setJustPicked] = useState(false);
  const visible = useRef(true);

  const closed = status !== "open" || Date.parse(closesAt) <= now;
  const resolved = status === "resolved";
  const prize = stakeKind === "prize";
  const mine = picks.find((p) => p.mine) ?? null;
  const isJudge = !!uid && uid === judgeId;
  const isCreator = !!uid && uid === creatorId;
  const amLoser = !!mine && !!proposal && options[mine.idx]?.id !== proposal.option_id;

  // Sesión del que mira (igual que PickPanel: la propia fila sí se puede leer).
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) { setReady(true); return; }
    void sb.auth.getUser().then(({ data: { user } }) => {
      setUid(user?.id ?? null);
      setIsGuest(!!user?.is_anonymous);
      setReady(true);
    });
  }, []);

  // RT-03: /p se actualiza sola — porra_social cada 15 s con la pestaña visible.
  const refresh = useCallback(async () => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.rpc("porra_social", { p_porra: porraId });
    if (error || !data) return;
    const d = data as { picks?: RetoPick[]; proposal?: RetoProposal };
    setPicks(d.picks ?? []);
    setProposal(d.proposal ?? null);
  }, [porraId]);

  useEffect(() => {
    const onVis = () => { visible.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(() => { if (visible.current) void refresh(); }, 15_000);
    // Temporizador del cierre: re-render cada segundo solo en el último minuto.
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  function choose(o: { id: string; label: string }, idx: number) {
    if (closed || mine || busy) return;
    setErr(null);
    setSheet({ id: o.id, label: o.label, idx });
  }

  async function confirmPick() {
    if (!sheet) return;
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true); setErr(null);
    let user = (await sb.auth.getUser()).data.user;
    const guest = !user || user.is_anonymous;
    if (guest) {
      const name = guestName.trim();
      if (name.length < 2) { setBusy(false); setErr(t("reto.guestNamePh")); return; }
      if (!user) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error || !data.user) {
          // Sesiones anónimas apagadas: a /login de siempre.
          setBusy(false);
          router.push(`/login?next=/p/${slug}`);
          return;
        }
        user = data.user;
      }
      let res = await sb.rpc("make_guest_pick", { p_porra: porraId, p_option: sheet.id, p_name: name });
      if (res.error && (res.error.code === "PGRST202" || res.error.code === "42883")) {
        res = await sb.rpc("make_guest_pick", { p_porra: porraId, p_option: sheet.id }); // pre-0057
      }
      if (res.error) { setBusy(false); setErr(mapErr(res.error.message)); return; }
      setUid(user.id); setIsGuest(true);
      capture("pick_made", { is_seed: false, is_guest: true, reto: true });
    } else {
      const { error } = await sb.rpc("make_pick", {
        p_porra: porraId, p_option: sheet.id, p_stake: prize ? null : stake,
      });
      if (error) { setBusy(false); setErr(mapErr(error.message)); return; }
      capture("pick_made", { is_seed: false, is_guest: false, reto: true });
    }
    setBusy(false);
    setSheet(null);
    setJustPicked(true);
    await refresh();
  }

  function mapErr(m: string | undefined): string {
    const s = m ?? "";
    if (s.includes("VINKO_NO_POINTS")) return t("reto.noPoints");
    if (s.includes("VINKO_CLOSED")) return t("reto.closedErr");
    if (s.includes("VINKO_BAD_NAME")) return t("reto.guestNamePh");
    return t("reto.error");
  }

  async function propose() {
    if (!judgePick) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("propose_result", { p_porra: porraId, p_option: judgePick });
    setBusy(false);
    if (error) { setErr(mapErr(error.message)); return; }
    setJudgePick(null);
    await refresh();
    router.refresh();
  }

  async function answer(kind: "agree" | "object") {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc(kind === "agree" ? "confirm_result" : "object_result", { p_porra: porraId });
    setBusy(false);
    if (error) { setErr(mapErr(error.message)); return; }
    await refresh();
    router.refresh();
  }

  async function cancel() {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("void_porra", { p_porra: porraId, p_reason: prize ? "reto cancelado" : "anulada" });
    setBusy(false);
    if (error) { setErr(mapErr(error.message)); return; }
    router.refresh();
  }

  const byIdx = (idx: number) => picks.filter((p) => p.idx === idx);
  const secsLeft = Math.max(0, Math.floor((Date.parse(closesAt) - now) / 1000));
  const lastMinute = !closed && secsLeft <= 60;
  const stakeLine = prize ? stakeText ?? "" : null;
  const winners = resolved ? picks.filter((p) => options[p.idx]?.id === winningOptionId) : [];
  const losers = resolved ? picks.filter((p) => options[p.idx]?.id !== winningOptionId) : [];
  const iWon = resolved && !!mine && options[mine.idx]?.id === winningOptionId;
  const share = mine
    ? t("nueva.sharePick", { opt: options[mine.idx]?.label ?? "", url: porraUrl(slug) })
    : t("nueva.shareText", { title: "", url: porraUrl(slug) });

  return (
    <section aria-label={t("p.options")} className="flex flex-col gap-3">
      {/* ── OPCIONES: botones grandes con los avatares de cada lado ── */}
      <div className={options.length === 2 ? "grid grid-cols-2 gap-2.5" : "flex flex-col gap-2.5"}>
        {options.map((o, i) => {
          const gente = byIdx(i);
          const win = resolved && winningOptionId === o.id;
          const miLado = mine?.idx === i;
          const activo = !closed && !mine && status === "open";
          return (
            <button key={o.id} type="button" disabled={!activo || busy}
              onClick={() => choose(o, i)}
              className="flex min-h-[96px] flex-col items-center justify-start gap-2 rounded-[16px] border-2 px-3 py-3 text-center disabled:cursor-default"
              style={{
                borderColor: win || miLado ? "var(--win)" : "var(--line)",
                background: win ? "rgba(31,224,122,0.10)" : "var(--ink2)",
                boxShadow: win ? "0 0 24px -6px rgba(31,224,122,0.6)" : undefined,
              }}>
              <span className="text-[17px] font-black uppercase leading-tight text-[var(--cream)]">
                {o.label} {win && "✓"}
              </span>
              <span className="flex flex-wrap items-center justify-center gap-1">
                {gente.map((p, j) => <AvatarChip key={j} p={p} me={p.mine} />)}
                {gente.length === 0 && activo && (
                  <span className="text-[12px] font-bold text-[var(--muted)]">{t("reto.youQ")}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── estado / cierre, en LA HORA DEL DISPOSITIVO ── */}
      {!closed && status === "open" && (
        <p className="mono text-center text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
          {t("reto.entryUntil", { date: fmtLocal(closesAt) })}
          {lastMinute && <span className="ml-2 font-black text-[var(--gold)]">0:{String(secsLeft).padStart(2, "0")}</span>}
        </p>
      )}
      <p className="text-center text-[13px] font-black" style={{ color: resolved ? "var(--win)" : "var(--gold)" }}>
        {resolved
          ? t("reto.won", { who: winners.map((w) => (w.mine ? t("reto.me") : w.name)).join(", ") || "—" })
          : closed
            ? proposal
              ? t("reto.proposalPending", { opt: proposal.option })
              : t("reto.closedWaiting")
            : picks.length <= 1
              ? t("reto.waitingRival")
              : t("reto.inPlay")}
      </p>
      {resolved && prize && losers.length > 0 && winners.length > 0 && (
        <p className="text-center text-[14px] font-bold text-[var(--cream)]">
          {mine && !iWon
            ? t("reto.paysYou", { stake: stakeLine ?? "" })
            : t("reto.pays", { who: losers.map((l) => (l.mine ? t("reto.me") : l.name)).join(", "), stake: stakeLine ?? "" })}
        </p>
      )}
      {resolved && prize && (winners.length === 0 || losers.length === 0) && (
        <p className="text-center text-[13px] text-[var(--muted)]">{t("reto.noLoser")}</p>
      )}
      {resolvesAt && !resolved && (
        <p className="mono text-center text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">
          {t("reto.sabe", { when: Date.parse(resolvesAt) - Date.parse(closesAt) < 60_000 ? t("reto.sabeClose") : fmtLocal(resolvesAt) })}
        </p>
      )}

      {/* ── sin cuenta: entrar por login normal también es posible ── */}
      {ready && !uid && !closed && status === "open" && (
        <p className="text-center text-[12px] text-[var(--muted)]">
          {t("reto.haveAccount")}{" "}
          <Link href={`/login?next=/p/${slug}`} className="font-bold text-[var(--win)] underline">{t("reto.enter")}</Link>
        </p>
      )}

      {/* ── tras elegir: compartir + (invitado) guarda tu pick + push ── */}
      {mine && status === "open" && !closed && (
        <ShareWhatsApp text={share} porraId={porraId}
          className="flex items-center justify-center gap-2 rounded-[14px] bg-[#25D366] px-4 py-3.5 text-[15px] font-black text-white">
          {t("p.shareWa")}
        </ShareWhatsApp>
      )}
      {justPicked && isGuest && (
        <p className="text-center text-[12px] font-bold text-[var(--win)]">{t("reto.guestDone")}</p>
      )}
      {isGuest && mine && <GuestConvert slug={slug} />}
      {justPicked && !isGuest && <PushPrePrompt hasValue />}

      {/* ── RT-07: quien perdería responde a la propuesta ── */}
      {proposal && amLoser && status === "open" && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--gold)] bg-[rgba(255,194,61,0.07)] p-4">
          <p className="text-[14px] font-black text-[var(--cream)]">
            {t("reto.saysWon", { judge: proposal.by, opt: proposal.option })}
          </p>
          {proposal.mine_objected ? (
            <p className="text-[12px] text-[var(--muted)]">{t("reto.objected", { judge: proposal.by })}</p>
          ) : proposal.mine_confirmed ? (
            <p className="text-[12px] text-[var(--win)]">{t("reto.agree")} ✓</p>
          ) : (
            <>
              <p className="text-[12px] text-[var(--muted)]">{t("reto.agreeQ")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => answer("agree")}
                  className="rounded-[12px] bg-[var(--win)] px-3 py-3 text-[13px] font-black text-[var(--ink)] disabled:opacity-50">
                  {t("reto.agree")}
                </button>
                <button type="button" disabled={busy} onClick={() => answer("object")}
                  className="rounded-[12px] border border-[var(--red)] px-3 py-3 text-[13px] font-black text-[var(--red)] disabled:opacity-50">
                  {t("reto.object")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── RT-03/RT-07: el panel del juez SOLO tras el cierre, debajo ── */}
      {isJudge && closed && status === "open" && !proposal && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--gold)]/60 bg-[var(--ink2)] p-4">
          <p className="text-[15px] font-black text-[var(--cream)]">{t("reto.judgeQ")}</p>
          <p className="text-[12px] text-[var(--muted)]">{t("reto.judgeHint")}</p>
          <div className={options.length === 2 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
            {options.map((o, i) => (
              <button key={o.id} type="button" onClick={() => setJudgePick(o.id)}
                className="flex flex-col items-center gap-1 rounded-[12px] border-2 px-3 py-2.5"
                style={{
                  borderColor: judgePick === o.id ? "var(--gold)" : "var(--line)",
                  background: judgePick === o.id ? "rgba(255,194,61,0.10)" : "var(--ink)",
                }}>
                <span className="text-[14px] font-black text-[var(--cream)]">{o.label}</span>
                <span className="flex flex-wrap justify-center gap-1">
                  {byIdx(i).map((p, j) => <AvatarChip key={j} p={p} me={p.mine} />)}
                </span>
              </button>
            ))}
          </div>
          {judgePick && (
            <button type="button" disabled={busy} onClick={propose}
              className="rounded-[12px] bg-[var(--gold)] px-3 py-3 text-[14px] font-black text-[var(--ink)] disabled:opacity-50">
              {busy ? "…" : t("reto.confirm")}
            </button>
          )}
        </div>
      )}
      {isJudge && proposal && status === "open" && (
        <p className="text-center text-[12px] text-[var(--muted)]">{t("reto.youProposed", { opt: proposal.option })}</p>
      )}

      {/* ── cancelar (creador, mientras no esté resuelta) ── */}
      {isCreator && status === "open" && (
        <div className="text-center">
          {cancelAsk ? (
            <span className="inline-flex items-center gap-3 text-[12px]">
              <span className="text-[var(--muted)]">{t("reto.cancelConfirm")}</span>
              <button type="button" disabled={busy} onClick={cancel} className="font-black text-[var(--red)]">
                {prize ? t("reto.cancel") : t("reto.cancelVinkos")}
              </button>
              <button type="button" onClick={() => setCancelAsk(false)} className="font-bold text-[var(--muted)]">
                {t("reto.change")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setCancelAsk(true)}
              className="text-[12px] font-bold text-[var(--muted2)] underline decoration-dotted">
              {prize ? t("reto.cancel") : t("reto.cancelVinkos")}
            </button>
          )}
        </div>
      )}

      {err && <p role="alert" className="text-center text-xs font-bold text-[var(--red)]">{err}</p>}

      {/* ── HOJA DE CONFIRMACIÓN (RT-03): un toque nunca fija el pick ── */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => !busy && setSheet(null)}>
          <div className="w-full max-w-[430px] rounded-t-[20px] border-t border-[var(--line)] bg-[var(--ink2)] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}>
            <p className="text-[16px] font-black text-[var(--cream)]">
              {t("reto.confirmTitle", { opt: sheet.label, who: creatorName })}
            </p>
            {prize ? (
              <p className="mt-1 text-[13px] text-[var(--muted)]">{t("reto.confirmPrize", { stake: stakeText ?? "" })}</p>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[12px] text-[var(--muted)]">{t("reto.stake10")}</span>
                {STAKES.map((n) => (
                  <button key={n} type="button" onClick={() => setStake(n)}
                    className="mono rounded-full border px-3 py-1 text-[12px] font-black"
                    style={{ borderColor: stake === n ? "var(--win)" : "var(--line)", color: stake === n ? "var(--win)" : "var(--muted)" }}>
                    🪙 {n}
                  </button>
                ))}
              </div>
            )}
            {!prize && <p className="mt-1 text-[11px] text-[var(--muted2)]">{t("reto.confirmVinkos", { n: String(stake) })}</p>}
            {ready && (!uid || isGuest) && (
              <div className="mt-3">
                <label className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {t("reto.guestName", { who: creatorName })}
                </label>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={24} autoFocus
                  placeholder={t("reto.guestNamePh")}
                  className="mt-1 w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink)] px-4 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
              </div>
            )}
            {err && <p className="mt-2 text-xs font-bold text-[var(--red)]">{err}</p>}
            <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
              <button type="button" disabled={busy} onClick={() => setSheet(null)}
                className="rounded-[13px] border border-[var(--line)] px-4 py-3.5 text-[14px] font-bold text-[var(--muted)]">
                {t("reto.change")}
              </button>
              <button type="button" disabled={busy} onClick={confirmPick}
                className="rounded-[13px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
                {busy ? "…" : t("reto.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
