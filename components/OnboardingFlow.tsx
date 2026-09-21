"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { t as tBase } from "@/lib/i18n";
import {
  AVATAR_STYLES, DEFAULT_AVATAR_STYLE, avatarUrl, avatarStyleOf, type AvatarStyle,
} from "@/lib/avatar";

// Onboarding en 3 pantallas (spec F-08). Un toque por pantalla, rápido:
//  1) año de nacimiento (+18 declarado) + idioma (auto por navegador, editable)
//  2) elige 3 intereses → RPC complete_onboarding (regalo: +1 Escudo, una vez)
//  3) avatar (D-12, 6 estilos DiceBear → RPC set_avatar) y por dónde empezar.
// Puntos: el cliente nunca los toca. Los Vinkos de registro los da el servidor.

export type Lang = "es" | "en";
export type OnboardingProfile = {
  id: string;
  handle: string;
  birthYear: number | null;
  lang: Lang;
  avatarUrl: string | null;
  interests: string[];
  onboarded: boolean;
  shields: number | null;
};

export const INTERESTS = [
  { key: "futbol", emoji: "⚽" },
  { key: "deportes", emoji: "🏀" },
  { key: "realities", emoji: "📺" },
  { key: "musica", emoji: "🎵" },
  { key: "series", emoji: "🎬" },
  { key: "politica", emoji: "🗳️" },
  { key: "tecnologia", emoji: "💻" },
  { key: "memes", emoji: "😂" },
  { key: "mi_vida", emoji: "🫶" },
] as const;
export type InterestKey = (typeof INTERESTS)[number]["key"];
const MAX_INTERESTS = 3;

type Step = 1 | 2 | 3;
type T = (key: string, vars?: Record<string, string>) => string;

// Preview (dev): las claves de messages/parts aún no fusionadas se pasan en
// `dict`. En producción `dict` no existe y todo sale de lib/i18n.
function makeT(dict?: Record<string, string>): T {
  return (key, vars) => {
    const raw = dict?.[key];
    if (raw === undefined) return tBase(key, vars);
    if (!vars) return raw;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), raw);
  };
}

function detectLang(): Lang {
  try { return /^en\b/i.test(navigator.language ?? "") ? "en" : "es"; } catch { return "es"; }
}

// Migración 0036 sin aplicar → la RPC no existe. No bloquea al usuario.
function isMissingRpc(msg: string): boolean {
  return /complete_onboarding|set_avatar|schema cache|does not exist|PGRST202/i.test(msg);
}

const BTN_PRIMARY = "w-full rounded-[13px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)] disabled:opacity-40";
const BTN_SECONDARY = "w-full rounded-[13px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-[15px] font-bold text-[var(--cream)]";

export function OnboardingFlow({
  next, profile, startStep, mock = false, dict,
}: {
  next: string;
  profile: OnboardingProfile;
  startStep?: Step;
  mock?: boolean;
  dict?: Record<string, string>;
}) {
  const t = useMemo(() => makeT(dict), [dict]);
  const router = useRouter();
  const [step, setStep] = useState<Step>(startStep ?? (profile.birthYear ? (profile.onboarded ? 3 : 2) : 1));
  const [lang, setLang] = useState<Lang>(profile.lang);
  const [gift, setGift] = useState(false);
  const [notice, setNotice] = useState("");

  function go(href: string) {
    if (mock) return; // preview: sin navegación
    router.push(href.startsWith("/") ? href : "/feed");
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-8 pt-8">
      <header className="flex items-center justify-between">
        <Logo mark={30} word={20} />
        <Dots step={step} />
      </header>
      <p className="eyebrow mt-6 text-[11px]">{t("onb.step", { n: String(step) })}</p>
      {notice && (
        <p role="status" className="mt-2 rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2 text-[12px] text-[var(--muted)]">{notice}</p>
      )}
      {step === 1 && (
        <StepAge t={t} profile={profile} lang={lang} setLang={setLang} mock={mock}
          onDone={() => { setNotice(""); setStep(2); }} onLogin={() => go("/login")} />
      )}
      {step === 2 && (
        <StepInterests t={t} profile={profile} lang={lang} mock={mock}
          onDone={(g, pending) => { setGift(g); setNotice(pending ? t("onb.err.pending") : ""); setStep(3); }} />
      )}
      {step === 3 && (
        <StepStart t={t} profile={profile} next={next} gift={gift || mock} mock={mock} go={go} />
      )}
    </main>
  );
}

