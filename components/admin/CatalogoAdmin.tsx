"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip, Eyebrow } from "@/components/backstage/ui";
import { t } from "@/lib/i18n";

// Catálogo del agente (tracked_entities). Toggle activo/pausada, palabras
// clave y handles editables, alta de entidades. NUNCA se borra: la RLS de
// 0032 no tiene política de delete y aquí no hay botón para ello.
export type Entidad = {
  id: string;
  nombre: string;
  categoria: string;
  palabras_clave: string[];
  handles: string[];
  pais: string;
  activo: boolean;
  last_swept_at: string | null;
  created_at?: string;
  updated_at?: string | null;
};

const CAT_ORDER = ["reality_tv", "reality_internet", "streamer", "futbol", "deporte", "musica", "cultura", "estacional"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const lista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function catLabel(cat: string): string {
  const k = `admin.catalogo.cat.${cat}`;
  const v = t(k);
  return v === k ? cat : v;
}

function hace(iso: string | null): string {
  if (!iso) return t("admin.catalogo.never");
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return t("admin.catalogo.never");
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

type Draft = { palabras: string; handles: string; pais: string };

export function CatalogoAdmin({ initial }: { initial: Entidad[] }) {
  const router = useRouter();
  const [list, setList] = useState<Entidad[]>(initial);
  useEffect(() => { setList(initial); }, [initial]);

  const [filtro, setFiltro] = useState("");
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", categoria: "", palabras: "", handles: "" });

  const activas = list.filter((e) => e.activo).length;

  const grupos = useMemo(() => {
    const f = norm(filtro.trim());
    const vis = list.filter((e) => !f || norm(`${e.nombre} ${e.categoria} ${(e.palabras_clave ?? []).join(" ")}`).includes(f));
    const m = new Map<string, Entidad[]>();
    for (const e of vis) m.set(e.categoria, [...(m.get(e.categoria) ?? []), e]);
    const cats = [...m.keys()].sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
    return cats.map((c) => ({ cat: c, items: (m.get(c) ?? []).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)) }));
  }, [list, filtro]);

  function fallo(e: { message?: string } | null) {
    const em = String(e?.message ?? "");
    setMsg({ kind: "err", text: /does not exist|schema cache/i.test(em) ? t("admin.catalogo.needBackend") : t("admin.catalogo.err") });
  }

  async function toggle(e: Entidad) {
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("admin.catalogo.needBackend") }); return; }
    setBusy(e.id); setMsg(null);
    const { data, error } = await sb.from("tracked_entities").update({ activo: !e.activo }).eq("id", e.id).select().single();
    setBusy(null);
    if (error || !data) { fallo(error); return; }
    setList((l) => l.map((x) => (x.id === e.id ? { ...x, ...(data as Entidad) } : x)));
    router.refresh();
  }

  function startEdit(e: Entidad) {
    setEditing((m) => ({ ...m, [e.id]: { palabras: (e.palabras_clave ?? []).join(", "), handles: (e.handles ?? []).join(", "), pais: e.pais ?? "ES" } }));
  }
  function cancelEdit(id: string) {
    setEditing((m) => { const c = { ...m }; delete c[id]; return c; });
  }

  async function save(e: Entidad) {
    const d = editing[e.id];
    if (!d) return;
    const palabras = lista(d.palabras);
    if (!palabras.length) { setMsg({ kind: "err", text: t("admin.catalogo.needKeywords") }); return; }
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("admin.catalogo.needBackend") }); return; }
    setBusy(e.id); setMsg(null);
    const { data, error } = await sb.from("tracked_entities")
      .update({ palabras_clave: palabras, handles: lista(d.handles), pais: (d.pais.trim().toUpperCase() || "ES").slice(0, 2) })
      .eq("id", e.id).select().single();
    setBusy(null);
    if (error || !data) { fallo(error); return; }
    setList((l) => l.map((x) => (x.id === e.id ? { ...x, ...(data as Entidad) } : x)));
    cancelEdit(e.id);
    setMsg({ kind: "ok", text: t("admin.catalogo.saved") });
    router.refresh();
  }

  async function crear() {
    const nombre = nuevo.nombre.trim();
    const categoria = nuevo.categoria.trim().toLowerCase();
    if (nombre.length < 2 || nombre.length > 80 || !/^[a-z][a-z0-9_]{2,29}$/.test(categoria)) {
      setMsg({ kind: "err", text: t("admin.catalogo.needName") }); return;
    }
    const palabras = lista(nuevo.palabras);
    if (!palabras.length) { setMsg({ kind: "err", text: t("admin.catalogo.needKeywords") }); return; }
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("admin.catalogo.needBackend") }); return; }
    setBusy("nueva"); setMsg(null);
    const { data, error } = await sb.from("tracked_entities")
      .insert({ nombre, categoria, palabras_clave: palabras, handles: lista(nuevo.handles), pais: "ES", activo: true })
      .select().single();
    setBusy(null);
    if (error || !data) { fallo(error); return; }
    setList((l) => [data as Entidad, ...l]);
    setNuevo({ nombre: "", categoria: "", palabras: "", handles: "" });
    setShowAdd(false);
    setMsg({ kind: "ok", text: t("admin.catalogo.saved") });
    router.refresh();
  }

  const input = "w-full rounded-[10px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
  const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";

  function Fila({ e }: { e: Entidad }) {
    const d = editing[e.id];
    const ocupado = busy === e.id;
    return (
      <div className={`rounded-[12px] border p-3 ${e.activo ? "border-[rgba(31,224,122,0.22)]" : "border-[rgba(244,241,233,0.08)] opacity-80"}`}
        style={{ background: "rgba(12,21,18,0.45)" }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[var(--cream)]">{e.nombre}</span>
              <Chip tone={e.activo ? "win" : "muted"}>{e.activo ? t("admin.catalogo.active") : t("admin.catalogo.inactive")}</Chip>
              <span className="mono text-[11px] text-[rgba(244,241,233,0.4)]">{e.pais}</span>
            </div>
            {!d && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(e.palabras_clave ?? []).map((k, i) => (
                  <span key={i} className="rounded-[6px] border border-[rgba(244,241,233,0.14)] px-1.5 py-0.5 text-[11px] text-[rgba(244,241,233,0.65)]">{k}</span>
                ))}
                {(e.handles ?? []).map((h, i) => (
                  <span key={`h${i}`} className="mono rounded-[6px] border border-[rgba(255,194,61,0.3)] px-1.5 py-0.5 text-[11px] text-[var(--gold)]">@{h.replace(/^@/, "")}</span>
                ))}
              </div>
            )}
            <div className="mt-1.5 text-[11px] text-[rgba(244,241,233,0.4)]">
              {t("admin.catalogo.lastSweep")}: {hace(e.last_swept_at)}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => toggle(e)} disabled={ocupado}
              className={`rounded-[10px] px-3 py-1.5 text-[12px] font-black disabled:opacity-50 ${e.activo
                ? "border border-[rgba(244,241,233,0.2)] text-[rgba(244,241,233,0.7)]"
                : "bg-[var(--win)] text-[#060b09]"}`}>
              {e.activo ? t("admin.catalogo.pause") : t("admin.catalogo.activate")}
            </button>
            {!d && (
              <button onClick={() => startEdit(e)} disabled={ocupado}
                className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50">
                {t("admin.catalogo.edit")}
              </button>
            )}
          </div>
        </div>

        {d && (
          <div className="mt-3 flex flex-col gap-2.5 border-t border-[rgba(244,241,233,0.08)] pt-3">
            <label className="flex flex-col gap-1">
              <span className={lbl}>{t("admin.catalogo.keywords")}</span>
              <input value={d.palabras} onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: { ...d, palabras: ev.target.value } }))} className={input} />
              <span className="text-[11px] leading-snug text-[rgba(244,241,233,0.4)]">{t("admin.catalogo.keywordsHint")}</span>
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_90px]">
              <label className="flex flex-col gap-1">
                <span className={lbl}>{t("admin.catalogo.handles")}</span>
                <input value={d.handles} onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: { ...d, handles: ev.target.value } }))} className={input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={lbl}>{t("admin.catalogo.country")}</span>
                <input value={d.pais} maxLength={2} onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: { ...d, pais: ev.target.value } }))} className={`${input} mono uppercase`} />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => save(e)} disabled={ocupado}
                className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50">
                {t("admin.catalogo.save")}
              </button>
              <button onClick={() => cancelEdit(e.id)} disabled={ocupado}
                className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)]">
                {t("admin.catalogo.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={t("admin.catalogo.search")}
          className="flex-1 rounded-[12px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
        <div className="flex items-center gap-3">
          <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">
            {t("admin.catalogo.count", { a: String(activas), n: String(list.length) })}
          </span>
          <button onClick={() => setShowAdd((v) => !v)}
            className="rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-sm font-black text-[#060b09]">
            {t("admin.catalogo.add")}
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      {showAdd && (
        <GlassCard glow="gold">
          <Eyebrow>{t("admin.catalogo.addTitle")}</Eyebrow>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={lbl}>{t("admin.catalogo.name")}</span>
              <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={lbl}>{t("admin.catalogo.category")}</span>
              <input value={nuevo.categoria} list="vinko-cats" placeholder={t("admin.catalogo.categoryPh")}
                onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })} className={`${input} mono`} />
              <datalist id="vinko-cats">
                {[...new Set([...CAT_ORDER, ...list.map((e) => e.categoria)])].map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={lbl}>{t("admin.catalogo.keywords")}</span>
              <input value={nuevo.palabras} onChange={(e) => setNuevo({ ...nuevo, palabras: e.target.value })} className={input} />
              <span className="text-[11px] leading-snug text-[rgba(244,241,233,0.4)]">{t("admin.catalogo.keywordsHint")}</span>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={lbl}>{t("admin.catalogo.handles")}</span>
              <input value={nuevo.handles} onChange={(e) => setNuevo({ ...nuevo, handles: e.target.value })} className={input} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={crear} disabled={busy === "nueva"}
              className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50">
              {t("admin.catalogo.create")}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)]">
              {t("admin.catalogo.cancel")}
            </button>
          </div>
        </GlassCard>
      )}

      {list.length === 0 ? (
        <GlassCard glow="none"><p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.catalogo.empty")}</p></GlassCard>
      ) : grupos.length === 0 ? (
        <GlassCard glow="none"><p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.catalogo.noMatch")}</p></GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {grupos.map((g) => (
            <GlassCard key={g.cat} glow="none">
              <div className="flex items-baseline justify-between">
                <Eyebrow>{catLabel(g.cat)}</Eyebrow>
                <span className="mono text-[11px] text-[rgba(244,241,233,0.45)]">
                  {g.items.filter((e) => e.activo).length}/{g.items.length}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {g.items.map((e) => <Fila key={e.id} e={e} />)}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[rgba(244,241,233,0.4)]">{t("admin.catalogo.neverDelete")}</p>
    </>
  );
}
