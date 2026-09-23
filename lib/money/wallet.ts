import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMoneyConfig } from "./config";
import { getMoneyProvider, type ProviderEnv } from "./provider";
import { toVkError, type VkResult } from "@/lib/errors";

// Cartera del usuario (fase 2). El saldo y los movimientos salen del ESPEJO que
// alimenta el proveedor por webhook (money_ledger_apply); la custodia y el saldo
// autoritativo viven en el proveedor. El núcleo nunca mueve dinero (regla oro 1).
export type Movement = {
  id: string; kind: string; amountMinor: number; currency: string;
  status: string; porraRef: string | null; createdAt: string;
};
export type WalletView = {
  hasAccount: boolean; provider: string | null; currency: string; kycLevel: number;
  availableMinor: number; lockedMinor: number; movements: Movement[];
};

export async function getWallet(sb: SupabaseClient | null): Promise<WalletView | null> {
  if (!sb) return null;
  const { data, error } = await sb.rpc("wallet_get");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  const mv = Array.isArray(d.movements) ? (d.movements as Record<string, unknown>[]) : [];
  return {
    hasAccount: d.has_account === true,
    provider: (d.provider as string) ?? null,
    currency: (d.currency as string) ?? "EUR",
    kycLevel: (d.kyc_level as number) ?? 0,
    availableMinor: (d.available_minor as number) ?? 0,
    lockedMinor: (d.locked_minor as number) ?? 0,
    movements: mv.map((m) => ({
      id: String(m.id), kind: String(m.kind), amountMinor: Number(m.amount_minor ?? 0),
      currency: String(m.currency ?? "EUR"), status: String(m.status), porraRef: (m.porra_ref as string) ?? null,
      createdAt: String(m.created_at),
    })),
  };
}

// Proveedor del país si el dinero está encendido en modo custodia (partner/own).
// Devuelve null si está apagado (hoy: siempre) o faltan credenciales.
async function providerForCountry(sb: SupabaseClient | null, country: string | null | undefined, ctx: ProviderEnv) {
  const cfg = await getMoneyConfig(sb);
  const c = cfg.countries[(country ?? "").toUpperCase()];
  if (cfg.global.kill_switch || !c || !c.enabled || (c.mode !== "partner" && c.mode !== "own")) return null;
  const provider = getMoneyProvider(c.provider ?? null, { env: cfg.env, siteUrl: ctx.siteUrl, supabaseUrl: ctx.supabaseUrl });
  return provider ? { provider, currency: c.currency ?? "EUR" } : null;
}

// Iniciar un depósito: la CUSTODIA la hace el proveedor. Devolvemos la URL del
// cajero; el saldo solo cambia cuando el webhook confirme (nunca por la vuelta).
export async function initiateDeposit(
  sb: SupabaseClient | null, ctx: ProviderEnv,
  input: { userId: string; country: string; amountMinor: number; method: string; returnUrl: string; idempotencyKey: string },
): Promise<VkResult<{ cashierUrl: string }>> {
  const pc = await providerForCountry(sb, input.country, ctx);
  if (!pc) return { ok: false, error: toVkError("VK_REGION_UNAVAILABLE") };
  const acct = await pc.provider.ensureAccount(input.userId, input.country);
  if (acct.kycLevel < 2) return { ok: false, error: toVkError("VK_KYC_REQUIRED") };
  const r = await pc.provider.deposit({
    externalAccountId: acct.externalAccountId, amountMinor: input.amountMinor,
    method: input.method, returnUrl: input.returnUrl, idempotencyKey: input.idempotencyKey,
  });
  return { ok: true, data: { cashierUrl: r.cashierUrl } };
}

// Iniciar una retirada: a una cuenta verificada en el proveedor (destinationRef).
// Queda 'pending' (revisión); el webhook la completa. Vinko no mueve fondos.
export async function initiateWithdraw(
  sb: SupabaseClient | null, ctx: ProviderEnv,
  input: { userId: string; country: string; amountMinor: number; destinationRef: string; idempotencyKey: string },
): Promise<VkResult<{ ledgerRef: string }>> {
  const pc = await providerForCountry(sb, input.country, ctx);
  if (!pc) return { ok: false, error: toVkError("VK_REGION_UNAVAILABLE") };
  const acct = await pc.provider.ensureAccount(input.userId, input.country);
  if (acct.kycLevel < 3) return { ok: false, error: toVkError("VK_KYC_REQUIRED") };
  const r = await pc.provider.withdraw({
    externalAccountId: acct.externalAccountId, amountMinor: input.amountMinor,
    destinationRef: input.destinationRef, idempotencyKey: input.idempotencyKey,
  });
  return { ok: true, data: { ledgerRef: r.ledgerRef } };
}