function Dots({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-1.5 rounded-full transition-all ${n === step ? "w-6 bg-[var(--win)]" : n < step ? "w-1.5 bg-[var(--win)]" : "w-1.5 bg-[var(--ink3)]"}`} />
      ))}
    </div>
  );
}

// ---------- 1) Año de nacimiento + idioma ----------
function StepAge({ t, profile, lang, setLang, mock, onDone, onLogin }: {
  t: T; profile: OnboardingProfile; lang: Lang; setLang: (l: Lang) => void; mock: boolean;
  onDone: () => void; onLogin: () => void;
}) {
  const [year, setYear] = useState(profile.birthYear ? String(profile.birthYear) : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const thisYear = new Date().getFullYear();

  // Idioma auto por navegador, salvo que el perfil ya lo tenga en inglés.
  useEffect(() => { if (profile.lang !== "en") setLang(detectLang()); }, [profile.lang, setLang]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const y = parseInt(year, 10);
    if (!y || y < 1900 || y > thisYear) { setErr(t("age.bad")); return; }
    if (thisYear - y < 14) { setErr(t("age.under14")); return; } // edad mínima de registro
    if (mock) { onDone(); return; }
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setBusy(false); onLogin(); return; }
    const { error } = await sb.from("profiles").update({ birth_year: y, lang }).eq("id", user.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-1 flex-col gap-4">
      <h1 className="text-[26px] font-black leading-tight tracking-tight">{t("onb.s1.title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("onb.s1.sub")}</p>
      <input
        inputMode="numeric"
        autoFocus
        value={year}
        onChange={(e) => { setYear(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
        placeholder={t("age.ph")}
        aria-label={t("age.ph")}
        className="mono rounded-[13px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-center text-lg tracking-[0.2em] text-[var(--cream)] outline-none focus:border-[var(--win)]"
      />
      <div>
        <p className="mb-2 text-xs font-bold text-[var(--muted)]">{t("onb.lang")}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("onb.lang")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
              className={`rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-colors ${lang === l ? "border-[var(--win)] bg-[rgba(31,224,122,0.12)] text-[var(--cream)]" : "border-[var(--line)] bg-[var(--ink2)] text-[var(--muted)]"}`}>
              {t(`onb.lang.${l}`)}
            </button>
          ))}
        </div>
        {lang === "en" && <p className="mt-2 text-[11px] leading-snug text-[var(--muted2)]">{t("onb.lang.hint")}</p>}
      </div>
      {err && <span role="alert" className="text-xs text-[var(--red)]">{err}</span>}
      <div className="mt-auto flex flex-col gap-3">
        <button type="submit" disabled={busy || year.length < 4} className={BTN_PRIMARY}>{busy ? "…" : t("onb.next")}</button>
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">{t("age.body")}</p>
      </div>
    </form>
  );
}

// ---------- 2) Elige 3 intereses ----------
function StepInterests({ t, profile, lang, mock, onDone }: {
  t: T; profile: OnboardingProfile; lang: Lang; mock: boolean;
  onDone: (gift: boolean, pendingMigration: boolean) => void;
}) {
  const known = new Set<string>(INTERESTS.map((i) => i.key));
  const [sel, setSel] = useState<string[]>(profile.interests.filter((k) => known.has(k)).slice(0, MAX_INTERESTS));
  const [full, setFull] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(k: string) {
    setErr("");
    if (sel.includes(k)) { setSel(sel.filter((x) => x !== k)); setFull(false); return; }
    if (sel.length >= MAX_INTERESTS) { setFull(true); return; }
    setSel([...sel, k]);
  }

  async function submit() {
    if (!sel.length) return;
    if (mock) { onDone(true, false); return; }
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true);
    const { data, error } = await sb.rpc("complete_onboarding", { p_interests: sel, p_lang: lang });
    setBusy(false);
    if (error) {
      if (isMissingRpc(error.message)) { onDone(false, true); return; }
      setErr(t("onb.err.save"));
      return;
    }
    const r = (data ?? {}) as { gift_shield?: boolean };
    onDone(!!r.gift_shield, false);
  }

  return (
    <div className="mt-2 flex flex-1 flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[26px] font-black leading-tight tracking-tight">{t("onb.s2.title")}</h1>
        <span className="mono shrink-0 text-sm font-bold text-[var(--win)]" aria-live="polite">{t("onb.s2.count", { n: String(sel.length) })}</span>
      </div>
      <p className="text-sm text-[var(--muted)]">{t("onb.s2.sub")}</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("onb.s2.title")}>
        {INTERESTS.map(({ key, emoji }) => {
          const on = sel.includes(key);
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => toggle(key)}
              className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-2 py-3 text-[12px] font-bold leading-tight transition-colors ${on ? "border-[var(--win)] bg-[rgba(31,224,122,0.12)] text-[var(--cream)]" : "border-[var(--line)] bg-[var(--ink2)] text-[var(--muted)]"}`}>
              <span className="text-[26px] leading-none" aria-hidden>{emoji}</span>
              <span className="text-center">{t(`onb.int.${key}`)}</span>
            </button>
          );
        })}
      </div>
      {full && <p className="text-[12px] text-[var(--gold)]">{t("onb.s2.max")}</p>}
      {err && <span role="alert" className="text-xs text-[var(--red)]">{err}</span>}
      <div className="mt-auto">
        <button type="button" onClick={submit} disabled={busy || !sel.length} className={BTN_PRIMARY}>{busy ? "…" : t("onb.next")}</button>
      </div>
    </div>
  );
}

