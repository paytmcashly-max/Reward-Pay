export type Role = "superadmin" | "operator" | "user";

export type DepositStatus =
  | "created"
  | "payment_pending"
  | "paid"
  | "verified"
  | "reward_credited"
  | "chunked"
  | "listed"
  | "failed"
  | "cancelled";

export type WithdrawalStatus =
  | "requested"
  | "queued_for_review"
  | "approved"
  | "provider_processing"
  | "paid"
  | "rejected"
  | "reversed";

export type WalletTransactionType =
  | "deposit_principal"
  | "reward_credit"
  | "chunk_listed"
  | "chunk_match"
  | "withdraw_request"
  | "withdraw_reversal"
  | "game_entry"
  | "game_payout";

export type GameId = "spin" | "scratch" | "prediction";

export type BeneficiaryType = "upi" | "bank";

export type PaymentProvider = "cashfree" | "mock";

export interface User {
  id: string;
  phone: string;
  name: string;
  referralCode: string;
  referredByUserId?: string;
  role: Role;
  blocked: boolean;
  createdAt: string;
}

export interface WalletAccount {
  userId: string;
  principalBalance: number;
  rewardBalance: number;
  listedBalance: number;
  soldBalance: number;
  withdrawableBalance: number;
  lockedBalance: number;
  updatedAt: string;
}

export interface WalletSummary extends WalletAccount {}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RewardRule {
  id: string;
  minDepositAmount: number;
  maxDepositAmount: number;
  rewardPercent: number;
  active: boolean;
  createdAt: string;
}

export interface ChunkBucket {
  id: string;
  label: string;
  minAmount: number;
  maxAmount: number;
  targetAmount: number;
  active: boolean;
}

export interface DepositOrder {
  id: string;
  userId: string;
  amount: number;
  provider: string;
  status: DepositStatus;
  checkoutUrl: string;
  providerOrderId?: string;
  checkoutSession?: DepositCheckoutSession;
  createdAt: string;
  updatedAt: string;
}

export interface SellOrder {
  id: string;
  userId: string;
  depositOrderId: string;
  totalAmount: number;
  soldAmount: number;
  status: "open" | "partially_sold" | "sold";
  createdAt: string;
}

export interface SellOrderChunk {
  id: string;
  sellOrderId: string;
  userId: string;
  bucketId: string;
  amount: number;
  remainingAmount: number;
  listedAt: string;
}

export interface DemandPool {
  id: string;
  bucketId: string;
  label: string;
  requestedAmount: number;
  remainingAmount: number;
  priority: number;
  createdAt: string;
  active: boolean;
}

export interface TradeMatch {
  id: string;
  sellOrderChunkId: string;
  demandPoolId: string;
  userId: string;
  amount: number;
  createdAt: string;
}

export interface WithdrawBeneficiary {
  id: string;
  userId: string;
  type: BeneficiaryType;
  label: string;
  accountName: string;
  upiId?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  createdAt: string;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  beneficiaryId: string;
  amount: number;
  status: WithdrawalStatus;
  providerReference?: string;
  providerStatus?: PayoutTransferStatus["status"];
  createdAt: string;
  updatedAt: string;
}

export interface ReferralSummary {
  code: string;
  totalReferredUsers: number;
  rewardedReferrals: number;
  totalRewardAmount: number;
}

export interface GameDefinition {
  id: GameId;
  name: string;
  entryFee: number;
  minReward: number;
  maxReward: number;
}

export interface AdminAuditLog {
  id: string;
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DepositCheckoutSession {
  provider: PaymentProvider;
  providerOrderId: string;
  paymentSessionId?: string;
  checkoutUrl: string;
  expiresAt?: string;
}

export interface PayoutTransferStatus {
  provider: PaymentProvider;
  providerReference: string;
  status: "RECEIVED" | "PROCESSING" | "SUCCESS" | "FAILED";
  description: string;
}

export interface AuthSession {
  accessToken: string;
  user: User;
  walletSummary: WalletSummary;
}

export interface AdminSession {
  accessToken: string;
  user: User;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DepositProviderEvent {
  id: string;
  depositOrderId: string;
  provider: PaymentProvider;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
