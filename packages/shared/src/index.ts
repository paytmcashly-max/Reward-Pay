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
  | "task_pass_purchase"
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

export type WalletBalanceKey =
  | "principalBalance"
  | "rewardBalance"
  | "listedBalance"
  | "soldBalance"
  | "withdrawableBalance"
  | "lockedBalance";

export interface WalletBalanceExplainer {
  key: WalletBalanceKey;
  label: string;
  short: string;
  detail: string;
}

export const walletBalanceExplainers: WalletBalanceExplainer[] = [
  {
    key: "principalBalance",
    label: "Principal balance",
    short: "Money you added that is still available in your wallet.",
    detail: "Principal balance is your own cash wallet money before any payout request.",
  },
  {
    key: "rewardBalance",
    label: "Reward balance",
    short: "Legacy cash reward value kept for compatibility.",
    detail: "New Task Pass rewards are tracked in the token wallet ledger, separate from cash.",
  },
  {
    key: "listedBalance",
    label: "Legacy listed balance",
    short: "Legacy marketplace field kept only for compatibility.",
    detail: "Listed balance is no longer part of the active product flow and should remain zero in the Task Pass model.",
  },
  {
    key: "soldBalance",
    label: "Legacy compatibility balance",
    short: "Legacy marketplace field kept only for compatibility.",
    detail: "This compatibility value is no longer part of the active Task Pass product flow.",
  },
  {
    key: "withdrawableBalance",
    label: "Withdrawable balance",
    short: "Cash wallet amount currently available for payout.",
    detail: "Withdrawable balance is the cash amount available for payout after any pending cash withdrawal locks are applied.",
  },
  {
    key: "lockedBalance",
    label: "Locked balance",
    short: "Money temporarily held for a withdrawal request under review.",
    detail: "Locked balance is reserved while a withdrawal request is pending review or provider processing.",
  },
];

export type MoneyTimelineStepType =
  | "deposit_paid"
  | "reward_credited"
  | "amount_listed"
  | "amount_matched"
  | "withdrawal_requested"
  | "withdrawal_paid"
  | "withdrawal_reversed";

export type MoneyTimelineStepState = "completed" | "active" | "failed" | "pending";

export interface MoneyTimelineStep {
  id: string;
  type: MoneyTimelineStepType;
  title: string;
  description: string;
  state: MoneyTimelineStepState;
  amount: number;
  createdAt: string;
  depositId?: string;
  withdrawalId?: string;
}

export interface WithdrawalEligibilityReason {
  code:
    | "blocked_user"
    | "insufficient_balance"
    | "minimum_amount_not_met"
    | "pending_withdrawal_limit";
  message: string;
}

export interface WithdrawalEligibility {
  eligible: boolean;
  requestedAmount?: number;
  availableAmount: number;
  minimumAmount?: number | null;
  pendingCount: number;
  maxPendingWithdrawals: number;
  reasons: WithdrawalEligibilityReason[];
}

export interface WalletOverview {
  walletSummary: WalletSummary;
  explainers: WalletBalanceExplainer[];
  timeline: MoneyTimelineStep[];
  withdrawalEligibility: WithdrawalEligibility;
}

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
  taskPassPlanId?: string;
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

export type RiskLevel = "low" | "medium" | "high";

export interface RiskIndicator {
  level: RiskLevel;
  reasons: string[];
}

export interface AdminRiskReport {
  users: Record<string, RiskIndicator>;
  deposits: Record<string, RiskIndicator>;
  withdrawals: Record<string, RiskIndicator>;
}

