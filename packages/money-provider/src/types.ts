// Tipos del proveedor de dinero (M0, docs/money/CONTRATOS_M0.md §B1).
// Principio: el núcleo de Vinko guarda REFERENCIAS (ids externos, estados,
// configuración de la bolsa). Ningún tipo de aquí transporta saldos de usuario.

export type MoneyMode = "points_only" | "affiliate_only" | "partner" | "own";

export type KycStatus = "none" | "pending" | "verified" | "rejected" | "expired";

export type EligibilityReason =
  | "anonymous"
  | "kill_switch"
  | "country_disabled"
  | "country_undeclared"
  | "geo_unknown"
  | "geo_mismatch"
  | "underage"
  | "kyc_required"
  | "kyc_pending"
  | "self_excluded"
  | "limit_reached"
  | "cooling_off"
  | "provider_unavailable";

export interface Eligibility {
  eligible: boolean;
  reasons: EligibilityReason[];
  kycStatus: KycStatus;
  country: string | null;
  limits?: { stakeMaxMinor: number; poolsPerDayMax: number; currency: string };
}

export interface CreatePoolInput {
  porraId: string;
  country: string;
  currency: string;
  stakeMinor: number;
  rakeBps: number;
  closesAt: string;
  optionsCount: number;
  maxParticipants?: number;
  resolutionSourceRef: string;
  createdByUserId: string;
}

export type PoolStatus = "open" | "closed" | "settled" | "voided";

export type MoneyWebhookType =
  | "participation.confirmed"
  | "participation.failed"
  | "participation.refunded"
  | "participation.paid"
  | "pool.closed"
  | "pool.settled"
  | "pool.voided"
  | "kyc.updated"
  | "account.suspended";

// Lista cerrada: la Edge Function money-webhook rechaza (400) cualquier otro tipo.
export const MONEY_WEBHOOK_TYPES: readonly MoneyWebhookType[] = [
  "participation.confirmed",
  "participation.failed",
  "participation.refunded",
  "participation.paid",
  "pool.closed",
  "pool.settled",
  "pool.voided",
  "kyc.updated",
  "account.suspended",
];

export interface MoneyWebhookPayload {
  external_pool_id?: string;
  participation_ref?: string;
  reason?: string;
  participants?: number;
  winners_n?: number;
  user_id?: string;
  country?: string;
  kyc_status?: KycStatus;
  // Wallet/escrow (referencias que reporta el proveedor; el núcleo las refleja).
  external_account_id?: string;
  ledger_ref?: string;
  kind?: LedgerKind;
  amount_minor?: number;
  currency?: string;
  method?: string;
  kyc_level?: number;
  iban_masked?: string;
}

export interface MoneyWebhookEvent {
  event_id: string;
  type: MoneyWebhookType;
  provider: string;
  payload: MoneyWebhookPayload;
}

// ---------------------------------------------------------------------------
// Wallet + escrow (VINKO_BILLING/diseño frontend §5, §7). La CUSTODIA vive en el
// proveedor licenciado: estos tipos transportan REFERENCIAS y estados, y el saldo
// que el proveedor CONFIRMA. El núcleo nunca es el dueño del dinero ni lo mueve.
// ---------------------------------------------------------------------------

// Saldo tal como lo reporta el proveedor. El núcleo lo muestra, no lo calcula
// como fuente de verdad (regla de oro 1).
export interface WalletBalance {
  availableMinor: number; // disponible para entrar o retirar
  lockedMinor: number;    // bloqueado en porras abiertas (escrow)
  currency: string;
}

// Tipo de apunte del ledger (el ledger de doble entrada autoritativo lo lleva el
// proveedor; el núcleo refleja estos apuntes para mostrar movimientos).
export type LedgerKind = "deposit" | "withdraw" | "stake_hold" | "stake_release" | "payout" | "refund" | "rake";
export type LedgerStatus = "pending" | "completed" | "failed" | "reversed" | "in_review";

