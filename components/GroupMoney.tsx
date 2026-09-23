"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { money, payTarget } from "@/lib/p2p";

// P2P sin custodia dentro de un grupo. La gente se paga DIRECTO (Bizum/PayPal);
// Vinko solo calcula quién paga a quién y guarda el estado. Sin pasarela, sin
// comisión de Vinko, sin saldos. Todo pasa por RPCs p2p_* (0048).

type Pool = {
  id: string; title: string; options: string[]; stake_minor: number; currency: string;
  status: "open" | "closed" | "resolved" | "void"; winning_idx: number | null;
  closes_at: string; participants: number; my_option: number | null;
};
type Entry = { user_id: string; handle: string; avatar_url: string | null; option_idx: number; is_me: boolean };
type Settlement = {
  id: string; from_user: string; from_handle: string; to_user: string; to_handle: string;
  pay_handle: string | null; amount_minor: number; currency: string;
  status: "pending" | "paid" | "confirmed"; i_pay: boolean; i_receive: boolean;
};
type Detail = {
  id: string; title: string; options: string[]; stake_minor: number; currency: string;
  status: Pool["status"]; winning_idx: number | null; is_judge: boolean;
  entries: Entry[]; settlements: Settlement[];
};

const card = "rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4";
const chip = "rounded-full border px-3 py-1.5 text-[13px] font-bold";

function errMsg(msg?: string): string {
  const m = msg || "";
  if (m.includes("UNDERAGE")) return t("p2p.errUnderage");
  if (m.includes("TOO_FEW")) return t("p2p.errTooFew");
  if (m.includes("CLOSED") || m.includes("DONE")) return t("p2p.errClosed");
  return t("p2p.err");
}

