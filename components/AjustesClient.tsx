"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { writeConsent } from "@/components/ConsentBanner";
import { t } from "@/lib/i18n";

// Ajustes de cuenta (RGPD, spec F-10): datos de la cuenta, idioma, consentimiento
// de analítica, exportación (GET /api/me/export) y borrado self-service
// (RPC delete_me → sign out → /). El cliente nunca escribe points: el borrado
// los pone a 0 en servidor.
type Lang = "es" | "en";
type Msg = { kind: "ok" | "err"; text: string } | null;

export function AjustesClient({
  userId, handle, email, lang: initialLang, consent: initialConsent,
}: {
  userId: string; handle: string | null; email: string | null; lang: Lang; consent: boolean;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>(initialLang);
  const [consent, setConsent] = useState(initialConsent);
  const [langMsg, setLangMsg] = useState<Msg>(null);
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delMsg, setDelMsg] = useState<Msg>(null);

  const DELETE_WORD = t("ajustes.deleteWord");
  const canDelete = word.trim().toUpperCase() === DELETE_WORD.toUpperCase() && !deleting;

  // profiles.lang: el cliente puede escribirla (grant de columna en 0003).
  async function changeLang(next: Lang) {
    const prev = lang;
    setLang(next);
    setLangMsg(null);
    const sb = supabaseBrowser();
    if (!sb) { setLangMsg({ kind: "err", text: t("ajustes.noBackend") }); return; }
    const { error } = await sb.from("profiles").update({ lang: next }).eq("id", userId);
    if (error) { setLang(prev); setLangMsg({ kind: "err", text: t("ajustes.error") }); return; }
    setLangMsg({ kind: "ok", text: t("ajustes.saved") });
    router.refresh();
  }

  // Reescribe la cookie vinko_consent y hace que el layout la relea.
  function toggleConsent() {
    const next = !consent;
    setConsent(next);
    writeConsent(next ? "1" : "0");
    router.refresh();
  }

  async function logout() {
    const sb = supabaseBrowser();
    if (sb) await sb.auth.signOut();
    window.location.assign("/");
  }

  // Doble confirmación: botón → panel con palabra escrita → botón rojo.
  async function deleteAccount() {
    if (!canDelete) return;
    const sb = supabaseBrowser();
    if (!sb) { setDelMsg({ kind: "err", text: t("ajustes.noBackend") }); return; }
    setDeleting(true);
    setDelMsg(null);
    const { error } = await sb.rpc("delete_me");
    if (error) {
      setDeleting(false);
      setDelMsg({ kind: "err", text: t("ajustes.deleteError") });
      return;
    }
    await sb.auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* cuenta */}
      <Section title={t("ajustes.account")}>
        <Row label={t("ajustes.handle")} value={handle ? `@${handle}` : "—"} />
        <Row label={t("ajustes.email")} value={email ?? t("ajustes.noEmail")} />
        <div className="mt-1 flex items-center justify-between gap-3">
          {handle ? (
            <Link href={`/u/${handle}`} className="text-[13px] font-bold text-[var(--win)]">
              {t("ajustes.viewProfile")}
            </Link>
          ) : <span />}
          <button type="button" onClick={logout} className="text-[13px] font-bold text-[var(--muted)] underline-offset-2 hover:underline">
            {t("ajustes.logout")}
          </button>
        </div>
      </Section>

      {/* idioma */}
      <Section title={t("ajustes.lang")} hint={t("ajustes.langHint")}>
        <div className="flex gap-2" role="radiogroup" aria-label={t("ajustes.lang")}>
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              onClick={() => changeLang(l)}
              className={`flex-1 rounded-[12px] border px-3 py-2.5 text-[13px] font-bold ${
                lang === l
                  ? "border-[var(--win)] bg-[var(--win)]/10 text-[var(--win)]"
                  : "border-[var(--line)] bg-[var(--ink3)] text-[var(--cream)]"
              }`}
            >
              {t(`ajustes.lang.${l}`)}
            </button>
          ))}
        </div>
        {langMsg && <Note msg={langMsg} />}
      </Section>

      {/* analítica */}
      <Section title={t("ajustes.analytics")} hint={t("ajustes.analyticsHint")}>
        <button
          type="button"
          role="switch"
          aria-checked={consent}
          onClick={toggleConsent}
          className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] px-4 py-3"
        >
          <span className={`text-[13px] font-bold ${consent ? "text-[var(--win)]" : "text-[var(--muted)]"}`}>
            {consent ? t("ajustes.analyticsOn") : t("ajustes.analyticsOff")}
          </span>
          <span
            aria-hidden
            className={`relative h-6 w-11 rounded-full transition-colors ${consent ? "bg-[var(--win)]" : "bg-[var(--muted2)]"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--cream)] transition-transform ${consent ? "translate-x-[22px]" : "translate-x-0.5"}`}
            />
          </span>
        </button>
      </Section>

      {/* datos */}
      <Section title={t("ajustes.data")} hint={t("ajustes.exportHint")}>
        <a
          href="/api/me/export"
          download
          className="rounded-[12px] border border-[var(--win)] px-4 py-3 text-center text-[14px] font-black text-[var(--win)]"
        >
          ⬇ {t("ajustes.export")}
        </a>
      </Section>

      {/* borrar cuenta */}
      <Section title={t("ajustes.danger")} hint={t("ajustes.deleteHint")} danger>
        {!confirming ? (
          <button
            type="button"
            onClick={() => { setConfirming(true); setDelMsg(null); }}
            className="rounded-[12px] border border-[var(--red)]/60 px-4 py-3 text-[14px] font-black text-[var(--red)]"
          >
            {t("ajustes.delete")}
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--red)]/60 bg-[var(--red)]/10 p-3">
            <p className="text-[14px] font-black text-[var(--red)]">{t("ajustes.deleteConfirmTitle")}</p>
            <p className="text-[12px] text-[var(--muted)]">{t("ajustes.deleteConfirmBody", { word: DELETE_WORD })}</p>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={DELETE_WORD}
              autoCapitalize="characters"
              autoComplete="off"
              aria-label={t("ajustes.deleteConfirmBody", { word: DELETE_WORD })}
              className="mono rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-center text-[15px] tracking-[0.2em] text-[var(--cream)] outline-none focus:border-[var(--red)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(false); setWord(""); }}
                disabled={deleting}
                className="flex-none rounded-[12px] border border-[var(--line)] px-4 py-2.5 text-[13px] font-bold text-[var(--cream)]"
              >
                {t("ajustes.cancel")}
              </button>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={!canDelete}
                className="flex-1 rounded-[12px] bg-[var(--red)] px-3 py-2.5 text-[13px] font-black text-[var(--ink)] disabled:opacity-40"
              >
                {deleting ? t("ajustes.deleting") : t("ajustes.deleteYes")}
              </button>
            </div>
            {delMsg && <Note msg={delMsg} />}
          </div>
        )}
      </Section>

      {/* legal */}
      <nav aria-label={t("ajustes.legal")} className="flex gap-4 px-1 text-[12px] font-bold">
        <Link href="/privacidad" className="text-[var(--muted)]">{t("ajustes.privacy")}</Link>
        <Link href="/terminos" className="text-[var(--muted)]">{t("ajustes.terms")}</Link>
      </nav>
    </div>
  );
}

function Section({
  title, hint, danger = false, children,
}: { title: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-2.5 rounded-[14px] border bg-[var(--ink2)] p-4 ${danger ? "border-[var(--red)]/30" : "border-[var(--line)]"}`}>
      <h2 className={`mono text-[10px] uppercase tracking-[0.14em] ${danger ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
        {title}
      </h2>
      {hint && <p className="text-[12px] leading-relaxed text-[var(--muted)]">{hint}</p>}
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <span className="truncate text-[14px] font-bold text-[var(--cream)]">{value}</span>
    </div>
  );
}

function Note({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <p role="status" className={`text-[12px] font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>
      {msg.text}
    </p>
  );
}
