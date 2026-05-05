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
    expect(wallet.listedBalance).toBe(1000);
    expect(wallet.principalBalance).toBe(0);
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

    await expect(engine.createWithdrawal(user.id, beneficiary.id, 100)).rejects.toThrow();

    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);
    await engine.runMatchingCycle();

    const wallet = engine.getWalletSummary(user.id);
    const request = await engine.createWithdrawal(user.id, beneficiary.id, Math.min(100, wallet.withdrawableBalance));

    expect(request.status).toBe("queued_for_review");
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
});
