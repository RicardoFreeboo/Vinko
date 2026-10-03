"use server";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/share";
import { initiateDeposit, initiateWithdraw } from "@/lib/money/wallet";
import type { VkError } from "@/lib/errors";

// Acciones de dinero de la Cartera. La CUSTODIA la hace el proveedor; aquí solo
// se pide la operación. Sin UI optimista: el saldo cambia cuando el proveedor
// confirma por webhook. Devuelve un resultado simple (la copia vive en cartera.*
// del núcleo, no en el dict de dinero, que está apagado en producción).
export type WalletActionResult = { ok: true; cashierUrl?: string } | { ok: false; code: "off" | "kyc" | "error" };

function simplify(vk: VkError): "off" | "kyc" | "error" {
  if (vk.code === "VK_REGION_UNAVAILABLE") return "off";
  if (vk.code === "VK_KYC_REQUIRED") return "kyc";
  return "error";
}

const ctx = () => ({ env: "", siteUrl: SITE, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" });

async function meAndCountry() {
  const session = await getMemberSession();
  if (!session || session.is_anonymous) return null;
  // SEC-01 (0055): birth_year/country/safer_play son privados. El +18 llega con
  // la sesión (me()) y la autoexclusión la calcula safer_play_get en el servidor.
  if (!session.birth_year || new Date().getFullYear() - session.birth_year < 18) return null; // +18 (regla de oro 8)
  const sb = await supabaseServer();
  if (!sb) return null;
  // Autoexclusión (§5.11) bloquea el dinero. Ante cualquier error, cerrado.
  const { data: sp, error } = await sb.rpc("safer_play_get");
  if (error || !sp || (sp as { is_excluded?: boolean }).is_excluded !== false) return null;
  return { sb, userId: session.id, country: session.country ?? "" };
}

export async function depositAction(amountMinor: number, method: string, idempotencyKey: string): Promise<WalletActionResult> {
  const me = await meAndCountry();
  if (!me) return { ok: false, code: "off" };
  if (!Number.isInteger(amountMinor) || amountMinor < 100 || amountMinor > 100000) return { ok: false, code: "error" };
  const r = await initiateDeposit(me.sb, ctx(), {
    userId: me.userId, country: me.country, amountMinor, method, returnUrl: `${SITE}/cartera`, idempotencyKey,
  });
  return r.ok ? { ok: true, cashierUrl: r.data.cashierUrl } : { ok: false, code: simplify(r.error) };
}

export async function withdrawAction(amountMinor: number, idempotencyKey: string): Promise<WalletActionResult> {
  const me = await meAndCountry();
  if (!me) return { ok: false, code: "off" };
  if (!Number.isInteger(amountMinor) || amountMinor < 100 || amountMinor > 100000) return { ok: false, code: "error" };
  const r = await initiateWithdraw(me.sb, ctx(), {
    userId: me.userId, country: me.country, amountMinor, destinationRef: "primary", idempotencyKey,
  });
  return r.ok ? { ok: true } : { ok: false, code: simplify(r.error) };
}
