"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type Group = { id: string; name: string; invite_code: string; members: number };

export function GruposClient({ groups }: { groups: Group[] }) {
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

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupos.mine")}</p>
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("grupos.none")}</p>
        ) : (
          groups.map((g) => (
            <Link key={g.id} href={`/g/${g.id}`}
              className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
              <div>
                <div className="font-black text-[var(--cream)]">{g.name}</div>
                <div className="text-[11px] text-[var(--muted)]">{t("grupos.members", { n: String(g.members) })}</div>
              </div>
              <span className="text-[var(--win)]">{t("grupos.open")}</span>
            </Link>
          ))
        )}
      </section>

      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <p className="text-sm font-bold text-[var(--cream)]">{t("grupos.create")}</p>
        <div className="mt-2 flex gap-2">
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }}
            placeholder={t("grupos.createPh")}
            className="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={create} disabled={busy}
            className="rounded-[10px] bg-[var(--win)] px-4 text-sm font-black text-[var(--ink)] disabled:opacity-50">
            {t("grupos.createCta")}
          </button>
        </div>
      </section>

      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <p className="text-sm font-bold text-[var(--cream)]">{t("grupos.join")}</p>
        <div className="mt-2 flex gap-2">
          <input value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }}
            placeholder={t("grupos.joinPh")}
            className="mono flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={join} disabled={busy}
            className="rounded-[10px] border border-[var(--gold)] px-4 text-sm font-black text-[var(--gold)] disabled:opacity-50">
            {t("grupos.joinCta")}
          </button>
        </div>
      </section>

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </>
  );
}
