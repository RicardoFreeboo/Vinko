"use client";

// Flujo self-service de VINKO ADS (VINKO_PANTALLAS A2–A5): 3 pasos (formato ·
// porra+público · presupuesto). Mismo sistema visual que la app (tokens de
// globals.css, verde+oro), SIN moneda ni degradado. Llama a:
//   · ads-suggest (Edge Function, Haiku) para 3 ideas de pregunta — opcional,
//     si no hay clave o falla, el anunciante la escribe a mano;
//   · create_campaign (RPC) al final: crea la campaña en BORRADOR (sin cobro).
// El pago con tarjeta (Stripe) es un paso posterior: aquí nada toca dinero del
// jugador y la campaña nace en borrador hasta que se conecte el pago B2B.
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X, ArrowRight, Sparkles, Check, Award, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type Goal = "awareness" | "opinion" | "traffic";
type Idea = { pregunta: string; opciones: string[] };

const GOALS: Goal[] = ["awareness", "opinion", "traffic"];
// Formatos de la spec. En el MVP solo la porra patrocinada está operativa; el
// resto se muestran como "Próximamente" (no seleccionables todavía).
const FORMATS = [
  { id: "porra", price: "ads.nueva.fmt.porra.price", live: true },
  { id: "league", price: "ads.nueva.fmt.league.price", live: false },
  { id: "prize", price: "ads.nueva.fmt.prize.price", live: false },
  { id: "video", price: "ads.nueva.fmt.video.price", live: false },
  { id: "receipt", price: "ads.nueva.fmt.receipt.price", live: false },
] as const;
const CITIES = ["Bogotá", "Medellín", "Cali", "Barranquilla"];
const BUDGETS = [50, 120, 300];
const PRICE_BASE = 0.1;     // USD/voto
const PRICE_FOUNDER = 0.08; // −20 % fundador

const WIN = "var(--win)";

