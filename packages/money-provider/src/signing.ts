// Firma de webhooks del proveedor de dinero (HMAC-SHA256 sobre `${t}.${rawBody}`).
// MISMO algoritmo que supabase/functions/money-webhook/verify.ts (copia en Deno):
// solo Web Crypto (`globalThis.crypto.subtle`) y TextEncoder, sin imports de Node,
// para que el archivo sea idéntico en Node 20+ y en Deno.
import type { MoneyWebhookType, WalletWebhookType } from "./types";

export const SIG_HEADER = "x-money-signature"; // "t=<unix s>,v1=<hex>"
export const EVENT_HEADER = "x-money-event-id";
export const PROVIDER_HEADER = "x-money-provider";
export const SIG_TOLERANCE_S = 300;

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// Solo para hex ya validado (longitud par, [0-9a-fA-F]).
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Comparación en tiempo constante sobre bytes: recorre siempre la longitud
// mayor y acumula diferencias con OR, sin salir antes de tiempo.
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** HMAC-SHA256 en hex minúsculas. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Cabecera de firma: `t=${t},v1=${hmacHex(secret, `${t}.${rawBody}`)}`. */
export async function signBody(secret: string, rawBody: string, t?: number): Promise<string> {
  const ts = t ?? Math.floor(Date.now() / 1000);
  return `t=${ts},v1=${await hmacHex(secret, `${ts}.${rawBody}`)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

/**
 * Verifica la cabecera `x-money-signature` contra el cuerpo crudo.
 *   missing   → cabecera ausente o vacía
 *   malformed → sin `t=` numérico o sin `v1=` hex
 *   stale     → |nowS − t| > toleranceS (repetición)
 *   mismatch  → la firma no coincide (comparación en tiempo constante)
 */
export async function verifySignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowS?: number,
  toleranceS?: number,
): Promise<VerifyResult> {
  if (header == null || header.trim() === "") return { ok: false, reason: "missing" };

  let tRaw: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t" && tRaw === null) tRaw = v;
    else if (k === "v1" && v1 === null) v1 = v;
  }
  if (tRaw === null || v1 === null || !/^\d{1,12}$/.test(tRaw)) return { ok: false, reason: "malformed" };
  if (v1.length === 0 || v1.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(v1)) return { ok: false, reason: "malformed" };

  const t = Number(tRaw);
  const now = nowS ?? Math.floor(Date.now() / 1000);
  const tol = toleranceS ?? SIG_TOLERANCE_S;
  if (Math.abs(now - t) > tol) return { ok: false, reason: "stale" };

  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  const ok = timingSafeEqualBytes(hexToBytes(v1.toLowerCase()), hexToBytes(expected));
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** `${type}:${parts.join(':')}` — determinista ⇒ idempotencia por event_id en BD.
 *  Acepta cualquier tipo de webhook (dinero de porras o wallet/escrow). */
export function eventId(type: MoneyWebhookType | WalletWebhookType, ...parts: string[]): string {
  return `${type}:${parts.join(":")}`;
}
