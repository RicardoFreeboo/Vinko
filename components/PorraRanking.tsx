import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Ranking de UNA porra (SSR, sin JS): quién puso qué y qué cobra. Filas de
// porra_ranking (0031/0042). Resuelta → acertantes arriba con su pago; cerrada
// sin resolver → participantes con lo puesto y sin pagos; nadie acertó →
// devolución; impugnada ('disputed') → mismo reparto marcado como PROVISIONAL.
export type RankingRow = {
  handle: string;
  avatar_url: string | null;
  option_id: string;
  option_label: string;
  stake: number;
  won: boolean;
  payout: number;
};
type Opt = { id: string; label: string };

const OPT_ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)", "var(--gold)"];

function Avatar({ handle, url }: { handle: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--ink3)] text-[11px] font-black text-[var(--win)]">
      {handle.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PorraRanking({ rows, options, winningOptionId, status }: {
  rows: RankingRow[];
  options: Opt[];
  winningOptionId: string | null;
  status: "open" | "resolved" | "disputed" | "taken_down";
}) {
  const provisional = status === "disputed";
  const resolved = status === "resolved" || provisional; // reparto calculado (firme o provisional)
  const pot = rows.reduce((a, r) => a + r.stake, 0);
  const winners = rows.filter((r) => r.won).length;
  const nobodyWon = resolved && rows.length > 0 && winners === 0;
  const byOpt = new Map<string, { n: number; stake: number }>();
  for (const r of rows) {
    const cur = byOpt.get(r.option_id) ?? { n: 0, stake: 0 };
    byOpt.set(r.option_id, { n: cur.n + 1, stake: cur.stake + r.stake });
  }
  let rank = 0;

  return (
    <section aria-label={t(provisional ? "resolve.rankingProvisional" : resolved ? "resolve.rankingTitle" : "resolve.rankingPending")}
      className="flex flex-col gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: resolved && !provisional ? "var(--win)" : "var(--gold)" }}>
          {t(provisional ? "resolve.rankingProvisional" : resolved ? "resolve.rankingTitle" : "resolve.rankingPending")}
        </p>
        <p className="mono shrink-0 whitespace-nowrap text-[11px] text-[var(--muted)]">
          {rows.length === 1 ? t("resolve.player") : t("resolve.players", { n: String(rows.length) })}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("resolve.none")}</p>
      ) : (
        <>
          {/* resumen: Vinkos en juego + acertantes */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold text-[var(--cream)]">
            <span className="flex items-center gap-1"><VinkoCoin size={14} />{t("resolve.pot", { n: String(pot) })}</span>
            {resolved && !nobodyWon && (
              <span className="text-[var(--win)]">
                {winners === 1 ? t("resolve.winner") : t("resolve.winners", { n: String(winners) })}
              </span>
            )}
          </div>

          {nobodyWon && (
            <p className="rounded-[12px] border border-[var(--gold)] px-3 py-2 text-center text-[13px] font-black text-[var(--gold)]">
              {t("resolve.nobodyWon")}
            </p>
          )}

          {/* reparto por opción (la ganadora, marcada) */}
          <div className="flex flex-col gap-1.5">
            {options.map((o, i) => {
              const accent = OPT_ACCENT[i % OPT_ACCENT.length];
              const s = byOpt.get(o.id) ?? { n: 0, stake: 0 };
              const win = resolved && winningOptionId === o.id;
              const pct = pot > 0 ? Math.round((s.stake / pot) * 100) : 0;
              return (
                <div key={o.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex min-w-0 items-center gap-1.5 font-bold" style={{ color: win ? accent : "var(--cream)" }}>
                      {win && <span className="mono text-[10px] uppercase tracking-[0.1em]">{t("resolve.winningOpt")} ✓</span>}
                      <span className="truncate">{o.label}</span>
                    </span>
                    <span className="mono shrink-0 text-[12px] text-[var(--muted)]">{s.n} · {s.stake}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ink)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: win || !resolved ? accent : "var(--muted2)" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* participantes: acertantes arriba, con su pago */}
          <ol className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const i = options.findIndex((o) => o.id === r.option_id);
              const accent = OPT_ACCENT[(i < 0 ? 0 : i) % OPT_ACCENT.length];
              const pos = r.won ? ++rank : 0;
              return (
                <li key={r.handle}
                  className="flex items-center gap-2.5 rounded-[12px] border px-3 py-2"
                  style={{ borderColor: r.won ? accent : "var(--line)", background: r.won ? "rgba(31,224,122,0.07)" : "transparent" }}>
                  <span className="mono w-4 shrink-0 text-center text-[11px] font-black" style={{ color: r.won ? accent : "var(--muted2)" }}>
                    {r.won ? pos : "·"}
                  </span>
                  <Avatar handle={r.handle} url={r.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-black text-[var(--cream)]">@{r.handle}</span>
                      {r.won && <span className="mono text-[10px] font-black uppercase" style={{ color: accent }}>✓ {t("resolve.won")}</span>}
                    </div>
                    <div className="truncate text-[11px] text-[var(--muted)]">
                      <span style={{ color: accent }}>{r.option_label}</span> · {t("resolve.stake")} {r.stake}
                    </div>
                  </div>
                  <div className="mono shrink-0 text-right text-[13px] font-black">
                    {resolved && r.payout > 0 ? (
                      <span className="flex items-center gap-1" style={{ color: nobodyWon ? "var(--gold)" : accent }}>
                        +{r.payout}<VinkoCoin size={13} />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[var(--muted)]">{r.stake}<VinkoCoin size={13} /></span>
                    )}
                    {resolved && r.payout > 0 && (
                      <div className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: provisional ? "var(--gold)" : "var(--muted2)" }}>
                        {provisional ? t("resolve.provisional") : nobodyWon ? t("resolve.refund") : t("resolve.payout")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