export function AdsNuevaClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>("awareness");
  const [brand, setBrand] = useState("");
  const [brief, setBrief] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [ideaMsg, setIdeaMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [allCountry, setAllCountry] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [budget, setBudget] = useState(120);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  const cleanOpts = useMemo(() => opts.map((o) => o.trim()).filter(Boolean), [opts]);
  const votes = Math.max(0, Math.round(budget / PRICE_FOUNDER));
  const contentOk = brand.trim().length >= 2 && question.trim().length >= 5 && cleanOpts.length >= 2;

  async function suggest() {
    setIdeaBusy(true);
    setIdeaMsg(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setIdeaMsg(t("ads.nueva.ideasNone")); return; }
      const brandLine = [brand.trim(), brief.trim()].filter(Boolean).join(" · ");
      const { data, error } = await sb.functions.invoke("ads-suggest", {
        body: { brief: brandLine, objective: goal, market: "CO" },
      });
      const list = (data as { ideas?: Idea[] } | null)?.ideas ?? [];
      if (error || !list.length) setIdeaMsg(t("ads.nueva.ideasNone"));
      else setIdeas(list.slice(0, 3));
    } catch {
      setIdeaMsg(t("ads.nueva.ideasNone"));
    } finally {
      setIdeaBusy(false);
    }
  }

  function pickIdea(i: Idea) {
    setQuestion(i.pregunta);
    const o = i.opciones.filter(Boolean);
    setOpts(o.length >= 2 ? o : [...o, "", ""].slice(0, 2));
  }

  async function launch() {
    setBusy(true);
    setErr(false);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setErr(true); return; }
      const { data, error } = await sb.rpc("create_campaign", {
        p_name: brand.trim(),
        p_market: "CO",
        p_budget_cents: Math.round(budget * 100),
        p_objective: goal,
        p_format: "sponsored_porra",
        p_cities: allCountry ? [] : cities,
        p_cta_text: ctaText.trim() || null,
        p_cta_url: ctaUrl.trim() || null,
        p_question: question.trim(),
        p_options: cleanOpts,
      });
      if (error || !data) { setErr(true); return; }
      const campaignId = data as string;
      // Intenta el pago con Stripe Checkout. Si no hay Stripe (gated) o falla, la
      // campaña queda en borrador y mostramos la pantalla de «creada».
      try {
        const { data: co } = await sb.functions.invoke("ads-checkout", {
          body: { campaign_id: campaignId, origin: window.location.origin },
        });
        const payUrl = (co as { url?: string } | null)?.url;
        if (payUrl) { window.location.href = payUrl; return; }
      } catch { /* sin Stripe: cae a borrador */ }
      setDoneId(campaignId);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  // --- pantalla final: campaña creada (borrador) ---
  if (doneId) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[rgba(31,224,122,0.14)]">
          <Check className="text-[var(--win)]" size={34} strokeWidth={3} />
        </span>
        <h1 className="text-[1.6rem] font-black text-[var(--cream)]">{t("ads.nueva.done.head")}</h1>
        <p className="max-w-[340px] text-[15px] leading-relaxed text-[var(--muted)]">{t("ads.nueva.done.draft")}</p>
        <button
          onClick={() => router.push("/ads/panel")}
          className="mt-2 flex h-[54px] w-full items-center justify-center rounded-full bg-[var(--win)] text-[16px] font-black text-[var(--ink)]"
          style={{ boxShadow: "0 5px 0 var(--windeep)" }}
        >
          {t("ads.nueva.done.panel")}
        </button>
      </main>
    );
  }

  const heads = ["ads.nueva.s1.head", "ads.nueva.s2.head", "ads.nueva.s3.head", "ads.nueva.s4.head"];
  const lit = [1, step >= 1 ? 1 : 0, step >= 3 ? 1 : 0]; // 3 segmentos; pasos 1 y 2 comparten el 2.º

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-0 pb-28">
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => (step === 0 ? router.push("/ads") : setStep((s) => s - 1))}
          aria-label={t("ads.nueva.back")}
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)]"
        >
          <ChevronLeft size={21} />
        </button>
        <div className="text-center">
          <div className="eyebrow text-[var(--muted)]">{t("ads.nueva.step", { n: String(step >= 2 ? 3 : step + 1) })}</div>
          <b className="text-[16px] text-[var(--cream)]">{t(heads[step])}</b>
        </div>
        <button
          onClick={() => router.push("/ads")}
          aria-label="Cerrar"
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)]"
        >
          <X size={19} />
        </button>
      </header>

      <div className="mt-4 flex gap-1.5 px-[18px]">
        {lit.map((on, i) => (
          <span key={i} className="h-[5px] flex-1 rounded-[3px]" style={{ background: on ? WIN : "var(--ink3)" }} />
        ))}
      </div>

      <div className="flex-1 px-[18px] pt-5">
        {step === 0 && <StepFormato goal={goal} setGoal={setGoal} />}
        {step === 1 && (
          <StepContenido
            brand={brand} setBrand={setBrand} brief={brief} setBrief={setBrief}
            ideas={ideas} ideaBusy={ideaBusy} ideaMsg={ideaMsg} onSuggest={suggest} onPick={pickIdea}
            question={question} setQuestion={setQuestion} opts={opts} setOpts={setOpts}
            ctaText={ctaText} setCtaText={setCtaText} ctaUrl={ctaUrl} setCtaUrl={setCtaUrl}
          />
        )}
        {step === 2 && (
          <StepPublico allCountry={allCountry} setAllCountry={setAllCountry} cities={cities} setCities={setCities} votes={votes} />
        )}
        {step === 3 && <StepPago budget={budget} setBudget={setBudget} votes={votes} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-[18px] pb-7">
        {err && <p className="mb-2 text-center text-[13px] font-semibold text-[var(--red)]">{t("ads.nueva.err")}</p>}
        <button
          disabled={(step === 1 && !contentOk) || busy}
          onClick={() => (step < 3 ? setStep((s) => s + 1) : launch())}
          className="flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--win)] text-[16px] font-black text-[var(--ink)] disabled:opacity-40"
          style={{ boxShadow: "0 5px 0 var(--windeep)" }}
        >
          {busy
            ? t("ads.nueva.creating")
            : step === 3
              ? `${t("ads.nueva.launch")} · ${budget} USD`
              : step === 1
                ? t("ads.nueva.nextPublic")
                : step === 2
                  ? t("ads.nueva.nextBudget")
                  : t("ads.nueva.next")}
          {step < 3 && <ArrowRight size={19} strokeWidth={2.4} />}
        </button>
      </div>
    </main>
  );
}

