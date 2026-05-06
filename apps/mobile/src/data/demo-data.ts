import type {
  ChunkBucket,
  GameDefinition,
  ReferralSummary,
  RewardRule,
  WalletSummary,
  WalletTransaction,
} from "@reward-wallet/shared";

export const demoWallet: WalletSummary = {
  userId: "6206319",
  principalBalance: 800,
  rewardBalance: 260,
  listedBalance: 0,
  soldBalance: 0,
  withdrawableBalance: 800,
  lockedBalance: 90,
  updatedAt: new Date().toISOString(),
};

export const demoReferral: ReferralSummary = {
  code: "RWD2026",
  totalReferredUsers: 18,
  rewardedReferrals: 11,
  totalRewardAmount: 940,
  totalCommissionTokens: 940,
  pendingCommissionTokens: 120,
  commissionNote: "Commission is credited only after the referred user completes the required task or milestone.",
  referrals: [
    {
      userId: "6203001",
      name: "Aarav",
      joinedAt: new Date().toISOString(),
      status: "credited",
      rewardTokens: 50,
    },
    {
      userId: "6203002",
      name: "Priya",
      joinedAt: new Date().toISOString(),
      status: "joined",
      rewardTokens: 0,
    },
  ],
  commissions: [],
};

export const demoRewardRules: RewardRule[] = [
  {
    id: "rule_1",
    minDepositAmount: 100,
    maxDepositAmount: 499,
    rewardPercent: 3,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "rule_2",
    minDepositAmount: 500,
    maxDepositAmount: 999,
    rewardPercent: 5,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "rule_3",
    minDepositAmount: 1000,
    maxDepositAmount: 100000,
    rewardPercent: 7,
    active: true,
    createdAt: new Date().toISOString(),
  },
];

export const demoChunkBuckets: ChunkBucket[] = [
  { id: "bucket_small", label: "100-200", minAmount: 100, maxAmount: 200, targetAmount: 200, active: true },
  { id: "bucket_mid", label: "200-500", minAmount: 200, maxAmount: 500, targetAmount: 300, active: true },
  { id: "bucket_large", label: "500-1000", minAmount: 500, maxAmount: 1000, targetAmount: 500, active: true },
];

export const demoGames: GameDefinition[] = [
  { id: "spin", name: "Spin Arena", entryFee: 10, minReward: 0, maxReward: 40 },
  { id: "scratch", name: "Scratch Rush", entryFee: 20, minReward: 0, maxReward: 75 },
  { id: "prediction", name: "Number Pick", entryFee: 30, minReward: 0, maxReward: 120 },
];

export const demoTransactions: WalletTransaction[] = [
  {
    id: "txn_1",
    userId: "6206319",
    type: "task_pass_purchase",
    amount: 220,
    metadata: { note: "Starter Pass payment", plan: "Starter Pass" },
    createdAt: "2026-05-04T09:35:00.000Z",
  },
  {
    id: "txn_2",
    userId: "6206319",
    type: "reward_credit",
    amount: 70,
    metadata: { note: "Deposit bonus", slab: "7%" },
    createdAt: "2026-05-04T08:45:00.000Z",
  },
  {
    id: "txn_3",
    userId: "6206319",
    type: "deposit_principal",
    amount: 500,
    metadata: { note: "Demo balance top-up", provider: "SandboxPay" },
    createdAt: "2026-05-04T08:40:00.000Z",
  },
  {
    id: "txn_4",
    userId: "6206319",
    type: "deposit_principal",
    amount: 1000,
    metadata: { note: "Verified deposit", provider: "SandboxPay" },
    createdAt: "2026-05-04T08:38:00.000Z",
  },
];

export const marketPulse = {
  demandFillPercent: 78,
  activeChunks: 12,
  pendingReview: 3,
  payoutTurnaround: "4-12 min",
};
