import { TemasBoard } from "@/components/admin/TemasBoard";
import { EDITORIAL, PROPOSALS } from "@/lib/editorial";
import { t } from "@/lib/i18n";

// PASO 5c — Temas editoriales / IA trending. El perfil oficial de @vinko propone
// porras de temas candentes de España; Ricardo selecciona y aprueba aquí. El cron
// NUNCA publica solo. Publicar → porra source=editorial (fuera de K-factor).
const LABEL_KEYS = [
  "admin.temas.pending", "admin.temas.published", "admin.temas.count",
  "admin.temas.approved", "admin.temas.discarded", "admin.temas.emptyPending",
  "admin.temas.publish", "admin.temas.edit", "admin.temas.discard",
  "admin.temas.video.ready", "admin.temas.video.pending", "admin.temas.view",
  "admin.temas.live",
];

export default function AdminTemas() {
  const labels: Record<string, string> = {};
  for (const k of LABEL_KEYS) labels[k] = t(k);

  const published = EDITORIAL.map((p) => ({
    slug: p.slug,
    title: p.title,
    cat: p.source === "editorial" ? "@vinko" : "",
    hasVideo: !!p.video,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.temas.title")}</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.temas.how")}
        </p>
      </div>
      <TemasBoard labels={labels} proposals={PROPOSALS} published={published} />
    </div>
  );
}
