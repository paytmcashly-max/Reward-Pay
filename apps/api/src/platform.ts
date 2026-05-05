import type {
  AdminSession,
  ChunkBucket,
  DemandPool,
  DepositOrder,
  GameDefinition,
  PaymentProvider,
  ReferralSummary,
  RewardRule,
  SellOrder,
  SellOrderChunk,
  TradeMatch,
  User,
  WalletSummary,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { OtpRecord, OtpStore } from "./otp-store.js";
import { signToken } from "./security.js";
import { createOtpProvider, type OtpProvider } from "./sms.js";
import {
  CashfreePaymentProviderAdapter,
  CashfreePayoutProviderAdapter,
  MockPaymentProviderAdapter,
  MockPayoutProviderAdapter,
  type PaymentProviderAdapter,
  type PayoutProviderAdapter,
} from "./adapters.js";
import { createSevenDigitUserId, InMemoryStore, id, now } from "./store.js";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_RATE_TTL_SECONDS = 5 * 60;
const OTP_RATE_LIMIT = 5;

export class PlatformEngine {
  readonly paymentAdapters: Record<PaymentProvider, PaymentProviderAdapter>;
  readonly payoutAdapters: Record<PaymentProvider, PayoutProviderAdapter>;
  readonly otpProvider: OtpProvider;
  matchingPaused = false;

  constructor(
    readonly store: InMemoryStore,
    private readonly otpStore: OtpStore,
    private readonly config: AppConfig,
  ) {
    this.otpProvider = createOtpProvider(config);
    const cashfreeConfig = {
      clientId: config.CASHFREE_CLIENT_ID,
      clientSecret: config.CASHFREE_CLIENT_SECRET,
      baseUrl: config.CASHFREE_BASE_URL,
    };

    this.paymentAdapters = {
      cashfree:
        config.CASHFREE_CLIENT_ID &&
        config.CASHFREE_CLIENT_SECRET &&
        (config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION) &&
        !config.EXPLICIT_MOCK_PAYMENTS
          ? new CashfreePaymentProviderAdapter({
              ...cashfreeConfig,
              apiVersion: config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION,
            })
          : new MockPaymentProviderAdapter(),
      mock: new MockPaymentProviderAdapter(),
    };

    this.payoutAdapters = {
      cashfree:
        config.CASHFREE_CLIENT_ID &&
        config.CASHFREE_CLIENT_SECRET &&
        (config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION) &&
        !config.EXPLICIT_MOCK_PAYOUTS
          ? new CashfreePayoutProviderAdapter({
              ...cashfreeConfig,
              apiVersion: config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION,
            })
          : new MockPayoutProviderAdapter(
              !config.EXPLICIT_MOCK_PAYMENTS && config.EXPLICIT_MOCK_PAYOUTS
                ? {
                    status: "PROCESSING",
                    description: "Payout adapter is in mock mode; no live transfer has been sent.",
                  }
                : undefined,
            ),
      mock: new MockPayoutProviderAdapter(),
    };
  }

  async sendOtp(phone: string) {
    const rateCount = await this.otpStore.incrementRateLimit(phone, OTP_RATE_TTL_SECONDS);
    if (rateCount > OTP_RATE_LIMIT) {
      throw new AppError("otp_rate_limited", "Too many OTP requests. Try again in a few minutes.", 429);
    }

    const code = this.generateOtpCode();
    const session: OtpRecord = {
      sessionId: id("otp"),
      phone,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
      provider: this.otpProvider.channel,
    };
    const delivery = await this.otpProvider.sendOtp({ phone, code });
    session.providerSessionId = delivery.providerSessionId;
    await this.otpStore.set(phone, session, OTP_TTL_SECONDS);
    return {
      sessionId: session.sessionId,
      debugCode: this.config.NODE_ENV === "production" || this.otpProvider.channel !== "mock" ? undefined : code,
    };
  }

  async verifyOtp(phone: string, code: string, name?: string, referralCode?: string) {
    const session = await this.otpStore.get(phone);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      throw new AppError("invalid_otp", "Invalid or expired OTP", 401);
    }

    const valid = await this.otpProvider.verifyOtp({ phone, code, session });
    if (!valid) {
      throw new AppError("invalid_otp", "Invalid or expired OTP", 401);
    }

    const user = this.findOrCreateEndUser(phone, name, referralCode);

    await this.otpStore.delete(phone);
    await this.store.flush();
    return this.buildAuthSession(user);
  }

  async inviteLogin(phone: string, inviteCode: string, name?: string, referralCode?: string) {
    if (!this.config.ENABLE_INVITE_LOGIN || !this.config.INVITE_CODE) {
      throw new AppError("invite_login_disabled", "Invite login is not enabled", 400);
    }

    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    const expectedInviteCode = this.config.INVITE_CODE.trim().toUpperCase();
    if (normalizedInviteCode !== expectedInviteCode) {
      throw new AppError("invalid_invite_code", "Invalid invite code", 401);
    }

    const user = this.findOrCreateEndUser(phone, name, referralCode);
    await this.store.flush();
    return this.buildAuthSession(user);
  }

  loginAdmin(phone: string, password: string): AdminSession {
    const admin = this.store.findUserByPhone(phone);
    if (!admin || (admin.role !== "superadmin" && admin.role !== "operator")) {
      throw new AppError("admin_not_found", "Admin account not found", 404);
    }

    const passwordMatches =
      (admin.role === "superadmin" && phone === this.config.ADMIN_SUPER_PHONE && password === this.config.ADMIN_SUPER_PASSWORD) ||
      (admin.role === "operator" && phone === this.config.ADMIN_OPERATOR_PHONE && password === this.config.ADMIN_OPERATOR_PASSWORD);

    if (!passwordMatches) {
      throw new AppError("invalid_admin_credentials", "Invalid admin credentials", 401);
    }

    return {
      accessToken: this.issueAccessToken(admin, "admin"),
      user: admin,
    };
  }

  getCurrentUser(userId: string) {
    const user = this.mustUser(userId, "user");
    return {
      user,
      walletSummary: this.getWalletSummary(userId),
    };
  }

  getWalletSummary(userId: string): WalletSummary {
    return { ...this.store.getWallet(userId) };
  }

  getWalletTransactions(userId: string) {
    this.assertActiveUser(userId);
    return this.store.walletTransactions.filter((txn) => txn.userId === userId);
  }

  getReferralSummary(userId: string): ReferralSummary {
    this.assertActiveUser(userId);
    return this.store.upsertReferralSummary(userId);
  }

  listUserDeposits(userId: string) {
    this.assertActiveUser(userId);
    return this.listDeposits().filter((deposit) => deposit.userId === userId);
  }

  async createDeposit(userId: string, amount: number, provider: PaymentProvider): Promise<DepositOrder> {
    const user = this.mustUser(userId, "user");
    this.assertActiveUser(userId);
    if (this.config.NODE_ENV === "production" && provider === "mock") {
      throw new AppError("unsupported_provider", "Mock provider is disabled in production", 400);
    }
    if (amount < 100) {
      throw new AppError("min_deposit_amount", "Minimum deposit amount is 100", 400);
    }

    const depositId = id("dep");
    const adapter = this.paymentAdapters[provider];
    if (!adapter) {
      throw new AppError("unsupported_provider", "Unsupported deposit provider", 400);
    }

    const checkout = await adapter.createDepositOrder({
      depositId,
      amount,
      provider,
      customer: {
        customerId: user.id,
        customerPhone: user.phone,
        customerName: user.name,
      },
    });

    const deposit: DepositOrder = {
      id: depositId,
      userId,
      amount,
      provider,
      status: "payment_pending",
      checkoutUrl: checkout.checkoutUrl,
      providerOrderId: checkout.providerOrderId,
      checkoutSession: checkout,
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.depositOrders.set(deposit.id, deposit);
    this.store.addDepositProviderEvent(deposit.id, checkout.provider, "deposit.created", {
      checkout,
    });
    await this.store.flush();
    return deposit;
  }

  async confirmDeposit(depositId: string): Promise<DepositOrder> {
    const deposit = this.mustDeposit(depositId);
    if (deposit.status === "listed") {
      return deposit;
    }

    const provider = this.paymentAdapters[(deposit.provider as PaymentProvider) ?? "mock"];
    const verification = await provider.verifyPayment(deposit);
    if (!verification.successful) {
      throw new AppError("payment_verification_failed", "Payment verification failed", 400);
    }

    const wallet = this.store.getWallet(deposit.userId);
    deposit.status = "paid";
    deposit.updatedAt = now();
    deposit.status = "verified";
    wallet.principalBalance += deposit.amount;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(deposit.userId, "deposit_principal", deposit.amount, {
      depositId: deposit.id,
      provider: deposit.provider,
    });

    this.applyReward(deposit);
    deposit.status = "reward_credited";
    deposit.updatedAt = now();

    const sellOrder = this.createSellOrder(deposit, wallet.principalBalance);
    deposit.status = "chunked";
    deposit.updatedAt = now();

    this.listChunks(sellOrder);
    wallet.principalBalance -= deposit.amount;
    wallet.listedBalance += deposit.amount;
    wallet.updatedAt = now();

    deposit.status = "listed";
    deposit.updatedAt = now();
    await this.store.flush();
    return deposit;
  }

  async syncDepositStatus(depositId: string, userId?: string) {
    const deposit = this.mustDeposit(depositId);
    if (userId && deposit.userId !== userId) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }

    if (deposit.status === "listed") {
      return deposit;
    }

    const provider = this.paymentAdapters[(deposit.provider as PaymentProvider) ?? "mock"];
    const verification = await provider.verifyPayment(deposit);
    this.store.addDepositProviderEvent(deposit.id, provider.provider, "deposit.status_sync", {
      verified: verification.successful,
      terminal: verification.terminal,
      providerStatus: verification.providerStatus,
      description: verification.description,
      statusBefore: deposit.status,
    });

    if (verification.successful) {
      const confirmed = await this.confirmDeposit(deposit.id);
      await this.runMatchingCycle();
      return confirmed;
    }

    if (verification.terminal) {
      deposit.status = this.resolveFailedDepositStatus(verification.providerStatus);
      deposit.updatedAt = now();
      await this.store.flush();
      return deposit;
    }

    if (deposit.status !== "payment_pending") {
      deposit.status = "payment_pending";
      deposit.updatedAt = now();
    }

    if (!verification.successful) {
      await this.store.flush();
      return deposit;
    }
  }

  async cancelDeposit(depositId: string, userId: string) {
    const deposit = this.mustDeposit(depositId);
    if (deposit.userId !== userId) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }
    if (deposit.status === "listed" || deposit.status === "verified" || deposit.status === "reward_credited" || deposit.status === "chunked" || deposit.status === "paid") {
      throw new AppError("deposit_not_cancellable", "This payment is already processed and cannot be cancelled.", 400);
    }

    const statusBefore = deposit.status;
    deposit.status = "cancelled";
    deposit.updatedAt = now();
    this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.cancelled", {
      statusBefore,
    });
    await this.store.flush();
    return deposit;
  }

  async handlePaymentWebhook(provider: PaymentProvider, payload: Record<string, unknown>) {
    const adapter = this.paymentAdapters[provider];
    if (!adapter) {
      throw new AppError("unsupported_provider", "Unsupported webhook provider", 400);
    }

    const resolved = await adapter.resolveWebhook(payload);
    const deposit = Array.from(this.store.depositOrders.values()).find(
      (candidate) => candidate.providerOrderId === resolved.providerOrderId || candidate.id === resolved.providerOrderId,
    );

    if (!deposit) {
      throw new AppError("deposit_not_found", "Deposit not found for webhook payload", 404);
    }

    this.store.addDepositProviderEvent(deposit.id, provider, "deposit.webhook", payload);

    if (!resolved.successful) {
      await this.store.flush();
      return deposit;
    }

    return this.confirmDeposit(deposit.id);
  }

  async createBeneficiary(
    userId: string,
    input: Omit<WithdrawBeneficiary, "id" | "userId" | "createdAt">,
  ): Promise<WithdrawBeneficiary> {
    this.assertActiveUser(userId);
    const beneficiary: WithdrawBeneficiary = {
      id: id("beneficiary"),
      userId,
      createdAt: now(),
      ...input,
    };

    const payoutAdapter = this.resolvePayoutAdapter();
    if (!payoutAdapter.validateDestination(beneficiary)) {
      throw new AppError("invalid_beneficiary", "Invalid payout destination", 400);
    }

    this.store.withdrawBeneficiaries.set(beneficiary.id, beneficiary);
    await this.store.flush();
    return beneficiary;
  }

  listBeneficiaries(userId: string) {
    this.assertActiveUser(userId);
    return Array.from(this.store.withdrawBeneficiaries.values()).filter((item) => item.userId === userId);
  }

  async createWithdrawal(userId: string, beneficiaryId: string, amount: number): Promise<WithdrawRequest> {
    this.assertActiveUser(userId);
    const beneficiary = this.store.withdrawBeneficiaries.get(beneficiaryId);
    if (!beneficiary || beneficiary.userId !== userId) {
      throw new AppError("beneficiary_not_found", "Beneficiary not found", 404);
    }
    const wallet = this.store.getWallet(userId);
    if (wallet.withdrawableBalance < amount) {
      throw new AppError("insufficient_withdrawable_balance", "Insufficient withdrawable balance", 400);
    }

    wallet.withdrawableBalance -= amount;
    wallet.lockedBalance += amount;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(userId, "withdraw_request", -amount, { beneficiaryId });

    const request: WithdrawRequest = {
      id: id("withdraw"),
      userId,
      beneficiaryId,
      amount,
      status: "queued_for_review",
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.withdrawRequests.set(request.id, request);
    await this.store.flush();
    return request;
  }

  listWithdrawals(userId: string) {
    this.assertActiveUser(userId);
    return Array.from(this.store.withdrawRequests.values()).filter((item) => item.userId === userId);
  }

  listAllWithdrawals() {
    return Array.from(this.store.withdrawRequests.values());
  }

  async approveWithdrawal(withdrawalId: string, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustWithdrawal(withdrawalId);
    const wallet = this.store.getWallet(request.userId);
    const beneficiary = this.store.withdrawBeneficiaries.get(request.beneficiaryId);
    if (!beneficiary) {
      throw new AppError("beneficiary_not_found", "Withdrawal beneficiary not found", 404);
    }

    request.status = "approved";
    request.updatedAt = now();
    this.audit(adminUserId, "withdrawal.approve", "withdraw_request", request.id, { amount: request.amount });

    const payout = await this.resolvePayoutAdapter().createPayout({ withdrawal: request, beneficiary });
    request.providerReference = payout.providerReference;
    request.providerStatus = payout.status;

    if (payout.status === "SUCCESS") {
      request.status = "paid";
      wallet.soldBalance -= request.amount;
      wallet.lockedBalance -= request.amount;
    } else if (payout.status === "FAILED") {
      request.status = "reversed";
      wallet.withdrawableBalance += request.amount;
      wallet.lockedBalance -= request.amount;
      this.store.addWalletTransaction(request.userId, "withdraw_reversal", request.amount, {
        reason: payout.description,
      });
    } else {
      request.status = "provider_processing";
    }
    wallet.updatedAt = now();
    request.updatedAt = now();
    this.audit(adminUserId, `withdrawal.${request.status}`, "withdraw_request", request.id, {
      provider: payout.provider,
      providerReference: payout.providerReference,
      status: payout.status,
      description: payout.description,
    });
    await this.store.flush();
    return request;
  }

  async rejectWithdrawal(withdrawalId: string, adminUserId: string, reason: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustWithdrawal(withdrawalId);
    const wallet = this.store.getWallet(request.userId);
    request.status = "rejected";
    request.updatedAt = now();
    wallet.withdrawableBalance += request.amount;
    wallet.lockedBalance -= request.amount;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(request.userId, "withdraw_reversal", request.amount, { reason });
    this.audit(adminUserId, "withdrawal.reject", "withdraw_request", request.id, { reason });
    await this.store.flush();
    return request;
  }

  listUsers() {
    return Array.from(this.store.users.values()).filter((user) => user.role === "user");
  }

  async setUserBlocked(userId: string, blocked: boolean, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const user = this.store.users.get(userId);
    if (!user) {
      throw new AppError("user_not_found", "User not found", 404);
    }
    user.blocked = blocked;
    this.audit(adminUserId, blocked ? "user.block" : "user.unblock", "user", userId, { blocked });
    await this.store.flush();
    return user;
  }

  listDeposits() {
    return Array.from(this.store.depositOrders.values());
  }

  listRewardRules() {
    return Array.from(this.store.rewardRules.values());
  }

  async replaceRewardRules(rules: RewardRule[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.store.rewardRules.clear();
    for (const rule of rules) {
      this.store.rewardRules.set(rule.id, rule);
    }
    this.audit(adminUserId, "reward_rules.replace", "reward_rule", "bulk", { count: rules.length });
    await this.store.flush();
    return this.listRewardRules();
  }

  listChunkBuckets(): ChunkBucket[] {
    return this.store.getChunkBuckets();
  }

  async replaceChunkBuckets(buckets: ChunkBucket[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.store.rewardChunkBuckets.clear();
    for (const bucket of buckets) {
      this.store.rewardChunkBuckets.set(bucket.id, bucket);
    }
    this.audit(adminUserId, "chunk_buckets.replace", "chunk_bucket", "bulk", { count: buckets.length });
    await this.store.flush();
    return this.listChunkBuckets();
  }

  listDemandPools(): DemandPool[] {
    return Array.from(this.store.demandPools.values());
  }

  async replaceDemandPools(pools: DemandPool[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.store.demandPools.clear();
    for (const pool of pools) {
      this.store.demandPools.set(pool.id, pool);
    }
    this.audit(adminUserId, "demand_pools.replace", "demand_pool", "bulk", { count: pools.length });
    await this.store.flush();
    return this.listDemandPools();
  }

  getGames(): GameDefinition[] {
    return this.store.games;
  }

  async playGame(userId: string, gameId: GameDefinition["id"]) {
    this.assertActiveUser(userId);
    const game = this.store.games.find((entry) => entry.id === gameId);
    if (!game) {
      throw new AppError("game_not_found", "Game not found", 404);
    }
    const wallet = this.store.getWallet(userId);
    if (wallet.rewardBalance + wallet.principalBalance < game.entryFee) {
      throw new AppError("insufficient_playable_balance", "Insufficient playable balance", 400);
    }

    if (wallet.rewardBalance >= game.entryFee) {
      wallet.rewardBalance -= game.entryFee;
    } else {
      const remainingEntry = game.entryFee - wallet.rewardBalance;
      wallet.rewardBalance = 0;
      wallet.principalBalance = Math.max(0, wallet.principalBalance - remainingEntry);
    }
    this.store.addWalletTransaction(userId, "game_entry", -game.entryFee, { gameId });

    const reward = Math.floor(Math.random() * (game.maxReward - game.minReward + 1)) + game.minReward;
    wallet.rewardBalance += reward;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(userId, "game_payout", reward, { gameId });
    await this.store.flush();

    return {
      game,
      reward,
      wallet: this.getWalletSummary(userId),
    };
  }

  async runMatchingCycle() {
    if (this.matchingPaused) {
      return;
    }

    for (const pool of this.listDemandPools()) {
      if (pool.active && pool.remainingAmount <= 0) {
        pool.remainingAmount = pool.requestedAmount;
      }
    }

    let mutated = false;
    const demandPools = this.listDemandPools()
      .filter((pool) => pool.active && pool.remainingAmount > 0)
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

    for (const pool of demandPools) {
      const chunks = Array.from(this.store.sellOrderChunks.values())
        .filter((chunk) => chunk.bucketId === pool.bucketId && chunk.remainingAmount > 0)
        .sort((a, b) => a.listedAt.localeCompare(b.listedAt));

      for (const chunk of chunks) {
        if (pool.remainingAmount <= 0) {
          break;
        }
        const fill = Math.min(pool.remainingAmount, chunk.remainingAmount);
        if (fill <= 0) {
          continue;
        }
        chunk.remainingAmount -= fill;
        pool.remainingAmount -= fill;
        mutated = true;

        const wallet = this.store.getWallet(chunk.userId);
        wallet.listedBalance -= fill;
        wallet.soldBalance += fill;
        wallet.withdrawableBalance += fill;
        wallet.updatedAt = now();

        const sellOrder = this.store.sellOrders.get(chunk.sellOrderId);
        if (sellOrder) {
          sellOrder.soldAmount += fill;
          sellOrder.status = sellOrder.soldAmount >= sellOrder.totalAmount ? "sold" : "partially_sold";
        }

        const match: TradeMatch = {
          id: id("match"),
          sellOrderChunkId: chunk.id,
          demandPoolId: pool.id,
          userId: chunk.userId,
          amount: fill,
          createdAt: now(),
        };
        this.store.tradeMatches.unshift(match);
        this.store.addWalletTransaction(chunk.userId, "chunk_match", fill, {
          demandPoolId: pool.id,
          chunkId: chunk.id,
        });
      }
    }

    if (mutated) {
      await this.store.flush();
    }
  }

  getPlatformSnapshot() {
    return {
      deposits: this.listDeposits(),
      demandPools: this.listDemandPools(),
      rewardRules: this.listRewardRules(),
      chunkBuckets: this.listChunkBuckets(),
      withdrawals: this.listAllWithdrawals(),
      matchingPaused: this.matchingPaused,
    };
  }

  async setMatchingPaused(paused: boolean, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.matchingPaused = paused;
    this.audit(adminUserId, paused ? "matching.pause" : "matching.resume", "matching_engine", "default", { paused });
    await this.store.flush();
    return this.matchingPaused;
  }

  listAuditLogs() {
    return this.store.adminAuditLogs;
  }

  getProviderStatus() {
    const paymentsLive =
      Boolean(
        this.config.CASHFREE_CLIENT_ID &&
          this.config.CASHFREE_CLIENT_SECRET &&
          (this.config.CASHFREE_PAYMENT_API_VERSION || this.config.CASHFREE_API_VERSION),
      ) &&
      !this.config.EXPLICIT_MOCK_PAYMENTS;

    const payoutsLive =
      Boolean(
        this.config.CASHFREE_CLIENT_ID &&
          this.config.CASHFREE_CLIENT_SECRET &&
          (this.config.CASHFREE_PAYOUT_API_VERSION || this.config.CASHFREE_API_VERSION),
      ) &&
      !this.config.EXPLICIT_MOCK_PAYOUTS;

    return {
      cashfree: {
        paymentsLive,
        payoutsLive,
        baseUrl: this.config.CASHFREE_BASE_URL,
        paymentApiVersion: this.config.CASHFREE_PAYMENT_API_VERSION || this.config.CASHFREE_API_VERSION || null,
        payoutApiVersion: this.config.CASHFREE_PAYOUT_API_VERSION || this.config.CASHFREE_API_VERSION || null,
      },
      fallbackMode: !paymentsLive || !payoutsLive,
      storageMode: this.config.DATABASE_URL ? "postgres" : this.config.STATE_FILE_PATH ? "file" : "memory",
      otpMode: this.config.REDIS_URL ? "redis" : this.config.OTP_STATE_FILE_PATH ? "file" : "memory",
      memoryInfrastructure: this.config.ALLOW_MEMORY_INFRASTRUCTURE,
      databaseConfigured: Boolean(this.config.DATABASE_URL),
      redisConfigured: Boolean(this.config.REDIS_URL),
      otpProvider: this.otpProvider.channel,
      authMode: this.config.ENABLE_INVITE_LOGIN ? "invite" : "otp",
    };
  }

  async consumeRateLimit(scope: string, key: string, ttlSeconds: number, limit: number) {
    const count = await this.otpStore.incrementScopedRateLimit(scope, key, ttlSeconds);
    if (count > limit) {
      throw new AppError("rate_limited", "Too many requests. Please try again shortly.", 429, {
        scope,
        retryAfterSeconds: ttlSeconds,
      });
    }
  }

  private buildAuthSession(user: User) {
    return {
      accessToken: this.issueAccessToken(user, "user"),
      user,
      walletSummary: this.getWalletSummary(user.id),
    };
  }

  private issueAccessToken(user: User, kind: "user" | "admin") {
    return signToken(
      {
        sub: user.id,
        role: user.role,
        phone: user.phone,
        kind,
      },
      {
        secret: this.config.JWT_SECRET,
        ttlSeconds: this.config.JWT_TTL_SECONDS,
      },
    );
  }

  private resolvePayoutAdapter(): PayoutProviderAdapter {
    return this.payoutAdapters.cashfree ?? this.payoutAdapters.mock;
  }

  private generateOtpCode() {
    if (this.config.NODE_ENV === "test") {
      return "123456";
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private findOrCreateEndUser(phone: string, name?: string, referralCode?: string) {
    let user = this.store.findUserByPhone(phone);
    if (user && user.role !== "user") {
      throw new AppError("invalid_user_role", "This phone is reserved for admin access", 403);
    }

    if (!user) {
      const referrer = referralCode ? this.store.findUserByReferralCode(referralCode) : undefined;
      user = {
        id: createSevenDigitUserId(new Set(this.store.users.keys())),
        phone,
        name: name || `User ${phone.slice(-4)}`,
        referralCode: `REF${phone.slice(-6)}`,
        referredByUserId: referrer?.id,
        role: "user",
        blocked: false,
        createdAt: now(),
      };
      this.store.users.set(user.id, user);
      this.store.createWallet(user.id);
      if (referrer) {
        const referrerWallet = this.store.getWallet(referrer.id);
        referrerWallet.rewardBalance += 25;
        referrerWallet.updatedAt = now();
        this.store.addWalletTransaction(referrer.id, "reward_credit", 25, {
          reason: "referral",
          referredUserId: user.id,
        });
      }
    }

    return user;
  }

  private applyReward(deposit: DepositOrder): number {
    const rule = this.listRewardRules().find(
      (item) => item.active && deposit.amount >= item.minDepositAmount && deposit.amount <= item.maxDepositAmount,
    );
    if (!rule) {
      return 0;
    }
    const reward = Math.floor((deposit.amount * rule.rewardPercent) / 100);
    const wallet = this.store.getWallet(deposit.userId);
    wallet.rewardBalance += reward;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(deposit.userId, "reward_credit", reward, {
      depositId: deposit.id,
      rewardRuleId: rule.id,
    });
    return reward;
  }

  private createSellOrder(deposit: DepositOrder, availablePrincipal: number): SellOrder {
    if (availablePrincipal < deposit.amount) {
      throw new AppError("principal_too_low", "Principal balance is lower than deposit amount", 400);
    }
    const sellOrder: SellOrder = {
      id: id("sell"),
      userId: deposit.userId,
      depositOrderId: deposit.id,
      totalAmount: deposit.amount,
      soldAmount: 0,
      status: "open",
      createdAt: now(),
    };
    this.store.sellOrders.set(sellOrder.id, sellOrder);

    const chunks = this.generateChunks(deposit.amount);
    for (const chunkSpec of chunks) {
      const chunk: SellOrderChunk = {
        id: id("chunk"),
        sellOrderId: sellOrder.id,
        userId: deposit.userId,
        bucketId: chunkSpec.bucketId,
        amount: chunkSpec.amount,
        remainingAmount: chunkSpec.amount,
        listedAt: now(),
      };
      this.store.sellOrderChunks.set(chunk.id, chunk);
    }

    return sellOrder;
  }

  private listChunks(sellOrder: SellOrder) {
    const chunks = Array.from(this.store.sellOrderChunks.values()).filter((chunk) => chunk.sellOrderId === sellOrder.id);
    const totalListed = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
    this.store.addWalletTransaction(sellOrder.userId, "chunk_listed", -totalListed, {
      sellOrderId: sellOrder.id,
      chunkCount: chunks.length,
    });
  }

  private generateChunks(amount: number): Array<{ bucketId: string; amount: number }> {
    const demandPriority = new Map(
      this.listDemandPools()
        .filter((pool) => pool.active)
        .map((pool) => [pool.bucketId, pool.remainingAmount > 0 ? pool.remainingAmount : pool.requestedAmount]),
    );
    const buckets = this.listChunkBuckets()
      .filter((bucket) => bucket.active)
      .sort((a, b) => {
        const demandDiff = (demandPriority.get(b.id) ?? 0) - (demandPriority.get(a.id) ?? 0);
        if (demandDiff !== 0) {
          return demandDiff;
        }
        return b.targetAmount - a.targetAmount;
      });

    const result: Array<{ bucketId: string; amount: number }> = [];
    let remaining = amount;
    let cycleBucketIds = new Set<string>();
    const smallestMin = Math.min(...buckets.map((bucket) => bucket.minAmount));

    while (remaining > 0) {
      let eligible = buckets.filter((candidate) => candidate.minAmount <= remaining && !cycleBucketIds.has(candidate.id));
      if (!eligible.length) {
        cycleBucketIds = new Set<string>();
        eligible = buckets.filter((candidate) => candidate.minAmount <= remaining);
      }

      const bucket = eligible[0];
      if (!bucket) {
        const last = result[result.length - 1];
        if (!last) {
          throw new AppError("chunk_generation_failed", "Unable to chunk deposit amount", 500);
        }
        last.amount += remaining;
        remaining = 0;
        break;
      }

      let nextAmount = Math.min(bucket.targetAmount, bucket.maxAmount, remaining);
      const tail = remaining - nextAmount;
      if (tail > 0 && tail < smallestMin) {
        nextAmount = remaining;
      }
      if (nextAmount < bucket.minAmount && result.length > 0) {
        result[result.length - 1].amount += remaining;
        remaining = 0;
        break;
      }

      result.push({ bucketId: bucket.id, amount: nextAmount });
      remaining -= nextAmount;
      cycleBucketIds.add(bucket.id);
    }

    return result;
  }

  private resolveFailedDepositStatus(providerStatus?: string): DepositOrder["status"] {
    const normalized = String(providerStatus ?? "").toUpperCase();
    if (normalized.includes("CANCEL") || normalized.includes("DROP")) {
      return "cancelled";
    }
    return "failed";
  }

  private audit(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    this.store.adminAuditLogs.unshift({
      id: id("audit"),
      adminUserId,
      action,
      entityType,
      entityId,
      payload,
      createdAt: now(),
    });
  }

  private mustDeposit(depositId: string) {
    const deposit = this.store.depositOrders.get(depositId);
    if (!deposit) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }
    return deposit;
  }

  private mustWithdrawal(withdrawalId: string) {
    const withdrawal = this.store.withdrawRequests.get(withdrawalId);
    if (!withdrawal) {
      throw new AppError("withdrawal_not_found", "Withdrawal not found", 404);
    }
    return withdrawal;
  }

  private mustUser(userId: string, role: "user" | "admin") {
    const user = this.store.users.get(userId);
    if (!user) {
      throw new AppError("user_not_found", "User not found", 404);
    }
    if (role === "user" && user.role !== "user") {
      throw new AppError("invalid_role", "Expected user account", 403);
    }
    if (role === "admin" && user.role !== "superadmin" && user.role !== "operator") {
      throw new AppError("invalid_role", "Expected admin account", 403);
    }
    return user;
  }

  private assertActiveUser(userId: string) {
    const user = this.mustUser(userId, "user");
    if (user.blocked) {
      throw new AppError("user_blocked", "User is blocked", 403);
    }
  }
}
