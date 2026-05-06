import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdminAuditLog,
  DepositBonus,
  DepositBonusRule,
  BeneficiaryType,
  ChunkBucket,
  DailyCheckIn,
  DailyTask,
  DemandPool,
  DepositOrder,
  DepositProviderEvent,
  DepositStatus,
  GameDefinition,
  PaymentProvider,
  RedemptionRequest,
  ReferralCommission,
  ReferralCommissionRule,
  ReferralSummary,
  RewardMilestone,
  RewardRule,
  SellOrder,
  SellOrderChunk,
  TaskPassPlan,
  TokenTransaction,
  TradeMatch,
  User,
  UserDailyTaskAssignment,
  UserMilestoneProgress,
  UserTaskPass,
  WalletAccount,
  WalletTransaction,
  WalletTransactionType,
  WithdrawalStatus,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import type { Pool } from "pg";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const USER_ID_PATTERN = /^\d{7}$/;

const createSevenDigitUserId = (reservedIds: Set<string>) => {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const candidate = String(Math.floor(1_000_000 + Math.random() * 9_000_000));
    if (!reservedIds.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate a unique 7-digit user ID");
};

const gameDefinitions: GameDefinition[] = [
  { id: "spin", name: "Spin", entryFee: 10, minReward: 0, maxReward: 40 },
  { id: "scratch", name: "Scratch", entryFee: 20, minReward: 0, maxReward: 75 },
  { id: "prediction", name: "Prediction", entryFee: 30, minReward: 0, maxReward: 120 },
];

export class InMemoryStore {
  users = new Map<string, User>();
  wallets = new Map<string, WalletAccount>();
  walletTransactions: WalletTransaction[] = [];
  taskPassPlans = new Map<string, TaskPassPlan>();
  userTaskPasses = new Map<string, UserTaskPass>();
  dailyTasks = new Map<string, DailyTask>();
  userDailyTaskAssignments = new Map<string, UserDailyTaskAssignment>();
  dailyCheckIns: DailyCheckIn[] = [];
  tokenTransactions: TokenTransaction[] = [];
  rewardMilestones = new Map<string, RewardMilestone>();
  userMilestoneProgresses = new Map<string, UserMilestoneProgress>();
  referralCommissionRules = new Map<string, ReferralCommissionRule>();
  referralCommissions = new Map<string, ReferralCommission>();
  depositBonusRules = new Map<string, DepositBonusRule>();
  depositBonuses = new Map<string, DepositBonus>();
  redemptionRequests = new Map<string, RedemptionRequest>();
  depositOrders = new Map<string, DepositOrder>();
  depositProviderEvents: DepositProviderEvent[] = [];
  rewardRules = new Map<string, RewardRule>();
  rewardChunkBuckets = new Map<string, ChunkBucket>();
  sellOrders = new Map<string, SellOrder>();
  sellOrderChunks = new Map<string, SellOrderChunk>();
  demandPools = new Map<string, DemandPool>();
  tradeMatches: TradeMatch[] = [];
  withdrawBeneficiaries = new Map<string, WithdrawBeneficiary>();
  withdrawRequests = new Map<string, WithdrawRequest>();
  adminAuditLogs: AdminAuditLog[] = [];
  games = gameDefinitions;

  constructor(seedAdmins = true) {
    if (seedAdmins) {
      const createdAt = now();
      const admin: User = {
        id: "admin_super",
        phone: "9999999999",
        name: "Super Admin",
        referralCode: "ADMIN999",
        role: "superadmin",
        blocked: false,
        createdAt,
      };
      const operator: User = {
        id: "admin_operator",
        phone: "8888888888",
        name: "Operator",
        referralCode: "OPS888",
        role: "operator",
        blocked: false,
        createdAt,
      };
      this.users.set(admin.id, admin);
      this.users.set(operator.id, operator);
    }

    this.seedRewardRules();
    this.seedChunkBuckets();
    this.seedDemandPools();
    this.seedTaskPassPlans();
    this.seedDailyTasks();
    this.seedMilestones();
    this.seedReferralCommissionRules();
    this.seedDepositBonusRules();
  }

  protected ensureTaskPassSeedData() {
    if (!this.taskPassPlans.size) {
      this.seedTaskPassPlans();
    }
    if (!this.dailyTasks.size) {
      this.seedDailyTasks();
    }
    if (!this.rewardMilestones.size) {
      this.seedMilestones();
    }
    if (!this.referralCommissionRules.size) {
      this.seedReferralCommissionRules();
    }
    if (!this.depositBonusRules.size) {
      this.seedDepositBonusRules();
    }
  }

  async initialize() {
    return;
  }

  async flush() {
    return;
  }

  findUserByPhone(phone: string) {
    return Array.from(this.users.values()).find((candidate) => candidate.phone === phone);
  }

  findUserByReferralCode(referralCode: string) {
    return Array.from(this.users.values()).find((candidate) => candidate.referralCode === referralCode);
  }

  createWallet(userId: string): WalletAccount {
    const account: WalletAccount = {
      userId,
      principalBalance: 0,
      rewardBalance: 0,
      listedBalance: 0,
      soldBalance: 0,
      withdrawableBalance: 0,
      lockedBalance: 0,
      updatedAt: now(),
    };
    this.wallets.set(userId, account);
    return account;
  }

  getWallet(userId: string): WalletAccount {
    return this.wallets.get(userId) ?? this.createWallet(userId);
  }

  addWalletTransaction(
    userId: string,
    type: WalletTransaction["type"],
    amount: number,
    metadata: Record<string, unknown>,
  ) {
    const transaction: WalletTransaction = {
      id: id("txn"),
      userId,
      type,
      amount,
      metadata,
      createdAt: now(),
    };
    this.walletTransactions.unshift(transaction);
    return transaction;
  }

  addTokenTransaction(
    userId: string,
    amount: number,
    direction: TokenTransaction["direction"],
    reason: TokenTransaction["reason"],
    referenceId: string,
    balanceAfter: number,
  ) {
    const transaction: TokenTransaction = {
      id: id("token_txn"),
      userId,
      amount,
      direction,
      reason,
      referenceId,
      balanceAfter,
      createdAt: now(),
    };
    this.tokenTransactions.unshift(transaction);
    return transaction;
  }

  addDepositProviderEvent(
    depositOrderId: string,
    provider: DepositProviderEvent["provider"],
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const event: DepositProviderEvent = {
      id: id("dep_evt"),
      depositOrderId,
      provider,
      eventType,
      payload,
      createdAt: now(),
    };
    this.depositProviderEvents.unshift(event);
    return event;
  }

  hasDepositProviderEvent(
    depositOrderId: string,
    eventType: string,
    matcher?: (event: DepositProviderEvent) => boolean,
  ) {
    return this.depositProviderEvents.some(
      (event) =>
        event.depositOrderId === depositOrderId &&
        event.eventType === eventType &&
        (matcher ? matcher(event) : true),
    );
  }

  findDepositProviderEvents(depositOrderId: string, eventType?: string) {
    return this.depositProviderEvents.filter(
      (event) => event.depositOrderId === depositOrderId && (!eventType || event.eventType === eventType),
    );
  }

  hasWalletTransactionForDeposit(userId: string, type: WalletTransactionType, depositId: string) {
    return this.walletTransactions.some(
      (transaction) =>
        transaction.userId === userId &&
        transaction.type === type &&
        transaction.metadata.depositId === depositId,
    );
  }

  findSellOrderByDeposit(depositOrderId: string) {
    return Array.from(this.sellOrders.values()).find((sellOrder) => sellOrder.depositOrderId === depositOrderId);
  }

  findActiveTaskPass(userId: string, referenceDate = now()) {
    const active = Array.from(this.userTaskPasses.values())
      .filter(
        (taskPass) =>
          taskPass.userId === userId &&
          taskPass.status === "active" &&
          taskPass.startsAt &&
          taskPass.endsAt &&
          taskPass.startsAt <= referenceDate &&
          taskPass.endsAt >= referenceDate,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return active[0];
  }

  findAssignmentsForUserDate(userId: string, date: string) {
    return Array.from(this.userDailyTaskAssignments.values()).filter(
      (assignment) => assignment.userId === userId && assignment.date === date,
    );
  }

  getChunkBuckets(): ChunkBucket[] {
    return Array.from(this.rewardChunkBuckets.values());
  }

  upsertReferralSummary(userId: string): ReferralSummary {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const referredUsers = Array.from(this.users.values()).filter((candidate) => candidate.referredByUserId === userId);
    const totalRewardAmount = this.walletTransactions
      .filter((txn) => txn.userId === userId && txn.metadata.reason === "referral")
      .reduce((sum, txn) => sum + txn.amount, 0);
    const commissions = Array.from(this.referralCommissions.values())
      .filter((commission) => commission.referrerUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const totalCommissionTokens = commissions
      .filter((commission) => commission.status === "credited")
      .reduce((sum, commission) => sum + commission.rewardTokens, 0);
    const pendingCommissionTokens = commissions
      .filter((commission) => commission.status === "pending")
      .reduce((sum, commission) => sum + commission.rewardTokens, 0);
    const referrals = referredUsers
      .map((referredUser) => {
        const userCommissions = commissions.filter((commission) => commission.referredUserId === referredUser.id);
        const creditedTokens = userCommissions
          .filter((commission) => commission.status === "credited")
          .reduce((sum, commission) => sum + commission.rewardTokens, 0);
        const pendingTokens = userCommissions
          .filter((commission) => commission.status === "pending")
          .reduce((sum, commission) => sum + commission.rewardTokens, 0);

        return {
          userId: referredUser.id,
          name: referredUser.name,
          joinedAt: referredUser.createdAt,
          status: creditedTokens > 0 ? "credited" : pendingTokens > 0 ? "qualified" : "joined",
          rewardTokens: creditedTokens || pendingTokens,
        } satisfies ReferralSummary["referrals"][number];
      })
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

    return {
      code: user.referralCode,
      totalReferredUsers: referredUsers.length,
      rewardedReferrals: commissions.filter((commission) => commission.status === "credited").length,
      totalRewardAmount,
      totalCommissionTokens,
      pendingCommissionTokens,
      commissionNote: "Commission is credited only after the referred user completes the required task or milestone.",
      referrals,
      commissions,
    };
  }

  ensureSevenDigitUserIds() {
    const reservedIds = new Set(Array.from(this.users.values()).map((candidate) => candidate.id));
    const mapping = new Map<string, string>();

    for (const user of this.users.values()) {
      if (user.role !== "user" || USER_ID_PATTERN.test(user.id)) {
        continue;
      }
      reservedIds.delete(user.id);
      const nextId = createSevenDigitUserId(reservedIds);
      reservedIds.add(nextId);
      mapping.set(user.id, nextId);
    }

    if (!mapping.size) {
      return 0;
    }

    this.users = new Map(
      Array.from(this.users.values()).map((user) => {
        const nextId = mapping.get(user.id) ?? user.id;
        const nextReferredBy =
          user.referredByUserId ? mapping.get(user.referredByUserId) ?? user.referredByUserId : undefined;
        return [
          nextId,
          {
            ...user,
            id: nextId,
            referredByUserId: nextReferredBy,
          },
        ];
      }),
    );

    this.wallets = new Map(
      Array.from(this.wallets.values()).map((wallet) => {
        const nextUserId = mapping.get(wallet.userId) ?? wallet.userId;
        return [
          nextUserId,
          {
            ...wallet,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.walletTransactions = this.walletTransactions.map((transaction) => ({
      ...transaction,
      userId: mapping.get(transaction.userId) ?? transaction.userId,
      metadata: {
        ...transaction.metadata,
        referredUserId:
          typeof transaction.metadata.referredUserId === "string"
            ? mapping.get(transaction.metadata.referredUserId) ?? transaction.metadata.referredUserId
            : transaction.metadata.referredUserId,
      },
    }));

    this.userTaskPasses = new Map(
      Array.from(this.userTaskPasses.values()).map((taskPass) => {
        const nextUserId = mapping.get(taskPass.userId) ?? taskPass.userId;
        return [
          taskPass.id,
          {
            ...taskPass,
            userId: nextUserId,
            activatedByAdminId:
              taskPass.activatedByAdminId ? mapping.get(taskPass.activatedByAdminId) ?? taskPass.activatedByAdminId : undefined,
          },
        ];
      }),
    );

    this.userDailyTaskAssignments = new Map(
      Array.from(this.userDailyTaskAssignments.values()).map((assignment) => {
        const nextUserId = mapping.get(assignment.userId) ?? assignment.userId;
        return [
          assignment.id,
          {
            ...assignment,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.dailyCheckIns = this.dailyCheckIns.map((checkIn) => ({
      ...checkIn,
      userId: mapping.get(checkIn.userId) ?? checkIn.userId,
    }));

    this.tokenTransactions = this.tokenTransactions.map((transaction) => ({
      ...transaction,
      userId: mapping.get(transaction.userId) ?? transaction.userId,
    }));

    this.depositOrders = new Map(
      Array.from(this.depositOrders.values()).map((deposit) => {
        const nextUserId = mapping.get(deposit.userId) ?? deposit.userId;
        return [
          deposit.id,
          {
            ...deposit,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.sellOrders = new Map(
      Array.from(this.sellOrders.values()).map((sellOrder) => {
        const nextUserId = mapping.get(sellOrder.userId) ?? sellOrder.userId;
        return [
          sellOrder.id,
          {
            ...sellOrder,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.sellOrderChunks = new Map(
      Array.from(this.sellOrderChunks.values()).map((chunk) => {
        const nextUserId = mapping.get(chunk.userId) ?? chunk.userId;
        return [
          chunk.id,
          {
            ...chunk,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.tradeMatches = this.tradeMatches.map((match) => ({
      ...match,
      userId: mapping.get(match.userId) ?? match.userId,
    }));

    this.withdrawBeneficiaries = new Map(
      Array.from(this.withdrawBeneficiaries.values()).map((beneficiary) => {
        const nextUserId = mapping.get(beneficiary.userId) ?? beneficiary.userId;
        return [
          beneficiary.id,
          {
            ...beneficiary,
            userId: nextUserId,
          },
        ];
      }),
    );

    this.withdrawRequests = new Map(
      Array.from(this.withdrawRequests.values()).map((withdrawal) => {
        const nextUserId = mapping.get(withdrawal.userId) ?? withdrawal.userId;
        return [
          withdrawal.id,
          {
            ...withdrawal,
            userId: nextUserId,
          },
        ];
      }),
    );

    return mapping.size;
  }

  private seedRewardRules() {
    const rules: RewardRule[] = [
      { id: "rule_1", minDepositAmount: 100, maxDepositAmount: 499, rewardPercent: 3, active: true, createdAt: now() },
      { id: "rule_2", minDepositAmount: 500, maxDepositAmount: 999, rewardPercent: 5, active: true, createdAt: now() },
      { id: "rule_3", minDepositAmount: 1000, maxDepositAmount: 100000, rewardPercent: 7, active: true, createdAt: now() },
    ];
    for (const rule of rules) {
      this.rewardRules.set(rule.id, rule);
    }
  }

  private seedChunkBuckets() {
    const buckets: ChunkBucket[] = [
      { id: "bucket_small", label: "100-200", minAmount: 100, maxAmount: 200, targetAmount: 200, active: true },
      { id: "bucket_medium", label: "200-500", minAmount: 200, maxAmount: 500, targetAmount: 300, active: true },
      { id: "bucket_large", label: "500-1000", minAmount: 500, maxAmount: 1000, targetAmount: 500, active: true },
    ];
    for (const bucket of buckets) {
      this.rewardChunkBuckets.set(bucket.id, bucket);
    }
  }

  private seedDemandPools() {
    const pools: DemandPool[] = [
      {
        id: "demand_small",
        bucketId: "bucket_small",
        label: "Small demand",
        requestedAmount: 1000,
        remainingAmount: 1000,
        priority: 1,
        createdAt: now(),
        active: true,
      },
      {
        id: "demand_medium",
        bucketId: "bucket_medium",
        label: "Medium demand",
        requestedAmount: 1500,
        remainingAmount: 1500,
        priority: 2,
        createdAt: now(),
        active: true,
      },
      {
        id: "demand_large",
        bucketId: "bucket_large",
        label: "Large demand",
        requestedAmount: 2000,
        remainingAmount: 2000,
        priority: 3,
        createdAt: now(),
        active: true,
      },
    ];
    for (const pool of pools) {
      this.demandPools.set(pool.id, pool);
    }
  }

  protected seedTaskPassPlans() {
    const createdAt = now();
    const plans: TaskPassPlan[] = [
      {
        id: "pass_starter",
        name: "Starter Pass",
        durationDays: 7,
        dailyTaskMin: 2,
        dailyTaskMax: 3,
        dailyTokenCap: 60,
        targetTokens: 300,
        priceAmount: 49,
        currency: "INR",
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pass_growth",
        name: "Growth Pass",
        durationDays: 12,
        dailyTaskMin: 3,
        dailyTaskMax: 5,
        dailyTokenCap: 100,
        targetTokens: 500,
        priceAmount: 149,
        currency: "INR",
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pass_plus",
        name: "Plus Pass",
        durationDays: 21,
        dailyTaskMin: 4,
        dailyTaskMax: 6,
        dailyTokenCap: 160,
        targetTokens: 1000,
        priceAmount: 349,
        currency: "INR",
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pass_pro",
        name: "Pro Pass",
        durationDays: 30,
        dailyTaskMin: 5,
        dailyTaskMax: 8,
        dailyTokenCap: 250,
        targetTokens: 2000,
        priceAmount: 599,
        currency: "INR",
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
    ];

    for (const plan of plans) {
      this.taskPassPlans.set(plan.id, plan);
    }
  }

  protected seedDailyTasks() {
    const createdAt = now();
    const tasks: DailyTask[] = [
      {
        id: "task_checkin",
        title: "Daily Check-in",
        description: "Open the app and claim your daily attendance reward.",
        type: "checkin",
        rewardTokens: 10,
        requiresApproval: false,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task_link_visit",
        title: "Visit Link",
        description: "Open the assigned link and return to the app.",
        type: "link_visit",
        rewardTokens: 20,
        requiresApproval: false,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task_proof_upload",
        title: "Submit Proof",
        description: "Upload proof for the assigned task.",
        type: "proof_upload",
        rewardTokens: 30,
        requiresApproval: true,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task_quiz",
        title: "Quiz Task",
        description: "Complete the short daily quiz.",
        type: "quiz",
        rewardTokens: 20,
        requiresApproval: false,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task_ad_watch",
        title: "Watch Ad Placeholder",
        description: "Placeholder task for daily watch flow.",
        type: "ad_watch",
        rewardTokens: 10,
        requiresApproval: false,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
    ];

    for (const task of tasks) {
      this.dailyTasks.set(task.id, task);
    }
  }

  protected seedMilestones() {
    const createdAt = now();
    const milestones: RewardMilestone[] = [
      {
        id: "milestone_starter_day3",
        planId: "pass_starter",
        name: "Starter Day 3",
        requiredDay: 3,
        requiredCompletedTasks: 6,
        rewardTokens: 50,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "milestone_starter_day7",
        planId: "pass_starter",
        name: "Starter Day 7",
        requiredDay: 7,
        requiredCompletedTasks: 18,
        rewardTokens: 300,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "milestone_growth_day5",
        planId: "pass_growth",
        name: "Growth Day 5",
        requiredDay: 5,
        requiredCompletedTasks: 15,
        rewardTokens: 100,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "milestone_growth_day12",
        planId: "pass_growth",
        name: "Growth Day 12",
        requiredDay: 12,
        requiredCompletedTasks: 45,
        rewardTokens: 500,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
    ];

    for (const milestone of milestones) {
      this.rewardMilestones.set(milestone.id, milestone);
    }
  }

  protected seedReferralCommissionRules() {
    const createdAt = now();
    const rule: ReferralCommissionRule = {
      id: "referral_rule_default",
      trigger: "referred_milestone_completed",
      rewardType: "fixed_tokens",
      rewardValue: 50,
      maxRewardTokens: 50,
      active: true,
      createdAt,
      updatedAt: createdAt,
    };
    this.referralCommissionRules.set(rule.id, rule);
  }

  protected seedDepositBonusRules() {
    const createdAt = now();
    const rules: DepositBonusRule[] = [
      {
        id: "bonus_rule_500",
        minDepositAmount: 500,
        bonusPercent: 2,
        maxBonusTokens: 100,
        unlockRequiredApprovedTasks: 3,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "bonus_rule_1000",
        minDepositAmount: 1000,
        bonusPercent: 3,
        maxBonusTokens: 250,
        unlockRequiredApprovedTasks: 5,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "bonus_rule_5000",
        minDepositAmount: 5000,
        bonusPercent: 5,
        maxBonusTokens: 1000,
        unlockRequiredApprovedTasks: 10,
        active: true,
        createdAt,
        updatedAt: createdAt,
      },
    ];

    for (const rule of rules) {
      this.depositBonusRules.set(rule.id, rule);
    }
  }
}

type SerializedStoreState = {
  users: User[];
  wallets: WalletAccount[];
  walletTransactions: WalletTransaction[];
  taskPassPlans: TaskPassPlan[];
  userTaskPasses: UserTaskPass[];
  dailyTasks: DailyTask[];
  userDailyTaskAssignments: UserDailyTaskAssignment[];
  dailyCheckIns: DailyCheckIn[];
  tokenTransactions: TokenTransaction[];
  rewardMilestones: RewardMilestone[];
  userMilestoneProgresses: UserMilestoneProgress[];
  referralCommissionRules: ReferralCommissionRule[];
  referralCommissions: ReferralCommission[];
  depositBonusRules: DepositBonusRule[];
  depositBonuses: DepositBonus[];
  redemptionRequests: RedemptionRequest[];
  depositOrders: DepositOrder[];
  depositProviderEvents: DepositProviderEvent[];
  rewardRules: RewardRule[];
  chunkBuckets: ChunkBucket[];
  sellOrders: SellOrder[];
  sellOrderChunks: SellOrderChunk[];
  demandPools: DemandPool[];
  tradeMatches: TradeMatch[];
  withdrawBeneficiaries: WithdrawBeneficiary[];
  withdrawRequests: WithdrawRequest[];
  adminAuditLogs: AdminAuditLog[];
  games: GameDefinition[];
};

export class FileStore extends InMemoryStore {
  private loaded = false;

  constructor(private readonly filePath: string) {
    super(true);
  }

  private resolvePath() {
    return path.isAbsolute(this.filePath) ? this.filePath : path.resolve(process.cwd(), this.filePath);
  }

  private toState(): SerializedStoreState {
    return {
      users: Array.from(this.users.values()),
      wallets: Array.from(this.wallets.values()),
      walletTransactions: this.walletTransactions,
      taskPassPlans: Array.from(this.taskPassPlans.values()),
      userTaskPasses: Array.from(this.userTaskPasses.values()),
      dailyTasks: Array.from(this.dailyTasks.values()),
      userDailyTaskAssignments: Array.from(this.userDailyTaskAssignments.values()),
      dailyCheckIns: this.dailyCheckIns,
      tokenTransactions: this.tokenTransactions,
      rewardMilestones: Array.from(this.rewardMilestones.values()),
      userMilestoneProgresses: Array.from(this.userMilestoneProgresses.values()),
      referralCommissionRules: Array.from(this.referralCommissionRules.values()),
      referralCommissions: Array.from(this.referralCommissions.values()),
      depositBonusRules: Array.from(this.depositBonusRules.values()),
      depositBonuses: Array.from(this.depositBonuses.values()),
      redemptionRequests: Array.from(this.redemptionRequests.values()),
      depositOrders: Array.from(this.depositOrders.values()),
      depositProviderEvents: this.depositProviderEvents,
      rewardRules: Array.from(this.rewardRules.values()),
      chunkBuckets: Array.from(this.rewardChunkBuckets.values()),
      sellOrders: Array.from(this.sellOrders.values()),
      sellOrderChunks: Array.from(this.sellOrderChunks.values()),
      demandPools: Array.from(this.demandPools.values()),
      tradeMatches: this.tradeMatches,
      withdrawBeneficiaries: Array.from(this.withdrawBeneficiaries.values()),
      withdrawRequests: Array.from(this.withdrawRequests.values()),
      adminAuditLogs: this.adminAuditLogs,
      games: this.games,
    };
  }

  private fromState(state: SerializedStoreState) {
    this.users = new Map(state.users.map((item) => [item.id, item]));
    this.wallets = new Map(state.wallets.map((item) => [item.userId, item]));
    this.walletTransactions = state.walletTransactions;
    this.taskPassPlans = new Map((state.taskPassPlans ?? []).map((item) => [item.id, item]));
    this.userTaskPasses = new Map((state.userTaskPasses ?? []).map((item) => [item.id, item]));
    this.dailyTasks = new Map((state.dailyTasks ?? []).map((item) => [item.id, item]));
    this.userDailyTaskAssignments = new Map((state.userDailyTaskAssignments ?? []).map((item) => [item.id, item]));
    this.dailyCheckIns = state.dailyCheckIns ?? [];
    this.tokenTransactions = state.tokenTransactions ?? [];
    this.rewardMilestones = new Map((state.rewardMilestones ?? []).map((item) => [item.id, item]));
    this.userMilestoneProgresses = new Map((state.userMilestoneProgresses ?? []).map((item) => [item.id, item]));
    this.referralCommissionRules = new Map((state.referralCommissionRules ?? []).map((item) => [item.id, item]));
    this.referralCommissions = new Map((state.referralCommissions ?? []).map((item) => [item.id, item]));
    this.depositBonusRules = new Map((state.depositBonusRules ?? []).map((item) => [item.id, item]));
    this.depositBonuses = new Map((state.depositBonuses ?? []).map((item) => [item.id, item]));
    this.redemptionRequests = new Map((state.redemptionRequests ?? []).map((item) => [item.id, item]));
    this.depositOrders = new Map(state.depositOrders.map((item) => [item.id, item]));
    this.depositProviderEvents = state.depositProviderEvents;
    this.rewardRules = new Map(state.rewardRules.map((item) => [item.id, item]));
    this.rewardChunkBuckets = new Map(state.chunkBuckets.map((item) => [item.id, item]));
    this.sellOrders = new Map(state.sellOrders.map((item) => [item.id, item]));
    this.sellOrderChunks = new Map(state.sellOrderChunks.map((item) => [item.id, item]));
    this.demandPools = new Map(state.demandPools.map((item) => [item.id, item]));
    this.tradeMatches = state.tradeMatches;
    this.withdrawBeneficiaries = new Map(state.withdrawBeneficiaries.map((item) => [item.id, item]));
    this.withdrawRequests = new Map(state.withdrawRequests.map((item) => [item.id, item]));
    this.adminAuditLogs = state.adminAuditLogs;
    this.games = state.games?.length ? state.games : gameDefinitions;
    this.ensureTaskPassSeedData();
  }

  override async initialize() {
    if (this.loaded) {
      return;
    }

    const resolvedPath = this.resolvePath();
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    try {
      const raw = await fs.readFile(resolvedPath, "utf8");
      const parsed = JSON.parse(raw) as SerializedStoreState;
      this.fromState(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      await this.flush();
    }

    this.loaded = true;
  }

  override async flush() {
    const resolvedPath = this.resolvePath();
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, JSON.stringify(this.toState(), null, 2), "utf8");
  }
}

const numberValue = (value: unknown) => Number(value ?? 0);
type DbRow = Record<string, unknown>;

export class PostgresStore extends InMemoryStore {
  constructor(private readonly pool: Pool) {
    super(true);
  }

  override async initialize() {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      const [
        usersResult,
        walletsResult,
        walletTransactionsResult,
        taskPassPlansResult,
        userTaskPassesResult,
        dailyTasksResult,
        userDailyTaskAssignmentsResult,
        dailyCheckInsResult,
        tokenTransactionsResult,
        rewardMilestonesResult,
        userMilestoneProgressesResult,
        referralCommissionRulesResult,
        referralCommissionsResult,
        depositBonusRulesResult,
        depositBonusesResult,
        redemptionRequestsResult,
        depositsResult,
        depositEventsResult,
        rewardRulesResult,
        chunkBucketsResult,
        sellOrdersResult,
        sellOrderChunksResult,
        demandPoolsResult,
        tradeMatchesResult,
        beneficiariesResult,
        withdrawalsResult,
        auditLogsResult,
      ] = await Promise.all([
        client.query("select id, phone, name, referral_code, referred_by_user_id, role, blocked, created_at from users"),
        client.query(
          "select user_id, principal_balance, reward_balance, listed_balance, sold_balance, withdrawable_balance, locked_balance, updated_at from wallet_accounts",
        ),
        client.query("select id, user_id, type, amount, metadata, created_at from wallet_transactions order by created_at desc"),
        client.query(
          "select id, name, duration_days, daily_task_min, daily_task_max, daily_token_cap, target_tokens, price_amount, currency, active, created_at, updated_at from task_pass_plans order by created_at asc",
        ),
        client.query(
          "select id, user_id, plan_id, status, starts_at, ends_at, activated_by_admin_id, payment_reference, created_at, updated_at from user_task_passes order by created_at desc",
        ),
        client.query(
          "select id, title, description, type, reward_tokens, requires_approval, active, created_at, updated_at from daily_tasks order by created_at asc",
        ),
        client.query(
          "select id, user_id, task_pass_id, task_id, date, status, reward_tokens, proof, created_at, started_at, submitted_at, approved_at, claimed_at, rejected_reason from user_daily_task_assignments order by created_at desc",
        ),
        client.query(
          "select id, user_id, task_pass_id, date, reward_tokens, claimed_at from daily_check_ins order by claimed_at desc",
        ),
        client.query(
          "select id, user_id, amount, direction, reason, reference_id, balance_after, created_at from token_transactions order by created_at desc",
        ),
        client.query(
          "select id, plan_id, name, required_day, required_completed_tasks, reward_tokens, active, created_at, updated_at from reward_milestones order by required_day asc, created_at asc",
        ),
        client.query(
          "select id, user_id, task_pass_id, milestone_id, status, completed_at, claimed_at from user_milestone_progresses order by milestone_id asc",
        ),
        client.query(
          "select id, trigger, reward_type, reward_value, max_reward_tokens, required_task_id, required_milestone_id, active, created_at, updated_at from referral_commission_rules order by created_at asc",
        ),
        client.query(
          "select id, referrer_user_id, referred_user_id, rule_id, trigger_type, trigger_reference_id, reward_tokens, status, credited_at, created_at from referral_commissions order by created_at desc",
        ),
        client.query(
          "select id, min_deposit_amount, bonus_percent, max_bonus_tokens, unlock_required_approved_tasks, active, created_at, updated_at from deposit_bonus_rules order by min_deposit_amount asc",
        ),
        client.query(
          "select id, user_id, deposit_id, rule_id, deposit_amount, bonus_tokens, unlock_required_approved_tasks, status, unlocked_at, credited_at, created_at from deposit_bonuses order by created_at desc",
        ),
        client.query(
          "select id, user_id, tokens, value_amount, status, payout_method, note, created_at, reviewed_at, paid_at from redemption_requests order by created_at desc",
        ),
        client.query(
          "select id, user_id, amount, provider, status, checkout_url, provider_order_id, checkout_session, task_pass_plan_id, created_at, updated_at from deposit_orders order by created_at desc",
        ),
        client.query(
          "select id, deposit_order_id, provider, event_type, payload, created_at from deposit_provider_events order by created_at desc",
        ),
        client.query(
          "select id, min_deposit_amount, max_deposit_amount, reward_percent, active, created_at from reward_rules order by min_deposit_amount asc",
        ),
        client.query("select id, label, min_amount, max_amount, target_amount, active from chunk_buckets order by min_amount asc"),
        client.query("select id, user_id, deposit_order_id, total_amount, sold_amount, status, created_at from sell_orders order by created_at asc"),
        client.query(
          "select id, sell_order_id, user_id, bucket_id, amount, remaining_amount, listed_at from sell_order_chunks order by listed_at asc",
        ),
        client.query(
          "select id, bucket_id, label, requested_amount, remaining_amount, priority, active, created_at from demand_pools order by priority asc, created_at asc",
        ),
        client.query(
          "select id, sell_order_chunk_id, demand_pool_id, user_id, amount, created_at from trade_matches order by created_at desc",
        ),
        client.query(
          "select id, user_id, type, label, account_name, upi_id, bank_account_number, ifsc_code, created_at from withdraw_beneficiaries order by created_at desc",
        ),
        client.query(
          "select id, user_id, beneficiary_id, amount, status, provider_reference, provider_status, created_at, updated_at from withdraw_requests order by created_at desc",
        ),
        client.query(
          "select id, admin_user_id, action, entity_type, entity_id, payload, created_at from admin_audit_logs order by created_at desc",
        ),
      ]);

      if (usersResult.rowCount === 0) {
        await this.flush();
        return;
      }

      this.users = new Map(
        usersResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            phone: row.phone as string,
            name: row.name as string,
            referralCode: row.referral_code as string,
            referredByUserId: (row.referred_by_user_id as string | null) ?? undefined,
            role: row.role as User["role"],
            blocked: row.blocked as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.wallets = new Map(
        walletsResult.rows.map((row: DbRow) => [
          row.user_id as string,
          {
            userId: row.user_id as string,
            principalBalance: numberValue(row.principal_balance),
            rewardBalance: numberValue(row.reward_balance),
            listedBalance: numberValue(row.listed_balance),
            soldBalance: numberValue(row.sold_balance),
            withdrawableBalance: numberValue(row.withdrawable_balance),
            lockedBalance: numberValue(row.locked_balance),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.walletTransactions = walletTransactionsResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        userId: row.user_id as string,
        type: row.type as WalletTransactionType,
        amount: numberValue(row.amount),
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        createdAt: new Date(row.created_at as string).toISOString(),
      }));

      this.taskPassPlans = new Map(
        taskPassPlansResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            name: row.name as string,
            durationDays: Number(row.duration_days),
            dailyTaskMin: Number(row.daily_task_min),
            dailyTaskMax: Number(row.daily_task_max),
            dailyTokenCap: numberValue(row.daily_token_cap),
            targetTokens: numberValue(row.target_tokens),
            priceAmount: numberValue(row.price_amount),
            currency: row.currency as string,
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.userTaskPasses = new Map(
        userTaskPassesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            planId: row.plan_id as string,
            status: row.status as UserTaskPass["status"],
            startsAt: (row.starts_at as string | null) ? new Date(row.starts_at as string).toISOString() : undefined,
            endsAt: (row.ends_at as string | null) ? new Date(row.ends_at as string).toISOString() : undefined,
            activatedByAdminId: (row.activated_by_admin_id as string | null) ?? undefined,
            paymentReference: (row.payment_reference as string | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.dailyTasks = new Map(
        dailyTasksResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            title: row.title as string,
            description: row.description as string,
            type: row.type as DailyTask["type"],
            rewardTokens: numberValue(row.reward_tokens),
            requiresApproval: row.requires_approval as boolean,
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.userDailyTaskAssignments = new Map(
        userDailyTaskAssignmentsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            taskPassId: row.task_pass_id as string,
            taskId: row.task_id as string,
            date: row.date as string,
            status: row.status as UserDailyTaskAssignment["status"],
            rewardTokens: numberValue(row.reward_tokens),
            proof: (row.proof as string | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
            startedAt: (row.started_at as string | null) ? new Date(row.started_at as string).toISOString() : undefined,
            submittedAt: (row.submitted_at as string | null) ? new Date(row.submitted_at as string).toISOString() : undefined,
            approvedAt: (row.approved_at as string | null) ? new Date(row.approved_at as string).toISOString() : undefined,
            claimedAt: (row.claimed_at as string | null) ? new Date(row.claimed_at as string).toISOString() : undefined,
            rejectedReason: (row.rejected_reason as string | null) ?? undefined,
          },
        ]),
      );

      this.dailyCheckIns = dailyCheckInsResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        userId: row.user_id as string,
        taskPassId: row.task_pass_id as string,
        date: row.date as string,
        rewardTokens: numberValue(row.reward_tokens),
        claimedAt: new Date(row.claimed_at as string).toISOString(),
      }));

      this.tokenTransactions = tokenTransactionsResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        userId: row.user_id as string,
        amount: numberValue(row.amount),
        direction: row.direction as TokenTransaction["direction"],
        reason: row.reason as TokenTransaction["reason"],
        referenceId: row.reference_id as string,
        balanceAfter: numberValue(row.balance_after),
        createdAt: new Date(row.created_at as string).toISOString(),
      }));

      this.rewardMilestones = new Map(
        rewardMilestonesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            planId: row.plan_id as string,
            name: row.name as string,
            requiredDay: Number(row.required_day),
            requiredCompletedTasks: Number(row.required_completed_tasks),
            rewardTokens: numberValue(row.reward_tokens),
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.userMilestoneProgresses = new Map(
        userMilestoneProgressesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            taskPassId: row.task_pass_id as string,
            milestoneId: row.milestone_id as string,
            status: row.status as UserMilestoneProgress["status"],
            completedAt: (row.completed_at as string | null) ? new Date(row.completed_at as string).toISOString() : undefined,
            claimedAt: (row.claimed_at as string | null) ? new Date(row.claimed_at as string).toISOString() : undefined,
          },
        ]),
      );

      this.referralCommissionRules = new Map(
        referralCommissionRulesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            trigger: row.trigger as ReferralCommissionRule["trigger"],
            rewardType: row.reward_type as ReferralCommissionRule["rewardType"],
            rewardValue: numberValue(row.reward_value),
            maxRewardTokens: row.max_reward_tokens == null ? undefined : numberValue(row.max_reward_tokens),
            requiredTaskId: (row.required_task_id as string | null) ?? undefined,
            requiredMilestoneId: (row.required_milestone_id as string | null) ?? undefined,
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.referralCommissions = new Map(
        referralCommissionsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            referrerUserId: row.referrer_user_id as string,
            referredUserId: row.referred_user_id as string,
            ruleId: row.rule_id as string,
            triggerType: row.trigger_type as ReferralCommission["triggerType"],
            triggerReferenceId: row.trigger_reference_id as string,
            rewardTokens: numberValue(row.reward_tokens),
            status: row.status as ReferralCommission["status"],
            creditedAt: (row.credited_at as string | null) ? new Date(row.credited_at as string).toISOString() : undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.depositBonusRules = new Map(
        depositBonusRulesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            minDepositAmount: numberValue(row.min_deposit_amount),
            bonusPercent: numberValue(row.bonus_percent),
            maxBonusTokens: numberValue(row.max_bonus_tokens),
            unlockRequiredApprovedTasks: Number(row.unlock_required_approved_tasks),
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.depositBonuses = new Map(
        depositBonusesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            depositId: row.deposit_id as string,
            ruleId: row.rule_id as string,
            depositAmount: numberValue(row.deposit_amount),
            bonusTokens: numberValue(row.bonus_tokens),
            unlockRequiredApprovedTasks: Number(row.unlock_required_approved_tasks),
            status: row.status as DepositBonus["status"],
            unlockedAt: (row.unlocked_at as string | null) ? new Date(row.unlocked_at as string).toISOString() : undefined,
            creditedAt: (row.credited_at as string | null) ? new Date(row.credited_at as string).toISOString() : undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.redemptionRequests = new Map(
        redemptionRequestsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            tokens: numberValue(row.tokens),
            valueAmount: numberValue(row.value_amount),
            status: row.status as RedemptionRequest["status"],
            payoutMethod: row.payout_method as RedemptionRequest["payoutMethod"],
            note: (row.note as string | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
            reviewedAt: (row.reviewed_at as string | null) ? new Date(row.reviewed_at as string).toISOString() : undefined,
            paidAt: (row.paid_at as string | null) ? new Date(row.paid_at as string).toISOString() : undefined,
          },
        ]),
      );

      this.depositOrders = new Map(
        depositsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            amount: numberValue(row.amount),
            provider: row.provider as string,
            status: row.status as DepositStatus,
            checkoutUrl: row.checkout_url as string,
            providerOrderId: (row.provider_order_id as string | null) ?? undefined,
            checkoutSession: (row.checkout_session as DepositOrder["checkoutSession"] | null) ?? undefined,
            taskPassPlanId: (row.task_pass_plan_id as string | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.depositProviderEvents = depositEventsResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        depositOrderId: row.deposit_order_id as string,
        provider: row.provider as PaymentProvider,
        eventType: row.event_type as string,
        payload: (row.payload as Record<string, unknown>) ?? {},
        createdAt: new Date(row.created_at as string).toISOString(),
      }));

      this.rewardRules = new Map(
        rewardRulesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            minDepositAmount: numberValue(row.min_deposit_amount),
            maxDepositAmount: numberValue(row.max_deposit_amount),
            rewardPercent: numberValue(row.reward_percent),
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.rewardChunkBuckets = new Map(
        chunkBucketsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            label: row.label as string,
            minAmount: numberValue(row.min_amount),
            maxAmount: numberValue(row.max_amount),
            targetAmount: numberValue(row.target_amount),
            active: row.active as boolean,
          },
        ]),
      );

      this.sellOrders = new Map(
        sellOrdersResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            depositOrderId: row.deposit_order_id as string,
            totalAmount: numberValue(row.total_amount),
            soldAmount: numberValue(row.sold_amount),
            status: row.status as SellOrder["status"],
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.sellOrderChunks = new Map(
        sellOrderChunksResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            sellOrderId: row.sell_order_id as string,
            userId: row.user_id as string,
            bucketId: row.bucket_id as string,
            amount: numberValue(row.amount),
            remainingAmount: numberValue(row.remaining_amount),
            listedAt: new Date(row.listed_at as string).toISOString(),
          },
        ]),
      );

      this.demandPools = new Map(
        demandPoolsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            bucketId: row.bucket_id as string,
            label: row.label as string,
            requestedAmount: numberValue(row.requested_amount),
            remainingAmount: numberValue(row.remaining_amount),
            priority: Number(row.priority),
            active: row.active as boolean,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.tradeMatches = tradeMatchesResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        sellOrderChunkId: row.sell_order_chunk_id as string,
        demandPoolId: row.demand_pool_id as string,
        userId: row.user_id as string,
        amount: numberValue(row.amount),
        createdAt: new Date(row.created_at as string).toISOString(),
      }));

      this.withdrawBeneficiaries = new Map(
        beneficiariesResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            type: row.type as BeneficiaryType,
            label: row.label as string,
            accountName: row.account_name as string,
            upiId: (row.upi_id as string | null) ?? undefined,
            bankAccountNumber: (row.bank_account_number as string | null) ?? undefined,
            ifscCode: (row.ifsc_code as string | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
          },
        ]),
      );

      this.withdrawRequests = new Map(
        withdrawalsResult.rows.map((row: DbRow) => [
          row.id as string,
          {
            id: row.id as string,
            userId: row.user_id as string,
            beneficiaryId: row.beneficiary_id as string,
            amount: numberValue(row.amount),
            status: row.status as WithdrawalStatus,
            providerReference: (row.provider_reference as string | null) ?? undefined,
            providerStatus: (row.provider_status as WithdrawRequest["providerStatus"] | null) ?? undefined,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date(row.updated_at as string).toISOString(),
          },
        ]),
      );

      this.adminAuditLogs = auditLogsResult.rows.map((row: DbRow) => ({
        id: row.id as string,
        adminUserId: row.admin_user_id as string,
        action: row.action as string,
        entityType: row.entity_type as string,
        entityId: row.entity_id as string,
        payload: (row.payload as Record<string, unknown>) ?? {},
        createdAt: new Date(row.created_at as string).toISOString(),
      }));
      this.ensureTaskPassSeedData();
    } finally {
      client.release();
    }
  }

  override async flush() {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      await client.query("delete from admin_audit_logs");
      await client.query("delete from trade_matches");
      await client.query("delete from redemption_requests");
      await client.query("delete from deposit_bonuses");
      await client.query("delete from deposit_bonus_rules");
      await client.query("delete from referral_commissions");
      await client.query("delete from referral_commission_rules");
      await client.query("delete from user_milestone_progresses");
      await client.query("delete from reward_milestones");
      await client.query("delete from token_transactions");
      await client.query("delete from daily_check_ins");
      await client.query("delete from user_daily_task_assignments");
      await client.query("delete from daily_tasks");
      await client.query("delete from user_task_passes");
      await client.query("delete from withdraw_requests");
      await client.query("delete from withdraw_beneficiaries");
      await client.query("delete from sell_order_chunks");
      await client.query("delete from sell_orders");
      await client.query("delete from demand_pools");
      await client.query("delete from chunk_buckets");
      await client.query("delete from reward_credits");
      await client.query("delete from deposit_provider_events");
      await client.query("delete from deposit_orders");
      await client.query("delete from task_pass_plans");
      await client.query("delete from wallet_transactions");
      await client.query("delete from wallet_accounts");
      await client.query("delete from otp_sessions");
      await client.query("delete from referrals");
      await client.query("delete from referral_rewards");
      await client.query("delete from admin_users");
      await client.query("delete from reward_rules");
      await client.query("delete from users");

      for (const user of this.users.values()) {
        await client.query(
          `
            insert into users (id, phone, name, referral_code, referred_by_user_id, role, blocked, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [user.id, user.phone, user.name, user.referralCode, user.referredByUserId ?? null, user.role, user.blocked, user.createdAt],
        );

        if (user.role !== "user") {
          await client.query(
            `
              insert into admin_users (user_id, login_phone, role, created_at)
              values ($1, $2, $3, $4)
            `,
            [user.id, user.phone, user.role, user.createdAt],
          );
        }
      }

      for (const wallet of this.wallets.values()) {
        await client.query(
          `
            insert into wallet_accounts
              (user_id, principal_balance, reward_balance, listed_balance, sold_balance, withdrawable_balance, locked_balance, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            wallet.userId,
            wallet.principalBalance,
            wallet.rewardBalance,
            wallet.listedBalance,
            wallet.soldBalance,
            wallet.withdrawableBalance,
            wallet.lockedBalance,
            wallet.updatedAt,
          ],
        );
      }

      for (const transaction of this.walletTransactions) {
        await client.query(
          `
            insert into wallet_transactions (id, user_id, type, amount, metadata, created_at)
            values ($1, $2, $3, $4, $5::jsonb, $6)
          `,
          [transaction.id, transaction.userId, transaction.type, transaction.amount, JSON.stringify(transaction.metadata), transaction.createdAt],
        );
      }

      for (const plan of this.taskPassPlans.values()) {
        await client.query(
          `
            insert into task_pass_plans
              (id, name, duration_days, daily_task_min, daily_task_max, daily_token_cap, target_tokens, price_amount, currency, active, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            plan.id,
            plan.name,
            plan.durationDays,
            plan.dailyTaskMin,
            plan.dailyTaskMax,
            plan.dailyTokenCap,
            plan.targetTokens,
            plan.priceAmount,
            plan.currency,
            plan.active,
            plan.createdAt,
            plan.updatedAt,
          ],
        );
      }

      for (const userTaskPass of this.userTaskPasses.values()) {
        await client.query(
          `
            insert into user_task_passes
              (id, user_id, plan_id, status, starts_at, ends_at, activated_by_admin_id, payment_reference, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            userTaskPass.id,
            userTaskPass.userId,
            userTaskPass.planId,
            userTaskPass.status,
            userTaskPass.startsAt ?? null,
            userTaskPass.endsAt ?? null,
            userTaskPass.activatedByAdminId ?? null,
            userTaskPass.paymentReference ?? null,
            userTaskPass.createdAt,
            userTaskPass.updatedAt,
          ],
        );
      }

      for (const task of this.dailyTasks.values()) {
        await client.query(
          `
            insert into daily_tasks
              (id, title, description, type, reward_tokens, requires_approval, active, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [task.id, task.title, task.description, task.type, task.rewardTokens, task.requiresApproval, task.active, task.createdAt, task.updatedAt],
        );
      }

      for (const assignment of this.userDailyTaskAssignments.values()) {
        await client.query(
          `
            insert into user_daily_task_assignments
              (id, user_id, task_pass_id, task_id, date, status, reward_tokens, proof, created_at, started_at, submitted_at, approved_at, claimed_at, rejected_reason)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            assignment.id,
            assignment.userId,
            assignment.taskPassId,
            assignment.taskId,
            assignment.date,
            assignment.status,
            assignment.rewardTokens,
            assignment.proof ?? null,
            assignment.createdAt,
            assignment.startedAt ?? null,
            assignment.submittedAt ?? null,
            assignment.approvedAt ?? null,
            assignment.claimedAt ?? null,
            assignment.rejectedReason ?? null,
          ],
        );
      }

      for (const checkIn of this.dailyCheckIns) {
        await client.query(
          `
            insert into daily_check_ins
              (id, user_id, task_pass_id, date, reward_tokens, claimed_at)
            values ($1, $2, $3, $4, $5, $6)
          `,
          [checkIn.id, checkIn.userId, checkIn.taskPassId, checkIn.date, checkIn.rewardTokens, checkIn.claimedAt],
        );
      }

      for (const transaction of this.tokenTransactions) {
        await client.query(
          `
            insert into token_transactions
              (id, user_id, amount, direction, reason, reference_id, balance_after, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            transaction.id,
            transaction.userId,
            transaction.amount,
            transaction.direction,
            transaction.reason,
            transaction.referenceId,
            transaction.balanceAfter,
            transaction.createdAt,
          ],
        );
      }

      for (const milestone of this.rewardMilestones.values()) {
        await client.query(
          `
            insert into reward_milestones
              (id, plan_id, name, required_day, required_completed_tasks, reward_tokens, active, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            milestone.id,
            milestone.planId,
            milestone.name,
            milestone.requiredDay,
            milestone.requiredCompletedTasks,
            milestone.rewardTokens,
            milestone.active,
            milestone.createdAt,
            milestone.updatedAt,
          ],
        );
      }

      for (const progress of this.userMilestoneProgresses.values()) {
        await client.query(
          `
            insert into user_milestone_progresses
              (id, user_id, task_pass_id, milestone_id, status, completed_at, claimed_at)
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            progress.id,
            progress.userId,
            progress.taskPassId,
            progress.milestoneId,
            progress.status,
            progress.completedAt ?? null,
            progress.claimedAt ?? null,
          ],
        );
      }

      for (const rule of this.referralCommissionRules.values()) {
        await client.query(
          `
            insert into referral_commission_rules
              (id, trigger, reward_type, reward_value, max_reward_tokens, required_task_id, required_milestone_id, active, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            rule.id,
            rule.trigger,
            rule.rewardType,
            rule.rewardValue,
            rule.maxRewardTokens ?? null,
            rule.requiredTaskId ?? null,
            rule.requiredMilestoneId ?? null,
            rule.active,
            rule.createdAt,
            rule.updatedAt,
          ],
        );
      }

      for (const commission of this.referralCommissions.values()) {
        await client.query(
          `
            insert into referral_commissions
              (id, referrer_user_id, referred_user_id, rule_id, trigger_type, trigger_reference_id, reward_tokens, status, credited_at, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            commission.id,
            commission.referrerUserId,
            commission.referredUserId,
            commission.ruleId,
            commission.triggerType,
            commission.triggerReferenceId,
            commission.rewardTokens,
            commission.status,
            commission.creditedAt ?? null,
            commission.createdAt,
          ],
        );
      }

      for (const rule of this.depositBonusRules.values()) {
        await client.query(
          `
            insert into deposit_bonus_rules
              (id, min_deposit_amount, bonus_percent, max_bonus_tokens, unlock_required_approved_tasks, active, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            rule.id,
            rule.minDepositAmount,
            rule.bonusPercent,
            rule.maxBonusTokens,
            rule.unlockRequiredApprovedTasks,
            rule.active,
            rule.createdAt,
            rule.updatedAt,
          ],
        );
      }

      for (const bonus of this.depositBonuses.values()) {
        await client.query(
          `
            insert into deposit_bonuses
              (id, user_id, deposit_id, rule_id, deposit_amount, bonus_tokens, unlock_required_approved_tasks, status, unlocked_at, credited_at, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            bonus.id,
            bonus.userId,
            bonus.depositId,
            bonus.ruleId,
            bonus.depositAmount,
            bonus.bonusTokens,
            bonus.unlockRequiredApprovedTasks,
            bonus.status,
            bonus.unlockedAt ?? null,
            bonus.creditedAt ?? null,
            bonus.createdAt,
          ],
        );
      }

      for (const request of this.redemptionRequests.values()) {
        await client.query(
          `
            insert into redemption_requests
              (id, user_id, tokens, value_amount, status, payout_method, note, created_at, reviewed_at, paid_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            request.id,
            request.userId,
            request.tokens,
            request.valueAmount,
            request.status,
            request.payoutMethod,
            request.note ?? null,
            request.createdAt,
            request.reviewedAt ?? null,
            request.paidAt ?? null,
          ],
        );
      }

      for (const rule of this.rewardRules.values()) {
        await client.query(
          `
            insert into reward_rules (id, min_deposit_amount, max_deposit_amount, reward_percent, active, created_at)
            values ($1, $2, $3, $4, $5, $6)
          `,
          [rule.id, rule.minDepositAmount, rule.maxDepositAmount, rule.rewardPercent, rule.active, rule.createdAt],
        );
      }

      for (const bucket of this.rewardChunkBuckets.values()) {
        await client.query(
          `
            insert into chunk_buckets (id, label, min_amount, max_amount, target_amount, active)
            values ($1, $2, $3, $4, $5, $6)
          `,
          [bucket.id, bucket.label, bucket.minAmount, bucket.maxAmount, bucket.targetAmount, bucket.active],
        );
      }

      for (const deposit of this.depositOrders.values()) {
        await client.query(
          `
            insert into deposit_orders
              (id, user_id, amount, provider, status, checkout_url, provider_order_id, checkout_session, task_pass_plan_id, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
          `,
          [
            deposit.id,
            deposit.userId,
            deposit.amount,
            deposit.provider,
            deposit.status,
            deposit.checkoutUrl,
            deposit.providerOrderId ?? null,
            deposit.checkoutSession ? JSON.stringify(deposit.checkoutSession) : null,
            deposit.taskPassPlanId ?? null,
            deposit.createdAt,
            deposit.updatedAt,
          ],
        );
      }

      for (const event of this.depositProviderEvents) {
        await client.query(
          `
            insert into deposit_provider_events (id, deposit_order_id, provider, event_type, payload, created_at)
            values ($1, $2, $3, $4, $5::jsonb, $6)
          `,
          [event.id, event.depositOrderId, event.provider, event.eventType, JSON.stringify(event.payload), event.createdAt],
        );
      }

      for (const sellOrder of this.sellOrders.values()) {
        await client.query(
          `
            insert into sell_orders (id, user_id, deposit_order_id, total_amount, sold_amount, status, created_at)
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [sellOrder.id, sellOrder.userId, sellOrder.depositOrderId, sellOrder.totalAmount, sellOrder.soldAmount, sellOrder.status, sellOrder.createdAt],
        );
      }

      for (const chunk of this.sellOrderChunks.values()) {
        await client.query(
          `
            insert into sell_order_chunks (id, sell_order_id, user_id, bucket_id, amount, remaining_amount, listed_at)
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [chunk.id, chunk.sellOrderId, chunk.userId, chunk.bucketId, chunk.amount, chunk.remainingAmount, chunk.listedAt],
        );
      }

      for (const pool of this.demandPools.values()) {
        await client.query(
          `
            insert into demand_pools (id, bucket_id, label, requested_amount, remaining_amount, priority, active, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [pool.id, pool.bucketId, pool.label, pool.requestedAmount, pool.remainingAmount, pool.priority, pool.active, pool.createdAt],
        );
      }

      for (const match of this.tradeMatches) {
        await client.query(
          `
            insert into trade_matches (id, sell_order_chunk_id, demand_pool_id, user_id, amount, created_at)
            values ($1, $2, $3, $4, $5, $6)
          `,
          [match.id, match.sellOrderChunkId, match.demandPoolId, match.userId, match.amount, match.createdAt],
        );
      }

      for (const beneficiary of this.withdrawBeneficiaries.values()) {
        await client.query(
          `
            insert into withdraw_beneficiaries
              (id, user_id, type, label, account_name, upi_id, bank_account_number, ifsc_code, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            beneficiary.id,
            beneficiary.userId,
            beneficiary.type,
            beneficiary.label,
            beneficiary.accountName,
            beneficiary.upiId ?? null,
            beneficiary.bankAccountNumber ?? null,
            beneficiary.ifscCode ?? null,
            beneficiary.createdAt,
          ],
        );
      }

      for (const withdrawal of this.withdrawRequests.values()) {
        await client.query(
          `
            insert into withdraw_requests
              (id, user_id, beneficiary_id, amount, status, provider_reference, provider_status, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            withdrawal.id,
            withdrawal.userId,
            withdrawal.beneficiaryId,
            withdrawal.amount,
            withdrawal.status,
            withdrawal.providerReference ?? null,
            withdrawal.providerStatus ?? null,
            withdrawal.createdAt,
            withdrawal.updatedAt,
          ],
        );
      }

      for (const log of this.adminAuditLogs) {
        await client.query(
          `
            insert into admin_audit_logs (id, admin_user_id, action, entity_type, entity_id, payload, created_at)
            values ($1, $2, $3, $4, $5, $6::jsonb, $7)
          `,
          [log.id, log.adminUserId, log.action, log.entityType, log.entityId, JSON.stringify(log.payload), log.createdAt],
        );
      }

      for (const user of this.users.values()) {
        const summary = this.upsertReferralSummary(user.id);
        await client.query(
          `
            insert into referrals (user_id, referral_code, total_referred_users, rewarded_referrals, total_reward_amount, updated_at)
            values ($1, $2, $3, $4, $5, $6)
          `,
          [summary.code === user.referralCode ? user.id : user.id, summary.code, summary.totalReferredUsers, summary.rewardedReferrals, summary.totalRewardAmount, now()],
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSchema() {
    const schemaPath = path.resolve(process.cwd(), "apps", "api", "db", "schema.sql");
    const fallbackPath = path.resolve(process.cwd(), "db", "schema.sql");
    const sql = await fs.readFile(schemaPath).catch(async () => fs.readFile(fallbackPath));
    await this.pool.query(sql.toString("utf8"));
  }
}

export { createSevenDigitUserId, gameDefinitions, id, now };
