"use server";
import { getSession } from "@/lib/session";
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
  const session = await getSession();
  if (!session || session.is_anonymous) return null;
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.from("profiles").select("country, birth_year").eq("id", session.id).maybeSingle();
  const p = data as { country?: string | null; birth_year?: number | null } | null;
  if (!p?.birth_year || new Date().getFullYear() - p.birth_year < 18) return null; // +18 (regla de oro 8)
  return { sb, userId: session.id, country: p.country ?? "" };
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
