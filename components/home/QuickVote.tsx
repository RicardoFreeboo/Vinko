"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { optionAccent, optionLetter } from "@/components/vote/VoteOption";
import { t } from "@/lib/i18n";

// Votar desde el inicio (VINKO_PANTALLAS 04, .mini-vote): un toque = tu pick
// con la entrada mínima y se abre la predicción («después de votar», 02). Si el
// servidor dice que no (cerrada, etc.), también se abre: allí se explica. Sin
// Vinkos suficientes, aviso con enlace a Saldo (regalo diario y goteo).
type Opt = { id: string; idx: number; label: string };

export function QuickVote({ porraId, slug, options, stake }: {
  porraId: string; slug: string; options: Opt[]; stake: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [noPoints, setNoPoints] = useState(false);

  async function vote(optionId: string) {
    const sb = supabaseBrowser();
    if (!sb || busy) return;
    setBusy(optionId);
    const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: optionId, p_stake: stake });
    if (error?.message?.includes("VINKO_NO_POINTS")) {
      setBusy(null);
      setNoPoints(true);
      return;
    }
    router.push(`/p/${slug}`);
  }

  return (
    <>
      <div className={options.length === 2 ? "mt-3 flex gap-2" : "mt-3 flex flex-col gap-2"}>
        {options.map((o) => (
          <button key={o.id} type="button" disabled={!!busy} onClick={() => vote(o.id)}
            className="flex h-12 min-w-0 flex-1 items-center gap-[9px] rounded-[13px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-[13px] text-left text-[15px] font-bold text-[var(--cream)] disabled:opacity-70"
            style={busy === o.id ? { borderColor: "var(--win)", background: "rgba(31,224,122,0.18)" } : undefined}>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full border-2 font-black"
              style={{ borderColor: optionAccent(o.idx), color: optionAccent(o.idx), fontFamily: "var(--mono)", fontSize: 12.5 }}>
              {optionLetter(o.idx)}
            </span>
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </div>
      {noPoints && (
        <Link href="/saldo" className="mt-2 block text-center text-[13px] font-bold text-[var(--gold)]">
          {t("home.noPoints")}
        </Link>
      )}
    </>
  );
}
