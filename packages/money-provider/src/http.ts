// Adaptador HTTP real del proveedor de dinero (modos 'vinko_money' y 'partner_*').
// Implementa MoneyProvider contra la API REST de un orquestador/PAM licenciado
// (PaymentIQ, Nuvei, o la API del partner). El núcleo NUNCA ve saldos: pide
// operaciones y URLs de cajero; el dinero vive en el proveedor.
//
// ES UN CONTRATO GENÉRICO. Los PATHS y NOMBRES DE CAMPO de abajo son la forma
// canónica de Vinko; para un proveedor concreto se mapean con su documentación
// de sandbox (endpoint real + renombrar campos en req/resp). La arquitectura
// —peticiones firmadas, Idempotency-Key, timeout, manejo de errores— no cambia.
//
// Seguridad: cada llamada saliente va firmada (HMAC-SHA256 sobre el cuerpo crudo,
// misma firma que los webhooks) y con Authorization: Bearer <apiKey>. Las llamadas
// que mutan llevan Idempotency-Key determinista para que un reintento no duplique.
import { signBody } from "./signing";
import type {
  CreatePoolInput,
  DepositInput,
  Eligibility,
  EligibilityReason,
  EscrowHoldInput,
  EscrowSettleInput,
  KycStatus,
  MoneyProvider,
  PoolStatus,
  WalletBalance,
  WithdrawInput,
} from "./types";

export interface HttpProviderConfig {
  id: "vinko_money" | `partner_${string}`;
  baseUrl: string; // p. ej. https://api.paymentiq.example/v1  o la del partner
  apiKey: string; // Bearer (credencial del proveedor)
  signingSecret: string; // secreto HMAC de las peticiones salientes
  timeoutMs?: number; // default 8000
  fetchImpl?: typeof fetch; // inyectable para tests
}

const OK_KYC: readonly KycStatus[] = ["none", "pending", "verified", "rejected", "expired"];
const OK_POOL: readonly PoolStatus[] = ["open", "closed", "settled", "voided"];

export class HttpMoneyProvider implements MoneyProvider {
  readonly id: "vinko_money" | `partner_${string}`;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(cfg: HttpProviderConfig) {
    this.id = cfg.id;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.secret = cfg.signingSecret;
    this.timeoutMs = cfg.timeoutMs ?? 8000;
    this.doFetch = cfg.fetchImpl ?? fetch;
  }