// ---------- 3) Avatar + por dónde empezar ----------
function StepStart({ t, profile, next, gift, mock, go }: {
  t: T; profile: OnboardingProfile; next: string; gift: boolean; mock: boolean; go: (href: string) => void;
}) {
  const photo = profile.avatarUrl && !avatarStyleOf(profile.avatarUrl) ? profile.avatarUrl : null; // foto de Google
  const [style, setStyle] = useState<AvatarStyle | "photo">(avatarStyleOf(profile.avatarUrl) ?? (photo ? "photo" : DEFAULT_AVATAR_STYLE));
  const [err, setErr] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const fromPorra = next.startsWith("/p/");

  async function pick(s: AvatarStyle | "photo") {
    const prev = style;
    setStyle(s); // optimista: el tap responde al instante
    setErr("");
    if (mock || s === prev) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    // Volver a la foto del proveedor: escritura directa (grant de avatar_url en 0003).
    const { error } = s === "photo"
      ? await sb.from("profiles").update({ avatar_url: photo }).eq("id", profile.id)
      : await sb.rpc("set_avatar", { p_style: s });
    if (error) { setStyle(prev); setErr(isMissingRpc(error.message) ? t("onb.err.pending") : t("onb.err.save")); }
  }

  return (
    <div className="mt-2 flex flex-1 flex-col gap-4">
      <h1 className="text-[26px] font-black leading-tight tracking-tight">{t("onb.s3.title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("onb.s3.sub")}</p>
      {gift && (
        <p className="flex items-center gap-2 rounded-[12px] border border-[rgba(255,194,61,0.35)] bg-[rgba(255,194,61,0.08)] px-3 py-2.5 text-[13px] font-bold text-[var(--gold)]">
          <span aria-hidden>🛡️</span>{t("onb.s3.gift")}
        </p>
      )}

      <section>
        <p className="text-xs font-bold text-[var(--muted)]">{t("onb.s3.avatar")}</p>
        <div className="mt-2 flex flex-wrap gap-2.5" role="radiogroup" aria-label={t("onb.s3.avatar")}>
          {photo && <AvatarChoice src={photo} on={style === "photo"} onClick={() => pick("photo")} />}
          {AVATAR_STYLES.map((s) => (
            <AvatarChoice key={s} src={avatarUrl(profile.handle, s)} on={style === s} onClick={() => pick(s)} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted2)]">{t("onb.s3.avatarHint")}</p>
        {err && <span role="alert" className="text-xs text-[var(--red)]">{err}</span>}
      </section>

      <section className="mt-auto flex flex-col gap-2.5">
        <p className="text-xs font-bold text-[var(--muted)]">{t("onb.s3.what")}</p>
        {fromPorra && (
          <button type="button" onClick={() => go(next)} className={BTN_PRIMARY}>{t("onb.s3.back")}</button>
        )}
        <button type="button" onClick={() => go("/grupos?nuevo=1")} className={fromPorra ? BTN_SECONDARY : BTN_PRIMARY}>
          {t("onb.s3.group")}
        </button>
        <button type="button" aria-expanded={joinOpen} onClick={() => setJoinOpen(!joinOpen)} className={BTN_SECONDARY}>
          {t("onb.s3.join")}
        </button>
        {joinOpen && (
          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-3 text-[13px] leading-snug text-[var(--muted)]">
            <p>{t("onb.s3.joinBody")}</p>
            <button type="button" onClick={() => go(fromPorra ? "/feed" : next)} className="mt-2 text-[13px] font-black text-[var(--win)]">
              {t("onb.s3.joinOk")}
            </button>
          </div>
        )}
        <button type="button" onClick={() => go(fromPorra ? "/feed" : next)} className="py-2 text-sm font-bold text-[var(--muted)]">
          {t("onb.s3.skip")}
        </button>
      </section>
    </div>
  );
}

function AvatarChoice({ src, on, onClick }: { src: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`rounded-full p-0.5 transition-transform ${on ? "ring-2 ring-[var(--win)] scale-105" : "ring-1 ring-[var(--line)] opacity-80"}`}>
      {/* SVG remoto (DiceBear) o foto del proveedor: <img> a propósito, sin optimizador */}
      <img src={src} alt="" width={52} height={52} loading="lazy" className="h-[52px] w-[52px] rounded-full bg-[var(--ink3)] object-cover" />
    </button>
  );
}
