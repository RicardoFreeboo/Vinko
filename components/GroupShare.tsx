"use client";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// El resumen de la semana + invitación: la tarjeta compartible por WhatsApp es
// a la vez retención y adquisición (§3.6). Solo wa.me con copy de lista blanca.
export function GroupShare({
  code, name, rows, url,
}: {
  code: string;
  name: string;
  rows: { handle: string; score: number }[];
  url: string;
}) {
  function invite() {
    const text = t("grupo.inviteText", { code, url });
    capture("group_digest_shared", { is_seed: false });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  function shareRecap() {
    const lines = rows.map((r, i) => `${i + 1}. @${r.handle} — 🎯 ${r.score}`).join("\n");
    const text = `${name} · Vinko\n${lines}\n${url}`;
    capture("group_digest_shared", { is_seed: false });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button onClick={invite}
        className="rounded-[12px] bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)]">
        {t("grupo.invite")}
      </button>
      {rows.some((r) => r.score > 0) && (
        <button onClick={shareRecap}
          className="rounded-[12px] border border-[var(--gold)] px-4 py-3 text-[14px] font-black text-[var(--gold)]">
          {t("grupo.share")}
        </button>
      )}
    </div>
  );
}