export interface DepositInput {
  externalAccountId: string;
  amountMinor: number;
  method: string; // 'bizum' | 'debit_card' | 'open_banking' | …
  returnUrl: string;
  idempotencyKey: string;
}
export interface WithdrawInput {
  externalAccountId: string;
  amountMinor: number;
  destinationRef: string; // id de un IBAN verificado en el proveedor (referencia, nunca el IBAN en claro)
  idempotencyKey: string;
}
export interface EscrowHoldInput {
  externalPoolId: string;
  externalAccountId: string;
  amountMinor: number;
  idempotencyKey: string;
}
export interface EscrowSettleInput {
  externalPoolId: string;
  winners: { externalAccountId: string; amountMinor: number }[];
  rakeMinor: number; // comisión de Vinko; la retiene y contabiliza el proveedor
}

// Webhooks de wallet/escrow. SEPARADOS de MONEY_WEBHOOK_TYPES a propósito: hasta
// que el manejo esté cableado (money_ledger_apply, fase 2), la Edge Function no
// los acepta. El núcleo NUNCA da un depósito por bueno por la redirección: espera
// a este webhook verificado.
export type WalletWebhookType =
  | "account.created"
  | "wallet.deposit.pending"
  | "wallet.deposit.completed"
  | "wallet.deposit.failed"
  | "wallet.withdraw.pending"
  | "wallet.withdraw.sent"
  | "wallet.withdraw.completed"
  | "wallet.withdraw.failed"
  | "escrow.held"
  | "escrow.released"
  | "escrow.refunded"
  | "escrow.payout";

export const WALLET_WEBHOOK_TYPES: readonly WalletWebhookType[] = [
  "account.created",
  "wallet.deposit.pending",
  "wallet.deposit.completed",
  "wallet.deposit.failed",
  "wallet.withdraw.pending",
  "wallet.withdraw.sent",
  "wallet.withdraw.completed",
  "wallet.withdraw.failed",
  "escrow.held",
  "escrow.released",
  "escrow.refunded",
  "escrow.payout",
];

export interface WalletWebhookEvent {
  event_id: string;
  type: WalletWebhookType;
  provider: string;
  payload: MoneyWebhookPayload;
}

// Cualquier webhook que emite el proveedor (dinero de porras + wallet/escrow).
export type ProviderWebhookEvent = MoneyWebhookEvent | WalletWebhookEvent;

export interface MoneyProvider {
  readonly id: "mock" | `partner_${string}` | "vinko_money";
  eligibility(userId: string, country: string): Promise<Eligibility>;
  startKyc(userId: string, country: string, returnUrl: string): Promise<{ url: string }>;
  createPool(input: CreatePoolInput): Promise<{ externalPoolId: string }>;
  join(input: {
    externalPoolId: string;
    userId: string;
    optionIdx: number;
    returnUrl: string;
  }): Promise<{ cashierUrl: string; participationRef: string }>;
  settle(input: {
    externalPoolId: string;
    winningOptionIdx: number | null;
    resultSourceRef: string;
  }): Promise<{ accepted: boolean }>;
  voidPool(input: { externalPoolId: string; reason: string }): Promise<{ accepted: boolean }>;
  getPoolStatus(externalPoolId: string): Promise<{ status: PoolStatus; participants: number }>;

  // -- wallet + escrow (custodia en el proveedor; el núcleo solo referencias) --
  ensureAccount(userId: string, country: string): Promise<{ externalAccountId: string; kycLevel: number }>;
  getBalance(externalAccountId: string): Promise<WalletBalance>;
  deposit(input: DepositInput): Promise<{ cashierUrl: string; ledgerRef: string }>;
  withdraw(input: WithdrawInput): Promise<{ ledgerRef: string }>;
  escrowHold(input: EscrowHoldInput): Promise<{ ledgerRef: string }>;
  escrowSettle(input: EscrowSettleInput): Promise<{ accepted: boolean }>;
  escrowRefund(input: { externalPoolId: string }): Promise<{ accepted: boolean }>;
}
