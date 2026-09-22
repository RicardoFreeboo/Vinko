import "server-only";
import { MockMoneyProvider, type MoneyProvider, type MoneyWebhookEvent } from "@/packages/money-provider/src";
import { signBody } from "@/packages/money-provider/src/signing";

// Fábrica del proveedor de dinero (M0). El módulo está APAGADO: en producción
// solo hay proveedores licenciados reales (aún ninguno), y el simulado 'mock'
// existe únicamente fuera de producción para probar el flujo en staging.
export type ProviderEnv = { env: string; siteUrl: string; supabaseUrl: string };

// Firma un aviso simulado y lo envía al Edge Function money-webhook, igual que
// haría el proveedor real. El secreto es el mismo que verifica la función.
export async function postSignedWebhook(url: string, secret: string, evt: MoneyWebhookEvent): Promise<Response> {
  const rawBody = JSON.stringify(evt);
  const sig = await signBody(secret, rawBody);
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-money-signature": sig, "x-money-event-id": evt.event_id, "x-money-provider": evt.provider },
    body: rawBody,
  });
}

// Producción = lo dice la plataforma (VERCEL_ENV) O la config de negocio (misc.env).
// La más estricta gana: el mock solo vive si NINGUNA de las dos indica producción.
export function isMoneyProduction(cfgEnv: string): boolean {
  return cfgEnv === "production" || process.env.VERCEL_ENV === "production";
}

export function getMoneyProvider(providerId: string | null | undefined, ctx: ProviderEnv): MoneyProvider | null {
  if (providerId === "mock") {
    const secret = process.env.MONEY_WEBHOOK_SECRET_MOCK;
    if (isMoneyProduction(ctx.env) || !secret) return null; // el mock jamás en producción
    const webhookUrl = `${ctx.supabaseUrl.replace(/\/+$/, "")}/functions/v1/money-webhook/mock`;
    return new MockMoneyProvider({
      cashierBase: `${ctx.siteUrl.replace(/\/+$/, "")}/money/mock`,
      emit: (evt) => postSignedWebhook(webhookUrl, secret, evt).then(() => undefined),
    });
  }
  // partner_* / vinko_money: adaptador real, M1. Aún no existe.
  return null;
}
