"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Enhancement de /p (la landing SSR sigue usable sin JS: título+opciones ya
// están en el HTML). Aquí, con sesión, se hace el pick (make_pick, gasta 10
// monedas) y se ve "El termómetro" (consenso). Sin sesión → CTA de entrar.
type Opt = { id: string; label: string };

export function PickPanel({
  porraId, slug, options, status, isTemplate,
}: {
  porraId: string;
  slug: string;
  options: Opt[];
  status: string;
  isTemplate: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [myPick, setMyPick] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isReal = !isTemplate && /^[0-9a-f-]{36}$/.test(porraId);

  useEffect(() => {
    if (!isReal) { setReady(true); return; }
    const sb = supabaseBrowser();
    if (!sb) { setReady(true); return; }
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      setLoggedIn(!!user);
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

  if (!loggedIn) {
    return (
      <Link href={`/login?next=/p/${slug}`}
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)]">
        ⚡ {t("p.join")}
      </Link>
    );
  }

  async function pick(optionId: string) {
    if (busy || myPick || status !== "open") return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: optionId });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("NO_POINTS") ? t("pick.noPoints") : t("pick.err"));
      return;
    }
    capture("pick_made", { is_seed: false });
    setMyPick(optionId);
    setTallies((tl) => ({ ...tl, [optionId]: (tl[optionId] ?? 0) + 1 }));
    router.refresh();
  }

  const total = Object.values(tallies).reduce((a, b) => a + b, 0);

  if (myPick || status !== "open") {
    // El termómetro (consenso) tras haber jugado
    return (
      <section className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("pick.meter")}</p>
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
        {myPick && status === "open" && (
          <p className="text-center text-xs text-[var(--muted)]">{t("pick.locked")}</p>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("pick.spend")}</p>
      {options.map((o) => (
        <button key={o.id} onClick={() => pick(o.id)} disabled={busy}
          className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-left text-[15px] font-bold text-[var(--cream)] disabled:opacity-50 hover:border-[var(--win)]">
          {o.label}
        </button>
      ))}
      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
