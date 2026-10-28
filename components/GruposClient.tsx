"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Crear un grupo o entrar con un código (al final del inicio, VINKO_PANTALLAS
// 04: la tarjeta «+» del carrusel baja hasta aquí). Tus grupos ya salen arriba
// como tarjetas con tu puesto de la semana.
export function GruposClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const sb = supabaseBrowser();
    if (!sb) return;
    if (name.trim().length < 3 || name.trim().length > 40) { setErr(t("grupos.badName")); return; }
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("create_group", { p_name: name.trim() });
    setBusy(false);
    if (error) { setErr(t("grupos.badName")); return; }
    router.push(`/g/${data}`);
  }

  async function join() {
    const sb = supabaseBrowser();
    if (!sb) return;
    if (!code.trim()) { setErr(t("grupos.badCode")); return; }
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("join_group", { p_code: code.trim() });
    setBusy(false);
    if (error) { setErr(t("grupos.badCode")); return; }
    router.push(`/g/${data}`);
  }

  const input = "min-w-0 flex-1 rounded-[13px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-3.5 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
  return (
    <section id="nuevo-grupo" className="flex scroll-mt-4 flex-col gap-3 px-[18px]">
      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[15px]">
        <p className="text-[16px] font-bold text-[var(--cream)]">{t("grupos.create")}</p>
        <div className="mt-2.5 flex gap-2">
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }}
            placeholder={t("grupos.createPh")} className={input} />
          <button type="button" onClick={create} disabled={busy}
            className="rounded-full bg-[var(--win)] px-5 text-[15px] font-black text-[var(--ink)] disabled:opacity-50"
            style={{ boxShadow: "0 4px 0 var(--windeep)" }}>
            {t("grupos.createCta")}
          </button>
        </div>
      </div>

      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[15px]">
        <p className="text-[16px] font-bold text-[var(--cream)]">{t("grupos.join")}</p>
        <div className="mt-2.5 flex gap-2">
          <input value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }}
            placeholder={t("grupos.joinPh")} className={`mono ${input}`} />
          <button type="button" onClick={join} disabled={busy}
            className="rounded-full border-[1.5px] border-[var(--gold)] px-5 text-[15px] font-black text-[var(--gold)] disabled:opacity-50">
            {t("grupos.joinCta")}
          </button>
        </div>
      </div>

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
