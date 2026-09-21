import { supabaseBrowser } from "@/lib/supabase/client";

// Capa social de una porra desde el navegador: los MISMOS RPC que PorraSocial
// (porra_social, toggle_like, add_comment) más make_pick. Solo lectura y
// llamadas a funciones: el cliente jamás escribe puntos ni tablas a mano.
export type SocialPick = { handle: string; avatar: string | null; option: string; idx: number };
export type SocialComment = { handle: string; avatar: string | null; body: string; ts: string; option: string | null };
export type Social = { likes: number; liked: boolean; picks: SocialPick[]; comments: SocialComment[] };

export const EMPTY_SOCIAL: Social = { likes: 0, liked: false, picks: [], comments: [] };

export async function loadSocial(porraId: string): Promise<Social | null> {
  const sb = supabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.rpc("porra_social", { p_porra: porraId });
  if (!data) return null;
  const d = data as Partial<Social>;
  return {
    likes: d.likes ?? 0, liked: !!d.liked,
    picks: Array.isArray(d.picks) ? d.picks : [],
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}

export async function toggleLike(porraId: string): Promise<{ liked: boolean; count: number } | null> {
  const sb = supabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.rpc("toggle_like", { p_porra: porraId });
  if (!data) return null;
  const r = data as { liked?: boolean; count?: number };
  return { liked: !!r.liked, count: r.count ?? 0 };
}

// Devuelve el mensaje de error del servidor (VINKO_UNSAFE…) o null si se publicó.
export async function addComment(porraId: string, body: string): Promise<string | null> {
  const sb = supabaseBrowser();
  if (!sb) return "no_backend";
  const { error } = await sb.rpc("add_comment", { p_porra: porraId, p_body: body });
  return error ? error.message : null;
}

// Devuelve el mensaje de error del servidor (VINKO_NO_POINTS…) o null si entró.
export async function makePick(porraId: string, optionId: string, stake: number): Promise<string | null> {
  const sb = supabaseBrowser();
  if (!sb) return "no_backend";
  const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: optionId, p_stake: stake });
  return error ? error.message : null;
}

// Clave i18n para un error de make_pick.
export function pickErrorKey(msg: string): string {
  if (msg.includes("NO_POINTS")) return "pick.noPoints";
  if (msg.includes("CLOSED")) return "feed.closedErr";
  return "pick.err";
}

// % de participantes por opción (idx), SIEMPRE enteros (regla del repo: nunca
// pintar un float). null si todavía no ha entrado nadie.
export function porcentajes(s: Social | undefined, options: { idx: number }[]): Record<number, number> | null {
  if (!s || s.picks.length === 0) return null;
  const n: Record<number, number> = {};
  for (const o of options) n[o.idx] = 0;
  for (const p of s.picks) n[p.idx] = (n[p.idx] ?? 0) + 1;
  const total = s.picks.length;
  const out: Record<number, number> = {};
  for (const o of options) out[o.idx] = Math.round(((n[o.idx] ?? 0) / total) * 100);
  return out;
}
