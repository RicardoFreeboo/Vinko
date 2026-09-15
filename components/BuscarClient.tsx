"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Buscar perfiles como en Instagram: escribe un @usuario y ves a la gente y su
// nº de porras; tocas y entras a su perfil (/u/[handle]) con sus porras.
type P = { handle: string; avatar: string | null; created: number };

export function BuscarClient() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);

  async function run(query: string) {
    const sb = supabaseBrowser();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const { data } = await sb.rpc("search_profiles", { q: query });
    setRes((data as P[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    const id = setTimeout(() => void run(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3">
        <span className="text-[var(--muted)]">🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder={t("buscar.placeholder")}
          className="w-full bg-transparent text-sm text-[var(--cream)] outline-none placeholder:text-[var(--muted2)]" />
      </div>

      {!q && <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("buscar.discover")}</p>}
      {!loading && res.length === 0 && <p className="text-sm text-[var(--muted)]">{t("buscar.empty")}</p>}

      <div className="flex flex-col gap-1.5">
        {res.map((p) => (
          <Link key={p.handle} href={`/u/${p.handle}`}
            className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5">
            {p.avatar
              ? <img src={p.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink3)] text-[13px] font-black text-[var(--win)]">{p.handle.slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-black text-[var(--cream)]">@{p.handle}</p>
              <p className="text-[11px] text-[var(--muted)]">{t("buscar.created", { n: String(p.created) })}</p>
            </div>
            <span className="text-[var(--muted2)]">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
