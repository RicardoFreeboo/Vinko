// Proveedor de dinero simulado (solo fuera de producción; lo vigila lib/money/provider.ts
// y el trigger money_pools_guard). SIN estado propio: los servidores son efímeros,
// así que todos los ids son deterministas a partir de la entrada, y los webhooks
// que emite llevan event_id determinista (eventId) para que la BD deduplique.
import { eventId } from "./signing";
import type {
  Eligibility,
  KycStatus,
  MoneyProvider,
  MoneyWebhookEvent,
  MoneyWebhookPayload,
  MoneyWebhookType,
  PoolStatus,
  CreatePoolInput,
} from "./types";

export interface MockOptions {
  /** El app lo cablea a firmar + POST al Edge Function money-webhook. */
  emit: (evt: MoneyWebhookEvent) => Promise<void>;
  /** Base del cajero simulado. Default '/money/mock'. */
  cashierBase?: string;
  /** Estado KYC simulado por usuario. Default () => 'verified'. */
  kyc?: (userId: string) => KycStatus;
  /** Consulta externa del estado de una bolsa (el mock no lo guarda). */
  lookup?: (externalPoolId: string) => Promise<{ status: PoolStatus; participants: number; winners_n?: number }>;
}

const DEFAULT_CASHIER_BASE = "/money/mock";

/**
 * Evento de webhook del mock con event_id determinista: `eventId(type, ...ids)`
 * donde los ids salen del payload en orden fijo (external_pool_id, participation_ref,
 * user_id, country, kyc_status), omitiendo los ausentes. Repetir el mismo evento
 * lógico produce el mismo event_id ⇒ `money_apply_event` devuelve false (duplicado).
 */
export function mockEvent(type: MoneyWebhookType, payload: MoneyWebhookPayload): MoneyWebhookEvent {
  const parts = [payload.external_pool_id, payload.participation_ref, payload.user_id, payload.country, payload.kyc_status]
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  return { event_id: eventId(type, ...parts), type, provider: "mock", payload };
}

export class MockMoneyProvider implements MoneyProvider {
  readonly id = "mock";
  private readonly opts: MockOptions;
  private readonly cashierBase: string;

  constructor(opts: MockOptions) {
    this.opts = opts;
    this.cashierBase = (opts.cashierBase ?? DEFAULT_CASHIER_BASE).replace(/\/+$/, "");
  }

  async eligibility(userId: string, country: string): Promise<Eligibility> {
    const kycStatus = this.opts.kyc ? this.opts.kyc(userId) : "verified";
    const verified = kycStatus === "verified";
    return {
      eligible: verified,
      reasons: verified ? [] : [kycStatus === "pending" ? "kyc_pending" : "kyc_required"],
      kycStatus,
      country,
      limits: { stakeMaxMinor: 5000, poolsPerDayMax: 5, currency: country === "GB" ? "GBP" : "EUR" },
    };
  }

  async startKyc(userId: string, country: string, returnUrl: string): Promise<{ url: string }> {
    const q = `user=${encodeURIComponent(userId)}&country=${encodeURIComponent(country)}&return=${encodeURIComponent(returnUrl)}`;
    return { url: `${this.cashierBase}/kyc?${q}` };
  }

  async createPool(input: CreatePoolInput): Promise<{ externalPoolId: string }> {
    return { externalPoolId: `mock:${input.porraId}` };
  }

  async join(input: {
    externalPoolId: string;
    userId: string;
    optionIdx: number;
    returnUrl: string;
  }): Promise<{ cashierUrl: string; participationRef: string }> {
    const participationRef = `mockp:${input.externalPoolId}:${input.userId}`;
    const q =
      `pool=${encodeURIComponent(input.externalPoolId)}` +
      `&ref=${encodeURIComponent(participationRef)}` +
      `&opt=${encodeURIComponent(String(input.optionIdx))}` +
      `&return=${encodeURIComponent(input.returnUrl)}`;
    return { cashierUrl: `${this.cashierBase}/cashier?${q}`, participationRef };
  }

  async settle(input: {
    externalPoolId: string;
    winningOptionIdx: number | null;
    resultSourceRef: string;
  }): Promise<{ accepted: boolean }> {
    const { externalPoolId } = input;
    if (input.winningOptionIdx === null) {
      // Sin ganador (fuente oficial sin resultado válido) → la bolsa se anula y el proveedor devuelve.
      await this.opts.emit(mockEvent("pool.voided", { external_pool_id: externalPoolId, reason: "void" }));
      return { accepted: true };
    }
    // Sin estado propio: participantes y ganadores salen del lookup si existe; si no, 0.
    const st = this.opts.lookup ? await this.opts.lookup(externalPoolId) : null;
    await this.opts.emit(
      mockEvent("pool.settled", {
        external_pool_id: externalPoolId,
        participants: st?.participants ?? 0,
        winners_n: st?.winners_n ?? 0,
      }),
    );
    return { accepted: true };
  }

  async voidPool(input: { externalPoolId: string; reason: string }): Promise<{ accepted: boolean }> {
    await this.opts.emit(mockEvent("pool.voided", { external_pool_id: input.externalPoolId, reason: input.reason }));
    return { accepted: true };
  }

  async getPoolStatus(externalPoolId: string): Promise<{ status: PoolStatus; participants: number }> {
    if (!this.opts.lookup) return { status: "open", participants: 0 };
    const st = await this.opts.lookup(externalPoolId);
    return { status: st.status, participants: st.participants };
  }
}
