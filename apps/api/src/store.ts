import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdminAuditLog,
  BeneficiaryType,
  ChunkBucket,
  DemandPool,
  DepositOrder,
  DepositProviderEvent,
  DepositStatus,
  GameDefinition,
  PaymentProvider,
  ReferralSummary,
  RewardRule,
  SellOrder,
  SellOrderChunk,
  TradeMatch,
  User,
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

    return {
      code: user.referralCode,
      totalReferredUsers: referredUsers.length,
      rewardedReferrals: referredUsers.filter((candidate) => candidate.createdAt).length,
      totalRewardAmount,
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
}

type SerializedStoreState = {
  users: User[];
  wallets: WalletAccount[];
  walletTransactions: WalletTransaction[];
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
          "select id, user_id, amount, provider, status, checkout_url, provider_order_id, checkout_session, created_at, updated_at from deposit_orders order by created_at desc",
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
      await client.query("delete from withdraw_requests");
      await client.query("delete from withdraw_beneficiaries");
      await client.query("delete from sell_order_chunks");
      await client.query("delete from sell_orders");
      await client.query("delete from demand_pools");
      await client.query("delete from chunk_buckets");
      await client.query("delete from reward_credits");
      await client.query("delete from deposit_provider_events");
      await client.query("delete from deposit_orders");
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
              (id, user_id, amount, provider, status, checkout_url, provider_order_id, checkout_session, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
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
