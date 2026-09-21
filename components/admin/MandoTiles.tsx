// Mando del alfa: las 5 métricas norte con datos REALES (kpi_funnel y
// kpi_kfactor). Cociente sin denominador → "—" con la n al pie; nada se
// estima. "Click → join" no vive en la base: se dice tal cual.
import { Tile } from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import { fmtH, fmtInt, fmtPct, fmtRatio, type Funnel, type KFactor } from "@/components/admin/MetricasData";

const ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)"];

export function MandoTiles({ funnel, kfactor }: { funnel: Funnel | null; kfactor: KFactor | null }) {
  const tts = kfactor?.time_to_share;
  const tiles = [
    {
      key: "share",
      value: tts && tts.n > 0 ? fmtH(tts.median_h) : "—",
      def: tts ? t("admin.m.share.n", { n: fmtInt(tts.n) }) : t("admin.m.share.def"),
    },
    { key: "clickjoin", value: "—", def: t("admin.m.clickjoin.web") },
    {
      key: "joinpick",
      value: funnel ? fmtPct(funnel.first_pick.n, funnel.signups) : "—",
      def: funnel ? t("admin.m.joinpick.n", { n: fmtInt(funnel.first_pick.n), d: fmtInt(funnel.signups) }) : t("admin.m.joinpick.def"),
    },
    {
      key: "invporra",
      value: kfactor ? fmtRatio(kfactor.invitees_validated, kfactor.user_porras, 1) : "—",
      def: kfactor
        ? t("admin.m.invporra.n", { n: fmtInt(kfactor.invitees_validated), d: fmtInt(kfactor.user_porras) })
        : t("admin.m.invporra.def"),
    },
    {
      key: "segunda",
      value: funnel ? fmtInt(funnel.repeat_creator.n) : "—",
      def: funnel ? t("admin.m.segunda.n", { n: fmtInt(funnel.repeat_creator.n), d: fmtInt(funnel.repeat_creator.of) }) : t("admin.m.segunda.def"),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((m, i) => (
        <Tile key={m.key} value={m.value} label={t(`admin.m.${m.key}`)} def={m.def} accent={ACCENT[i]} />
      ))}
    </div>
  );
}
