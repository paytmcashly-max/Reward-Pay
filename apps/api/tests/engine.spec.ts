import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";
import { MemoryOtpStore } from "../src/otp-store.js";
import { PlatformEngine } from "../src/platform.js";
import { InMemoryStore } from "../src/store.js";

const createEngine = () =>
  new PlatformEngine(
    new InMemoryStore(),
    new MemoryOtpStore(),
    readConfig({
      NODE_ENV: "test",
      JWT_SECRET: "reward-wallet-test-secret",
      ALLOW_MEMORY_INFRASTRUCTURE: "true",
      ALLOW_DEV_HEADERS: "true",
      EXPLICIT_MOCK_PAYMENTS: "true",
    }),
  );

const createInviteEngine = () =>
  new PlatformEngine(
    new InMemoryStore(),
    new MemoryOtpStore(),
    readConfig({
      NODE_ENV: "test",
      JWT_SECRET: "reward-wallet-test-secret",
      ALLOW_MEMORY_INFRASTRUCTURE: "true",
      ALLOW_DEV_HEADERS: "true",
      EXPLICIT_MOCK_PAYMENTS: "true",
      ENABLE_INVITE_LOGIN: "true",
      INVITE_CODE: "BETA2026",
    }),
  );

const createLivePaymentsMockPayoutsEngine = () =>
  new PlatformEngine(
    new InMemoryStore(),
    new MemoryOtpStore(),
    readConfig({
      NODE_ENV: "test",
      JWT_SECRET: "reward-wallet-test-secret",
      ALLOW_MEMORY_INFRASTRUCTURE: "true",
      ALLOW_DEV_HEADERS: "true",
      EXPLICIT_MOCK_PAYMENTS: "false",
      EXPLICIT_MOCK_PAYOUTS: "true",
      CASHFREE_CLIENT_ID: "test_client",
      CASHFREE_CLIENT_SECRET: "test_secret",
      CASHFREE_PAYMENT_API_VERSION: "2025-01-01",
      CASHFREE_PAYOUT_API_VERSION: "2024-01-01",
    }),
  );

const bootstrapUser = async (engine: PlatformEngine) => {
  await engine.sendOtp("9000000001");
  return (await engine.verifyOtp("9000000001", "123456", "Test User")).user;
};

describe("deposit, reward, and chunk flow", () => {
  it("verifies deposit, applies slab reward, and creates listed chunks", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    const verified = await engine.confirmDeposit(deposit.id);
    const wallet = engine.getWalletSummary(user.id);

    expect(verified.status).toBe("listed");
    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(1000);
    expect(wallet.principalBalance).toBe(0);
  });

  it("does not double-credit on duplicate confirmation attempts", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    await engine.confirmDeposit(deposit.id);
    await engine.confirmDeposit(deposit.id);

    const wallet = engine.getWalletSummary(user.id);
    const transactions = engine.getWalletTransactions(user.id);
    const sellOrder = engine.store.findSellOrderByDeposit(deposit.id);

    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(1000);
    expect(transactions.filter((txn) => txn.type === "deposit_principal" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "reward_credit" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "chunk_listed" && txn.metadata.sellOrderId === sellOrder?.id)).toHaveLength(1);
  });

  it("does not double-credit on duplicate sync attempts", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    await engine.syncDepositStatus(deposit.id, user.id);
    await engine.syncDepositStatus(deposit.id, user.id);

    const wallet = engine.getWalletSummary(user.id);
    const transactions = engine.getWalletTransactions(user.id);
    const sellOrder = engine.store.findSellOrderByDeposit(deposit.id);

    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(1000);
    expect(transactions.filter((txn) => txn.type === "deposit_principal" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "reward_credit" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "chunk_listed" && txn.metadata.sellOrderId === sellOrder?.id)).toHaveLength(1);
  });
});

describe("matching engine", () => {
  it("matches chunks into sold balance", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);

    await engine.runMatchingCycle();

    const wallet = engine.getWalletSummary(user.id);
    expect(wallet.soldBalance).toBeGreaterThan(0);
    expect(wallet.withdrawableBalance).toBe(wallet.soldBalance);
  });
});

describe("withdrawal eligibility", () => {
  it("only allows withdrawal from sold balance", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const beneficiary = await engine.createBeneficiary(user.id, {
      type: "upi",
      label: "Main UPI",
      accountName: "Test User",
      upiId: "user@upi",
    });

    await expect(engine.createWithdrawal(user.id, beneficiary.id, 100)).rejects.toMatchObject({
      code: "insufficient_balance",
    });

    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);
    await engine.runMatchingCycle();

    const wallet = engine.getWalletSummary(user.id);
    const request = await engine.createWithdrawal(user.id, beneficiary.id, Math.min(100, wallet.withdrawableBalance));

    expect(request.status).toBe("queued_for_review");
  });

  it("blocks blocked users and enforces pending limits", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const beneficiary = await engine.createBeneficiary(user.id, {
      type: "upi",
      label: "Main UPI",
      accountName: "Test User",
      upiId: "user@upi",
    });
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);
    await engine.runMatchingCycle();

    await engine.createWithdrawal(user.id, beneficiary.id, 100);
    await engine.createWithdrawal(user.id, beneficiary.id, 100);
    await engine.createWithdrawal(user.id, beneficiary.id, 100);
    await expect(engine.createWithdrawal(user.id, beneficiary.id, 100)).rejects.toMatchObject({
      code: "pending_withdrawal_limit",
    });

    await engine.setUserBlocked(user.id, true, "admin_super");
    await expect(engine.createWithdrawal(user.id, beneficiary.id, 100)).rejects.toMatchObject({
      code: "user_blocked",
    });
  });
});

