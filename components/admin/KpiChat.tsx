"use client";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

// Chat con el panel de KPIs: pregunta en lenguaje natural y el modelo contesta
// con los datos reales del momento (ver app/api/admin/kpi-chat/route.ts).
type Msg = { role: "user" | "assistant"; content: string };

const SUGERENCIAS = ["kpichat.q1", "kpichat.q2", "kpichat.q3", "kpichat.q4"];

export function KpiChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null); setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/kpi-chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMsgs(next);
        setErr(j.error === "no_key" ? t("kpichat.noKey") : t("kpichat.err"));
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } catch { setMsgs(next); setErr(t("kpichat.err")); }
    finally { setBusy(false); }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-[rgba(31,224,122,0.2)] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-black text-[var(--cream)]">{t("kpichat.title")}</h2>
        <span className="text-[11px] text-[rgba(244,241,233,0.5)]" style={{ fontFamily: "var(--font-mono2), monospace" }}>{t("kpichat.hint")}</span>
      </div>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGERENCIAS.map((k) => (
            <button key={k} onClick={() => send(t(k))}
              className="rounded-full border border-[rgba(31,224,122,0.25)] px-3 py-1.5 text-[12px] font-bold text-[var(--win)] hover:bg-[rgba(31,224,122,0.08)]">
              {t(k)}
            </button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[92%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              m.role === "user" ? "self-end bg-[rgba(31,224,122,0.14)] text-[var(--cream)]" : "self-start bg-[rgba(255,255,255,0.05)] text-[rgba(244,241,233,0.92)]"}`}>
              {m.content || (busy ? t("kpichat.thinking") : "")}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      {err && <p className="text-[12px] text-[var(--red)]">{err}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("kpichat.placeholder")} disabled={busy}
          className="flex-1 rounded-[10px] border border-[rgba(31,224,122,0.2)] bg-[rgba(0,0,0,0.3)] px-3 py-2.5 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
        <button type="submit" disabled={busy || !input.trim()}
          className="rounded-[10px] bg-[var(--win)] px-4 py-2.5 text-[13px] font-black text-[#060b09] disabled:opacity-50">
          {t("kpichat.send")}
        </button>
      </form>
    </section>
  );
}