export interface ReconciliationEntry {
  id: string;
  kind: "provider_paid_app_pending" | "listed_without_provider_success";
  depositId: string;
  userId: string;
  amount: number;
  status: DepositStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationReport {
  entries: ReconciliationEntry[];
}

export interface DepositProviderEvent {
  id: string;
  depositOrderId: string;
  provider: PaymentProvider;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type TaskPassStatus = "pending" | "active" | "expired" | "cancelled";

export type DailyTaskType = "checkin" | "manual" | "quiz" | "proof_upload" | "link_visit" | "ad_watch";

export type DailyTaskAssignmentStatus =
  | "assigned"
  | "started"
  | "checking"
  | "submitted"
  | "approved"
  | "rejected"
  | "claimed";

export type TokenTransactionReason =
  | "daily_checkin"
  | "daily_task"
  | "milestone_reward"
  | "referral_commission"
  | "deposit_bonus"
  | "admin_adjustment"
  | "redemption";
export type ReferralCommissionTrigger =
  | "referred_task_completed"
  | "referred_milestone_completed"
  | "referred_deposit_approved";

export type ReferralCommissionRewardType = "fixed_tokens" | "percent_tokens" | "percent_deposit_bonus";

export type DepositBonusStatus = "locked" | "unlocked" | "credited" | "rejected";

export type RedemptionStatus = "pending" | "approved" | "rejected" | "paid";

export type RedemptionPayoutMethod = "manual" | "voucher" | "bank" | "upi";

export interface TaskPassPlan {
  id: string;
  name: string;
  durationDays: number;
  dailyTaskMin: number;
  dailyTaskMax: number;
  dailyTokenCap: number;
  targetTokens: number;
  priceAmount: number;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserTaskPass {
  id: string;
  userId: string;
  planId: string;
  status: TaskPassStatus;
  startsAt?: string;
  endsAt?: string;
  activatedByAdminId?: string;
  paymentReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  type: DailyTaskType;
  rewardTokens: number;
  requiresApproval: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDailyTaskAssignment {
  id: string;
  userId: string;
  taskPassId: string;
  taskId: string;
  date: string;
  status: DailyTaskAssignmentStatus;
  rewardTokens: number;
  proof?: string;
  rejectedReason?: string;
  createdAt: string;
  startedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  claimedAt?: string;
}

export interface DailyCheckIn {
  id: string;
  userId: string;
  taskPassId: string;
  date: string;
  rewardTokens: number;
  claimedAt: string;
}

export interface TokenTransaction {
  id: string;
  userId: string;
  amount: number;
  direction: "credit" | "debit";
  reason: TokenTransactionReason;
  referenceId: string;
  balanceAfter: number;
  createdAt: string;
}

export interface TokenBalanceSummary {
  balance: number;
  todayEarned: number;
  todayCap: number;
  redeemableTokens: number;
  lockedBonusTokens: number;
  minimumRedemption: number;
  conversionRate: number;
}

export interface DailyOverview {
  date: string;
  activeTaskPass: UserTaskPass | null;
  activePlan: TaskPassPlan | null;
  dayNumber: number | null;
  totalDays: number | null;
  assignedCount: number;
  completedCount: number;
  checkInClaimed: boolean;
  tokenBalance: TokenBalanceSummary;
  nextMilestone?: UserMilestoneView | null;
}

export interface AdminDailyAssignment {
  assignment: UserDailyTaskAssignment;
  task: DailyTask | null;
  user: User | null;
  taskPass: UserTaskPass | null;
  plan: TaskPassPlan | null;
}

export interface RewardMilestone {
  id: string;
  planId: string;
  name: string;
  requiredDay: number;
  requiredCompletedTasks: number;
  rewardTokens: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserMilestoneProgress {
  id: string;
  userId: string;
  taskPassId: string;
  milestoneId: string;
  status: "pending" | "completed" | "claimed";
  completedAt?: string;
  claimedAt?: string;
}

export interface UserMilestoneView {
  milestone: RewardMilestone;
  progress: UserMilestoneProgress;
  currentDay: number | null;
  completedTasks: number;
}

export interface ReferralCommissionRule {
  id: string;
  trigger: ReferralCommissionTrigger;
  rewardType: ReferralCommissionRewardType;
  rewardValue: number;
  maxRewardTokens?: number;
  requiredTaskId?: string;
  requiredMilestoneId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralCommission {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  ruleId: string;
  triggerType: ReferralCommissionTrigger;
  triggerReferenceId: string;
  rewardTokens: number;
  status: "pending" | "credited" | "rejected";
  creditedAt?: string;
  createdAt: string;
}

export interface DepositBonusRule {
  id: string;
  minDepositAmount: number;
  bonusPercent: number;
  maxBonusTokens: number;
  unlockRequiredApprovedTasks: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepositBonus {
  id: string;
  userId: string;
  depositId: string;
  ruleId: string;
  depositAmount: number;
  bonusTokens: number;
  unlockRequiredApprovedTasks: number;
  status: DepositBonusStatus;
  unlockedAt?: string;
  creditedAt?: string;
  createdAt: string;
}

export interface RedemptionRequest {
  id: string;
  userId: string;
  tokens: number;
  valueAmount: number;
  status: RedemptionStatus;
  payoutMethod: RedemptionPayoutMethod;
  createdAt: string;
  reviewedAt?: string;
  paidAt?: string;
  note?: string;
}

export interface ReferralStatusItem {
  userId: string;
  name: string;
  joinedAt: string;
  status: "joined" | "qualified" | "credited";
  rewardTokens: number;
}

export interface ReferralSummary {
  code: string;
  totalReferredUsers: number;
  rewardedReferrals: number;
  totalRewardAmount: number;
  totalCommissionTokens: number;
  pendingCommissionTokens: number;
  commissionNote: string;
  referrals: ReferralStatusItem[];
  commissions: ReferralCommission[];
}