describe("matching controls", () => {
  it("does not match when paused", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);

    await engine.setMatchingPaused(true, "admin_super");
    await engine.runMatchingCycle();

    const wallet = engine.getWalletSummary(user.id);
    expect(wallet.soldBalance).toBe(0);
  });
});

describe("payout adapter safety", () => {
  it("does not mark a withdrawal paid when payouts remain in mock mode", async () => {
    const engine = createLivePaymentsMockPayoutsEngine();
    const user = await bootstrapUser(engine);
    const beneficiary = await engine.createBeneficiary(user.id, {
      type: "upi",
      label: "Main UPI",
      accountName: "Test User",
      upiId: "user@upi",
    });

    const deposit = await engine.createDeposit(user.id, 1000, "mock");
    await engine.confirmDeposit(deposit.id);
    await engine.runMatchingCycle();

    const walletBefore = engine.getWalletSummary(user.id);
    const request = await engine.createWithdrawal(user.id, beneficiary.id, Math.min(100, walletBefore.withdrawableBalance));
    const approved = await engine.approveWithdrawal(request.id, "admin_super");
    const walletAfter = engine.getWalletSummary(user.id);

    expect(approved.status).toBe("provider_processing");
    expect(walletAfter.lockedBalance).toBeGreaterThan(0);
    expect(walletAfter.withdrawableBalance).toBeLessThan(walletBefore.withdrawableBalance);
  });
});

describe("production config safety", () => {
  it("rejects unsafe production defaults", () => {
    expect(() =>
      readConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://prod:prod@localhost:5432/reward_wallet",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/Invalid production configuration/);
  });

  it("allows production config when invite login is enabled", () => {
    expect(() =>
      readConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://prod:prod@localhost:5432/reward_wallet",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "reward-wallet-production-secret-123",
        ALLOW_DEV_HEADERS: "false",
        ALLOW_MEMORY_INFRASTRUCTURE: "false",
        ADMIN_SUPER_PASSWORD: "super-strong-password",
        ADMIN_OPERATOR_PASSWORD: "operator-strong-password",
        EXPLICIT_MOCK_PAYMENTS: "false",
        CASHFREE_CLIENT_ID: "test_client",
        CASHFREE_CLIENT_SECRET: "test_secret",
        ENABLE_INVITE_LOGIN: "true",
        INVITE_CODE: "BETA2026",
      }),
    ).not.toThrow();
  });
});

describe("wallet overview and admin risk", () => {
  it("returns a wallet timeline and explainer set", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.syncDepositStatus(deposit.id, user.id);
    const beneficiary = await engine.createBeneficiary(user.id, {
      type: "upi",
      label: "Main UPI",
      accountName: "Test User",
      upiId: "user@upi",
    });
    await engine.createWithdrawal(user.id, beneficiary.id, 100);

    const overview = engine.getWalletOverview(user.id);

    expect(overview.explainers.length).toBeGreaterThanOrEqual(6);
    expect(overview.timeline.some((step) => step.type === "deposit_paid")).toBe(true);
    expect(overview.timeline.some((step) => step.type === "reward_credited")).toBe(true);
    expect(overview.timeline.some((step) => step.type === "amount_listed")).toBe(true);
    expect(overview.timeline.some((step) => step.type === "withdrawal_requested")).toBe(true);
  });

  it("computes admin risk indicators from existing money activity", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const beneficiary = await engine.createBeneficiary(user.id, {
      type: "upi",
      label: "Main UPI",
      accountName: "Test User",
      upiId: "user@upi",
    });
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.syncDepositStatus(deposit.id, user.id);
    await engine.createWithdrawal(user.id, beneficiary.id, 100);
    await engine.setUserBlocked(user.id, true, "admin_super");

    const risk = engine.getAdminRiskReport();

    expect(risk.users[user.id].level).not.toBe("low");
    expect(risk.users[user.id].reasons.length).toBeGreaterThan(0);
    expect(risk.deposits[deposit.id]).toBeTruthy();
    expect(risk.withdrawals).toBeTruthy();
  });
});

describe("reward rule validation", () => {
  it("rejects overlapping active slabs", async () => {
    const engine = createEngine();
    await expect(
      engine.replaceRewardRules(
        [
          { id: "a", minDepositAmount: 100, maxDepositAmount: 500, rewardPercent: 5, active: true, createdAt: new Date().toISOString() },
          { id: "b", minDepositAmount: 400, maxDepositAmount: 800, rewardPercent: 6, active: true, createdAt: new Date().toISOString() },
        ],
        "admin_super",
      ),
    ).rejects.toMatchObject({ code: "overlapping_reward_rules" });
  });

  it("rejects invalid percentages and negative values", async () => {
    const engine = createEngine();
    await expect(
      engine.replaceRewardRules(
        [
          { id: "a", minDepositAmount: -100, maxDepositAmount: 500, rewardPercent: 5, active: true, createdAt: new Date().toISOString() },
        ],
        "admin_super",
      ),
    ).rejects.toMatchObject({ code: "invalid_reward_rule" });

    await expect(
      engine.replaceRewardRules(
        [
          { id: "a", minDepositAmount: 100, maxDepositAmount: 500, rewardPercent: 150, active: true, createdAt: new Date().toISOString() },
        ],
        "admin_super",
      ),
    ).rejects.toMatchObject({ code: "invalid_reward_rule" });
  });
});

describe("invite login", () => {
  it("creates a user session with a valid invite code", async () => {
    const engine = createInviteEngine();
    const session = await engine.inviteLogin("9000000099", "beta2026", "Invite User");

    expect(session.user.phone).toBe("9000000099");
    expect(session.user.id).toMatch(/^\d{7}$/);
    expect(session.walletSummary.userId).toBe(session.user.id);
  });
});