// ---------- paso 1: objetivo y formato ----------
function StepFormato({ goal, setGoal }: { goal: Goal; setGoal: (g: Goal) => void }) {
  return (
    <>
      <div className="eyebrow text-[var(--muted)]">{t("ads.nueva.goalLabel")}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {GOALS.map((g) => {
          const on = goal === g;
          return (
            <button
              key={g}
              onClick={() => setGoal(g)}
              className="h-9 rounded-full border px-3 text-[13px] font-semibold"
              style={{
                borderColor: on ? WIN : "var(--line)",
                background: on ? "rgba(31,224,122,.12)" : "transparent",
                color: on ? WIN : "var(--cream)",
              }}
            >
              {t(`ads.nueva.goal.${g}`)}
            </button>
          );
        })}
      </div>

      <div className="eyebrow mt-6 text-[var(--muted)]">{t("ads.nueva.formatLabel")}</div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {FORMATS.map((f) => {
          const on = f.live; // en MVP solo la porra está activa y seleccionada
          return (
            <div
              key={f.id}
              className="flex items-start gap-3 rounded-2xl p-3.5"
              style={{ background: "var(--ink2)", border: `1.5px solid ${on ? WIN : "var(--line)"}`, opacity: f.live ? 1 : 0.6 }}
            >
              <span
                className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full"
                style={{ border: `2px solid ${on ? WIN : "var(--muted2)"}` }}
              >
                {on && <i className="h-[11px] w-[11px] rounded-full" style={{ background: WIN }} />}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <b className="text-[16px] text-[var(--cream)]">{t(`ads.nueva.fmt.${f.id}.name`)}</b>
                  {f.live ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide" style={{ background: WIN, color: "var(--ink)" }}>
                      {t("ads.nueva.recommended")}
                    </span>
                  ) : (
                    <span className="mono text-[9.5px] font-bold uppercase tracking-wide text-[var(--muted2)]">{t("ads.nueva.soon")}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[13.5px] text-[var(--muted)]">{t(`ads.nueva.fmt.${f.id}.desc`)}</div>
                <div className="mono mt-1.5 text-[12px] font-bold" style={{ color: f.live ? WIN : "var(--cream)" }}>{t(f.price)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- paso 2a: la porra (ideas con IA) ----------
function StepContenido(p: {
  brand: string; setBrand: (v: string) => void; brief: string; setBrief: (v: string) => void;
  ideas: Idea[]; ideaBusy: boolean; ideaMsg: string | null; onSuggest: () => void; onPick: (i: Idea) => void;
  question: string; setQuestion: (v: string) => void; opts: string[]; setOpts: (v: string[]) => void;
  ctaText: string; setCtaText: (v: string) => void; ctaUrl: string; setCtaUrl: (v: string) => void;
}) {
  const field = "w-full rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3 text-[15px] text-[var(--cream)] placeholder:text-[var(--muted2)] outline-none focus:border-[var(--win)]";
  return (
    <>
      <div className="eyebrow text-[var(--muted)]">{t("ads.nueva.brandLabel")}</div>
      <input className={`${field} mt-2`} value={p.brand} onChange={(e) => p.setBrand(e.target.value)} placeholder={t("ads.nueva.brandPlaceholder")} maxLength={80} />

      <div className="eyebrow mt-4 text-[var(--muted)]">{t("ads.nueva.briefLabel")}</div>
      <textarea className={`${field} mt-2 resize-none`} rows={2} value={p.brief} onChange={(e) => p.setBrief(e.target.value)} placeholder={t("ads.nueva.briefPlaceholder")} maxLength={300} />

      <button
        onClick={p.onSuggest}
        disabled={p.ideaBusy || p.brand.trim().length < 2}
        className="mt-3 flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--win)] disabled:opacity-40"
      >
        <Sparkles size={15} /> {p.ideaBusy ? t("ads.nueva.ideasBusy") : t("ads.nueva.ideasCta")}
      </button>

      {p.ideas.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {p.ideas.map((i, k) => {
            const on = p.question.trim() === i.pregunta.trim();
            return (
              <button
                key={k}
                onClick={() => p.onPick(i)}
                className="flex items-start gap-3 rounded-[14px] p-3 text-left"
                style={{ background: "var(--ink2)", border: `1.5px solid ${on ? WIN : "var(--line)"}` }}
              >
                <span className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full" style={{ border: `2px solid ${on ? WIN : "var(--muted2)"}` }}>
                  {on && <i className="h-[11px] w-[11px] rounded-full" style={{ background: WIN }} />}
                </span>
                <div>
                  <b className="text-[15px] text-[var(--cream)]">{i.pregunta}</b>
                  <div className="text-[13px] text-[var(--muted)]">{i.opciones.join(" · ")}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {p.ideaMsg && <p className="mt-2 text-[13px] text-[var(--muted)]">{p.ideaMsg}</p>}

      <div className="eyebrow mt-5 text-[var(--muted)]">{t("ads.nueva.qLabel")}</div>
      <input className={`${field} mt-2`} value={p.question} onChange={(e) => p.setQuestion(e.target.value)} placeholder={t("ads.nueva.qPlaceholder")} maxLength={160} />

      <div className="eyebrow mt-4 text-[var(--muted)]">{t("ads.nueva.optLabel")}</div>
      <div className="mt-2 flex flex-col gap-2">
        {p.opts.map((o, k) => (
          <input
            key={k}
            className={field}
            value={o}
            onChange={(e) => p.setOpts(p.opts.map((x, j) => (j === k ? e.target.value : x)))}
            placeholder={t("ads.nueva.optPlaceholder", { n: String(k + 1) })}
            maxLength={60}
          />
        ))}
        {p.opts.length < 4 && (
          <button onClick={() => p.setOpts([...p.opts, ""])} className="self-start text-[13px] font-bold text-[var(--muted)]">
            + {t("ads.nueva.optAdd")}
          </button>
        )}
      </div>

      <div className="eyebrow mt-5 text-[var(--muted)]">{t("ads.nueva.ctaLabel")}</div>
      <input className={`${field} mt-2`} value={p.ctaText} onChange={(e) => p.setCtaText(e.target.value)} placeholder={t("ads.nueva.ctaPlaceholder")} maxLength={80} />
      <input className={`${field} mt-2`} value={p.ctaUrl} onChange={(e) => p.setCtaUrl(e.target.value)} placeholder={t("ads.nueva.ctaUrlPlaceholder")} maxLength={200} inputMode="url" />
    </>
  );
}

// ---------- paso 2b: público ----------
function StepPublico(p: {
  allCountry: boolean; setAllCountry: (v: boolean) => void; cities: string[]; setCities: (v: string[]) => void; votes: number;
}) {
  function toggleCity(c: string) {
    p.setAllCountry(false);
    p.setCities(p.cities.includes(c) ? p.cities.filter((x) => x !== c) : [...p.cities, c]);
  }
  return (
    <>
      <div className="flex h-[50px] items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 font-semibold text-[var(--cream)]">
        🇨🇴 Colombia<span className="flex-1" /><span className="text-[13px] text-[var(--muted)]">{t("ads.nueva.marketOnly")}</span>
      </div>

      <div className="eyebrow mt-4 text-[var(--muted)]">{t("ads.nueva.citiesLabel")}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {CITIES.map((c) => {
          const on = !p.allCountry && p.cities.includes(c);
          return (
            <button key={c} onClick={() => toggleCity(c)} className="h-9 rounded-full border px-3 text-[13px] font-semibold"
              style={{ borderColor: on ? WIN : "var(--line)", background: on ? "rgba(31,224,122,.12)" : "transparent", color: on ? WIN : "var(--cream)" }}>
              {c}
            </button>
          );
        })}
        <button onClick={() => { p.setAllCountry(true); p.setCities([]); }} className="h-9 rounded-full border px-3 text-[13px] font-semibold"
          style={{ borderColor: p.allCountry ? WIN : "var(--line)", background: p.allCountry ? "rgba(31,224,122,.12)" : "transparent", color: p.allCountry ? WIN : "var(--cream)" }}>
          {t("ads.nueva.cityAll")}
        </button>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-[var(--muted2)]">
        <ShieldCheck size={13} /> {t("ads.nueva.segmentNote")}
      </p>

      <div className="mt-4 rounded-[16px] border p-4" style={{ background: "rgba(31,224,122,.06)", borderColor: "rgba(31,224,122,.3)" }}>
        <div className="eyebrow">{t("ads.nueva.reachLabel")}</div>
        <div className="mt-2 flex gap-7">
          <div>
            <div className="mono text-[20px] font-bold text-[var(--cream)]">{(p.votes * 10).toLocaleString("es-CO")}</div>
            <div className="text-[12.5px] text-[var(--muted)]">{t("ads.nueva.reachPeople")}</div>
          </div>
          <div>
            <div className="mono text-[20px] font-bold text-[var(--cream)]">{t("ads.nueva.reachAbout")}</div>
            <div className="text-[12.5px] text-[var(--muted)]">{t("ads.nueva.reachRate")}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- paso 3: presupuesto y pago ----------
function StepPago(p: { budget: number; setBudget: (v: number) => void; votes: number }) {
  const [custom, setCustom] = useState(false);
  return (
    <>
      <div className="eyebrow text-[var(--muted)]">{t("ads.nueva.budgetLabel")}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[52px] font-black leading-none text-[var(--cream)]">{p.budget}</span>
        <span className="mono text-[18px] font-bold text-[var(--cream)]">USD</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {BUDGETS.map((b) => {
          const on = !custom && p.budget === b;
          return (
            <button key={b} onClick={() => { setCustom(false); p.setBudget(b); }} className="h-9 rounded-full border px-3.5 text-[14px] font-bold"
              style={{ borderColor: on ? "var(--cream)" : "var(--line)", background: on ? "var(--cream)" : "transparent", color: on ? "var(--ink)" : "var(--cream)" }}>
              {b}
            </button>
          );
        })}
        <button onClick={() => setCustom(true)} className="h-9 rounded-full border px-3.5 text-[14px] font-bold"
          style={{ borderColor: custom ? "var(--cream)" : "var(--line)", background: custom ? "var(--cream)" : "transparent", color: custom ? "var(--ink)" : "var(--cream)" }}>
          {t("ads.nueva.custom")}
        </button>
        {custom && (
          <input type="number" min={50} value={p.budget} onChange={(e) => p.setBudget(Math.max(50, Number(e.target.value) || 50))}
            className="h-9 w-24 rounded-full border border-[var(--line)] bg-[var(--ink2)] px-3 text-[14px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
        )}
      </div>

      <div className="mt-4 flex flex-col rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] px-3.5">
        <Row label={t("ads.nueva.sumPrice")}>
          <span className="mr-1.5 text-[var(--muted2)] line-through">{PRICE_BASE.toFixed(2).replace(".", ",")}</span>
          {PRICE_FOUNDER.toFixed(2).replace(".", ",")} USD
        </Row>
        <Row label={t("ads.nueva.sumVotes")} border>≈ {p.votes.toLocaleString("es-CO")}</Row>
        <Row label={t("ads.nueva.sumPays")} border>{t("ads.nueva.paysValue")}</Row>
      </div>

      <p className="mt-2.5 flex items-center gap-2 text-[13px] font-bold text-[var(--gold)]">
        <Award size={15} /> {t("ads.nueva.founder")}
      </p>

      <div className="eyebrow mt-5 text-[var(--muted)]">{t("ads.nueva.payLabel")}</div>
      <div className="mt-2 flex items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3 text-[13.5px] text-[var(--muted)]">
        <ShieldCheck size={18} className="flex-none text-[var(--muted2)]" /> {t("ads.nueva.paySoon")}
      </div>
      <p className="mt-2 text-[12.5px] text-[var(--muted2)]">{t("ads.nueva.reviewNote")}</p>
    </>
  );
}

function Row({ label, children, border }: { label: string; children: ReactNode; border?: boolean }) {
  return (
    <div className="flex h-[46px] items-center" style={border ? { borderTop: "1px solid var(--line)" } : undefined}>
      <span className="text-[14.5px] text-[var(--muted)]">{label}</span>
      <span className="flex-1" />
      <b className="text-[14.5px] text-[var(--cream)]">{children}</b>
    </div>
  );
}