function endOfDayIso(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function GroupMoney({ groupId, myId, myPayHandle }: { groupId: string; myId: string; myPayHandle: string | null }) {
  void myId;
  const [pools, setPools] = useState<Pool[]>([]);
  const [detail, setDetail] = useState<Record<string, Detail>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState(myPayHandle ?? "");
  const [handleSaved, setHandleSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formulario de creación
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [stakeEur, setStakeEur] = useState("5");
  const [close, setClose] = useState<0 | 1>(0);

  const reload = useCallback(async () => {
    const sb = supabaseBrowser(); if (!sb) return;
    const { data } = await sb.rpc("p2p_group_list", { p_group: groupId });
    setPools(Array.isArray(data) ? (data as Pool[]) : []);
  }, [groupId]);

  useEffect(() => { reload(); }, [reload]);

  async function loadDetail(id: string) {
    const sb = supabaseBrowser(); if (!sb) return;
    const { data } = await sb.rpc("p2p_pool_get", { p_pool: id });
    if (data) setDetail((d) => ({ ...d, [id]: data as Detail }));
  }

  function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detail[id]) loadDetail(id);
  }

  async function saveHandle() {
    const sb = supabaseBrowser(); if (!sb) return;
    const v = handle.trim();
    if (v && (v.length < 3 || v.length > 80)) { setErr(t("p2p.err")); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.from("profiles").update({ pay_handle: v || null }).eq("id", myId);
    setBusy(false);
    if (error) { setErr(t("p2p.err")); return; }
    setHandleSaved(true); setTimeout(() => setHandleSaved(false), 1500);
  }

  async function create() {
    const sb = supabaseBrowser(); if (!sb) return;
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    const stake = Math.round(parseFloat(stakeEur.replace(",", ".")) * 100);
    if (title.trim().length < 3 || clean.length < 2 || !(stake >= 100 && stake <= 50000)) { setErr(t("p2p.err")); return; }
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("p2p_pool_create", {
      p_group: groupId, p_title: title.trim(), p_options: clean,
      p_stake_minor: stake, p_currency: "EUR", p_closes_at: endOfDayIso(close),
    });
    setBusy(false);
    if (error) { setErr(errMsg(error.message)); return; }
    setTitle(""); setOpts(["", ""]); setStakeEur("5"); setClose(0); setCreating(false);
    await reload();
  }

  async function call(fn: string, args: Record<string, unknown>, poolId: string) {
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) { setErr(errMsg(error.message)); return; }
    await Promise.all([reload(), loadDetail(poolId)]);
  }

  const optLabel = (p: { options: string[]; winning_idx: number | null }, i: number | null) =>
    i == null ? "" : p.options[i] ?? "";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("p2p.title")}</p>
        <p className="text-[11px] text-[var(--muted)]">{t("p2p.subtitle")}</p>
      </div>

      {/* cómo te pagan */}
      <div className={card}>
        <p className="text-sm font-bold text-[var(--cream)]">{t("p2p.payHandleTitle")}</p>
        <div className="mt-2 flex gap-2">
          <input value={handle} onChange={(e) => { setHandle(e.target.value); setErr(null); }}
            placeholder={t("p2p.payHandlePh")}
            className="mono flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={saveHandle} disabled={busy}
            className="rounded-[10px] border border-[var(--gold)] px-4 text-[13px] font-black text-[var(--gold)] disabled:opacity-50">
            {handleSaved ? t("p2p.saved") : t("p2p.save")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">{t("p2p.payHandleHint")}</p>
      </div>

      {/* lista de porras */}
      {pools.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("p2p.none")}</p>
      ) : (
        pools.map((p) => {
          const d = detail[p.id];
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className={card}>
              <button onClick={() => toggle(p.id)} className="flex w-full items-center justify-between gap-2 text-left">
                <div className="min-w-0">
                  <div className="truncate font-black text-[var(--cream)]">{p.title}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {money(p.stake_minor, p.currency)} · {t("p2p.participants", { n: String(p.participants) })}
                    {p.status === "resolved" && p.winning_idx != null && <> · {t("p2p.winner", { opt: optLabel(p, p.winning_idx) })}</>}
                  </div>
                </div>
                <span className={`${chip} shrink-0`} style={{
                  borderColor: p.status === "open" ? "var(--win)" : "var(--line)",
                  color: p.status === "open" ? "var(--win)" : "var(--muted)",
                }}>{t(`p2p.status.${p.status}`)}</span>
              </button>

              {isOpen && d && (
                <div className="mt-3 flex flex-col gap-3 border-t border-[var(--line)] pt-3">
                  {/* opciones: elegir / cambiar (solo abierta) */}
                  {p.status === "open" && (
                    <div>
                      <p className="mb-1.5 text-[11px] text-[var(--muted)]">
                        {p.my_option == null ? t("p2p.pickOption") : t("p2p.myPick", { opt: optLabel(p, p.my_option) })}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {d.options.map((o, i) => (
                          <button key={i} disabled={busy} onClick={() => call("p2p_pool_join", { p_pool: p.id, p_option_idx: i }, p.id)}
                            className={chip} style={{
                              borderColor: p.my_option === i ? "var(--win)" : "var(--line)",
                              color: p.my_option === i ? "var(--win)" : "var(--cream)",
                              background: p.my_option === i ? "rgba(31,224,122,0.08)" : "transparent",
                            }}>{o}</button>
                        ))}
                      </div>
                      {p.my_option != null && (
                        <button disabled={busy} onClick={() => call("p2p_pool_leave", { p_pool: p.id }, p.id)}
                          className="mt-2 text-[12px] font-bold text-[var(--red)]">{t("p2p.leave")}</button>
                      )}
                    </div>
                  )}

                  {/* juez: resolver / anular */}
                  {d.is_judge && (p.status === "open" || p.status === "closed") && (
                    <div className="rounded-[10px] border border-[var(--gold)]/40 p-3">
                      <p className="text-[12px] font-bold text-[var(--gold)]">{t("p2p.resolveTitle")}</p>
                      <p className="mb-2 text-[11px] text-[var(--muted)]">{t("p2p.resolveHint")}</p>
                      <div className="flex flex-wrap gap-2">
                        {d.options.map((o, i) => (
                          <button key={i} disabled={busy} onClick={() => call("p2p_pool_resolve", { p_pool: p.id, p_winning_idx: i }, p.id)}
                            className={chip} style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>{o}</button>
                        ))}
                      </div>
                      <button disabled={busy} onClick={() => call("p2p_pool_void", { p_pool: p.id }, p.id)}
                        className="mt-2 text-[12px] font-bold text-[var(--muted)]">{t("p2p.voidCta")}</button>
                    </div>
                  )}

                  {/* reparto: quién paga a quién */}
                  {p.status === "resolved" && (
                    <div>
                      <p className="mb-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("p2p.ledgerTitle")}</p>
                      {d.settlements.length === 0 ? (
                        <p className="text-[12px] text-[var(--muted)]">{t("p2p.noSettlements")}</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {d.settlements.map((s) => <SettleRow key={s.id} s={s} busy={busy} onCall={(fn) => call(fn, { p_settlement: s.id }, p.id)} />)}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] leading-snug text-[var(--muted)]">{t("p2p.legal")}</p>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* crear */}
      {!creating ? (
        <button onClick={() => setCreating(true)}
          className="rounded-[12px] border border-dashed border-[var(--win)] px-4 py-3 text-sm font-black text-[var(--win)]">
          + {t("p2p.new")}
        </button>
      ) : (
        <div className={card}>
          <p className="text-sm font-bold text-[var(--cream)]">{t("p2p.new")}</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("p2p.titlePh")}
            className="mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <div className="mt-2 flex flex-col gap-2">
            {opts.map((o, i) => (
              <input key={i} value={o} onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))}
                placeholder={t("p2p.optionPh", { n: String(i + 1) })}
                className="w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            ))}
            {opts.length < 6 && (
              <button onClick={() => setOpts([...opts, ""])} className="self-start text-[12px] font-bold text-[var(--gold)]">+ {t("p2p.addOption")}</button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted)]">{t("p2p.stake")}</span>
            {["5", "10", "20"].map((v) => (
              <button key={v} onClick={() => setStakeEur(v)} className={chip}
                style={{ borderColor: stakeEur === v ? "var(--win)" : "var(--line)", color: stakeEur === v ? "var(--win)" : "var(--cream)" }}>{v}€</button>
            ))}
            <input value={stakeEur} onChange={(e) => setStakeEur(e.target.value)} inputMode="decimal"
              className="w-16 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-2 py-1.5 text-center text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{t("p2p.stakeHint")}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted)]">{t("p2p.closeLabel")}</span>
            {([0, 1] as const).map((v) => (
              <button key={v} onClick={() => setClose(v)} className={chip}
                style={{ borderColor: close === v ? "var(--win)" : "var(--line)", color: close === v ? "var(--win)" : "var(--cream)" }}>
                {v === 0 ? t("p2p.today") : t("p2p.tomorrow")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={create} disabled={busy}
              className="flex-1 rounded-[10px] bg-[var(--win)] px-4 py-2.5 text-sm font-black text-[var(--ink)] disabled:opacity-50">
              {busy ? t("p2p.creating") : t("p2p.create")}
            </button>
            <button onClick={() => { setCreating(false); setErr(null); }} className="rounded-[10px] border border-[var(--line)] px-4 text-sm font-bold text-[var(--muted)]">
              {t("p2p.back")}
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}

function SettleRow({ s, busy, onCall }: { s: Settlement; busy: boolean; onCall: (fn: string) => void }) {
  const [copied, setCopied] = useState(false);
  const tgt = payTarget(s.pay_handle, s.amount_minor, s.currency);
  const amount = money(s.amount_minor, s.currency);
  const statusTxt = s.status === "confirmed" ? t("p2p.statusConfirmed") : s.status === "paid" ? t("p2p.statusPaid") : t("p2p.statusPending");
  const statusColor = s.status === "confirmed" ? "var(--win)" : s.status === "paid" ? "var(--gold)" : "var(--muted)";

  async function copy() {
    try { await navigator.clipboard.writeText(tgt.copy || `${s.to_handle} · ${amount}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  }

  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--ink)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-[13px] text-[var(--cream)]">
          {s.i_pay ? <span>{t("p2p.iPay", { who: `@${s.to_handle}` })}</span>
            : s.i_receive ? <span>{t("p2p.iReceive", { who: `@${s.from_handle}` })}</span>
            : <span className="text-[var(--muted)]">{t("p2p.othersPay", { from: `@${s.from_handle}`, to: `@${s.to_handle}` })}</span>}
          <span className="ml-1 font-black">{amount}</span>
        </div>
        <span className="shrink-0 text-[11px] font-bold" style={{ color: statusColor }}>{statusTxt}</span>
      </div>

      {s.i_pay && s.status !== "confirmed" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tgt.kind === "paypal" && tgt.href && (
            <a href={tgt.href} target="_blank" rel="noopener noreferrer"
              className="rounded-[9px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[var(--ink)]">{t("p2p.payNow")}</a>
          )}
          {tgt.display && (
            <button onClick={copy} className="rounded-[9px] border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold text-[var(--cream)]">
              {copied ? t("p2p.copied") : `${tgt.display} · ${t("p2p.copy")}`}
            </button>
          )}
          {s.status === "pending" ? (
            <button disabled={busy} onClick={() => onCall("p2p_settle_mark_paid")}
              className="rounded-[9px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)]">{t("p2p.markPaid")}</button>
          ) : (
            <button disabled={busy} onClick={() => onCall("p2p_settle_unmark")}
              className="rounded-[9px] border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold text-[var(--muted)]">{t("p2p.undo")}</button>
          )}
          {tgt.kind === "bizum" && <span className="w-full text-[10px] text-[var(--muted)]">{t("p2p.bizumHint")}</span>}
        </div>
      )}

      {s.i_receive && s.status === "paid" && (
        <button disabled={busy} onClick={() => onCall("p2p_settle_confirm")}
          className="mt-2 rounded-[9px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[var(--ink)]">{t("p2p.confirm")}</button>
      )}
      {s.i_receive && s.status === "pending" && s.pay_handle == null && (
        <p className="mt-2 text-[10px] text-[var(--muted)]">{t("p2p.needHandle")}</p>
      )}
    </div>
  );
}