  // ---- transporte firmado -------------------------------------------------
  private async call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const sig = await signBody(this.secret, rawBody);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "x-money-signature": sig,
      "x-money-provider": this.id,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : rawBody,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`money_provider_${res.status}:${detail.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  // ---- MoneyProvider ------------------------------------------------------
  async eligibility(userId: string, country: string): Promise<Eligibility> {
    const r = await this.call<{
      eligible?: boolean;
      reasons?: string[];
      kycStatus?: string;
      country?: string | null;
      limits?: { stakeMaxMinor: number; poolsPerDayMax: number; currency: string };
    }>("POST", "/eligibility", { userId, country });
    return {
      eligible: r.eligible === true,
      reasons: Array.isArray(r.reasons) ? (r.reasons as EligibilityReason[]) : [],
      kycStatus: (OK_KYC as readonly string[]).includes(r.kycStatus ?? "") ? (r.kycStatus as KycStatus) : "none",
      country: r.country ?? country,
      limits: r.limits,
    };
  }

  async startKyc(userId: string, country: string, returnUrl: string): Promise<{ url: string }> {
    const r = await this.call<{ url: string }>("POST", "/kyc/start", { userId, country, returnUrl });
    return { url: r.url };
  }

  async createPool(input: CreatePoolInput): Promise<{ externalPoolId: string }> {
    // Idempotente por porra: reintentar createPool de la misma porra no abre dos bolsas.
    const r = await this.call<{ externalPoolId: string }>("POST", "/pools", input, `pool:${input.porraId}`);
    return { externalPoolId: r.externalPoolId };
  }

  async join(input: { externalPoolId: string; userId: string; optionIdx: number; returnUrl: string }): Promise<{
    cashierUrl: string;
    participationRef: string;
  }> {
    const r = await this.call<{ cashierUrl: string; participationRef: string }>(
      "POST",
      `/pools/${encodeURIComponent(input.externalPoolId)}/join`,
      { userId: input.userId, optionIdx: input.optionIdx, returnUrl: input.returnUrl },
      `join:${input.externalPoolId}:${input.userId}`,
    );
    return { cashierUrl: r.cashierUrl, participationRef: r.participationRef };
  }

  async settle(input: { externalPoolId: string; winningOptionIdx: number | null; resultSourceRef: string }): Promise<{
    accepted: boolean;
  }> {
    const r = await this.call<{ accepted?: boolean }>(
      "POST",
      `/pools/${encodeURIComponent(input.externalPoolId)}/settle`,
      { winningOptionIdx: input.winningOptionIdx, resultSourceRef: input.resultSourceRef },
      `settle:${input.externalPoolId}`,
    );
    return { accepted: r.accepted === true };
  }

  async voidPool(input: { externalPoolId: string; reason: string }): Promise<{ accepted: boolean }> {
    const r = await this.call<{ accepted?: boolean }>(
      "POST",
      `/pools/${encodeURIComponent(input.externalPoolId)}/void`,
      { reason: input.reason },
      `void:${input.externalPoolId}`,
    );
    return { accepted: r.accepted === true };
  }

  async getPoolStatus(externalPoolId: string): Promise<{ status: PoolStatus; participants: number }> {
    const r = await this.call<{ status?: string; participants?: number }>(
      "GET",
      `/pools/${encodeURIComponent(externalPoolId)}`,
    );
    return {
      status: (OK_POOL as readonly string[]).includes(r.status ?? "") ? (r.status as PoolStatus) : "open",
      participants: typeof r.participants === "number" ? r.participants : 0,
    };
  }

  // -- wallet + escrow (el dinero vive en el proveedor; aquí solo referencias) --
  async ensureAccount(userId: string, country: string): Promise<{ externalAccountId: string; kycLevel: number }> {
    const r = await this.call<{ externalAccountId: string; kycLevel?: number }>(
      "POST", "/accounts", { userId, country }, `acct:${userId}`,
    );
    return { externalAccountId: r.externalAccountId, kycLevel: typeof r.kycLevel === "number" ? r.kycLevel : 0 };
  }

  async getBalance(externalAccountId: string): Promise<WalletBalance> {
    const r = await this.call<{ availableMinor?: number; lockedMinor?: number; currency?: string }>(
      "GET", `/accounts/${encodeURIComponent(externalAccountId)}/balance`,
    );
    return {
      availableMinor: typeof r.availableMinor === "number" ? r.availableMinor : 0,
      lockedMinor: typeof r.lockedMinor === "number" ? r.lockedMinor : 0,
      currency: r.currency ?? "EUR",
    };
  }

  async deposit(input: DepositInput): Promise<{ cashierUrl: string; ledgerRef: string }> {
    const r = await this.call<{ cashierUrl: string; ledgerRef: string }>(
      "POST", "/deposits",
      { externalAccountId: input.externalAccountId, amountMinor: input.amountMinor, method: input.method, returnUrl: input.returnUrl },
      input.idempotencyKey,
    );
    return { cashierUrl: r.cashierUrl, ledgerRef: r.ledgerRef };
  }

  async withdraw(input: WithdrawInput): Promise<{ ledgerRef: string }> {
    const r = await this.call<{ ledgerRef: string }>(
      "POST", "/withdrawals",
      { externalAccountId: input.externalAccountId, amountMinor: input.amountMinor, destinationRef: input.destinationRef },
      input.idempotencyKey,
    );
    return { ledgerRef: r.ledgerRef };
  }

  async escrowHold(input: EscrowHoldInput): Promise<{ ledgerRef: string }> {
    const r = await this.call<{ ledgerRef: string }>(
      "POST", `/pools/${encodeURIComponent(input.externalPoolId)}/hold`,
      { externalAccountId: input.externalAccountId, amountMinor: input.amountMinor },
      input.idempotencyKey,
    );
    return { ledgerRef: r.ledgerRef };
  }

  async escrowSettle(input: EscrowSettleInput): Promise<{ accepted: boolean }> {
    const r = await this.call<{ accepted?: boolean }>(
      "POST", `/pools/${encodeURIComponent(input.externalPoolId)}/escrow-settle`,
      { winners: input.winners, rakeMinor: input.rakeMinor },
      `escrow-settle:${input.externalPoolId}`,
    );
    return { accepted: r.accepted === true };
  }

  async escrowRefund(input: { externalPoolId: string }): Promise<{ accepted: boolean }> {
    const r = await this.call<{ accepted?: boolean }>(
      "POST", `/pools/${encodeURIComponent(input.externalPoolId)}/escrow-refund`, {},
      `escrow-refund:${input.externalPoolId}`,
    );
    return { accepted: r.accepted === true };
  }
}

// Sufijo de variables de entorno para un proveedor: 'partner_uk' → 'PARTNER_UK'.
export function providerEnvSuffix(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
