"use client";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
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
  const inviteText = t("grupo.inviteText", { code, url });
  const recapLines = rows.map((r, i) => `${i + 1}. @${r.handle} — 🎯 ${r.score}`).join("\n");
  const recapText = `${name} · Vinko\n${recapLines}\n${url}`;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <ShareWhatsApp text={inviteText} event="group_digest_shared"
        className="rounded-[12px] bg-[#25D366] px-4 py-3 text-center text-[14px] font-black text-white">
        {t("grupo.invite")}
      </ShareWhatsApp>
      {rows.some((r) => r.score > 0) && (
        <ShareWhatsApp text={recapText} event="group_digest_shared"
          className="rounded-[12px] border border-[var(--gold)] px-4 py-3 text-center text-[14px] font-black text-[var(--gold)]">
          {t("grupo.share")}
        </ShareWhatsApp>
      )}
    </div>
  );
}
