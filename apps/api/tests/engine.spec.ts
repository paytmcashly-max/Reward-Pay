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

const createTaskPassEngine = () =>
  new PlatformEngine(
    new InMemoryStore(),
    new MemoryOtpStore(),
    readConfig({
      NODE_ENV: "test",
      JWT_SECRET: "reward-wallet-test-secret",
      ALLOW_MEMORY_INFRASTRUCTURE: "true",
      ALLOW_DEV_HEADERS: "true",
      EXPLICIT_MOCK_PAYMENTS: "true",
      TASK_PASS_ENABLED: "true",
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

describe("deposit and reward flow", () => {
  it("verifies deposit, applies slab reward, and keeps listing dormant", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    const verified = await engine.confirmDeposit(deposit.id);
    const wallet = engine.getWalletSummary(user.id);

    expect(verified.status).toBe("reward_credited");
    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.principalBalance).toBe(1000);
    expect(wallet.withdrawableBalance).toBe(1070);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(0);
    expect(engine.store.findSellOrderByDeposit(deposit.id)).toBeUndefined();
  });

  it("does not double-credit on duplicate confirmation attempts", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    await engine.confirmDeposit(deposit.id);
    await engine.confirmDeposit(deposit.id);

    const wallet = engine.getWalletSummary(user.id);
    const transactions = engine.getWalletTransactions(user.id);

    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.principalBalance).toBe(1000);
    expect(wallet.withdrawableBalance).toBe(1070);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(0);
    expect(transactions.filter((txn) => txn.type === "deposit_principal" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "reward_credit" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "chunk_listed")).toHaveLength(0);
  });

  it("does not double-credit on duplicate sync attempts", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");

    await engine.syncDepositStatus(deposit.id, user.id);
    await engine.syncDepositStatus(deposit.id, user.id);

    const wallet = engine.getWalletSummary(user.id);
    const transactions = engine.getWalletTransactions(user.id);

    expect(wallet.rewardBalance).toBe(70);
    expect(wallet.principalBalance).toBe(1000);
    expect(wallet.withdrawableBalance).toBe(1070);
    expect(wallet.listedBalance + wallet.soldBalance).toBe(0);
    expect(transactions.filter((txn) => txn.type === "deposit_principal" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "reward_credit" && txn.metadata.depositId === deposit.id)).toHaveLength(1);
    expect(transactions.filter((txn) => txn.type === "chunk_listed")).toHaveLength(0);
  });
});

describe("matching engine", () => {
  it("does not create matches when deposits no longer enter listing flow", async () => {
    const engine = createEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "cashfree");
    await engine.confirmDeposit(deposit.id);

    await engine.runMatchingCycle();

    const wallet = engine.getWalletSummary(user.id);
    expect(wallet.soldBalance).toBe(0);
    expect(wallet.listedBalance).toBe(0);
    expect(wallet.withdrawableBalance).toBe(1070);
    expect(engine.store.tradeMatches).toHaveLength(0);
  });
});

describe("withdrawal eligibility", () => {
  it("only allows withdrawal from available balance", async () => {
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
    expect(overview.timeline.some((step) => step.type === "amount_listed")).toBe(false);
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

describe("task pass daily token flow", () => {
  it("returns no tasks without an active task pass", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);

    expect(engine.getDailyTasks(user.id)).toEqual([]);
    expect(engine.getDailyOverview(user.id).activeTaskPass).toBeNull();
  });

  it("allows admin activation, assignment, check-in, and single claim credit", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);
    const request = await engine.requestTaskPassActivation(user.id, "pass_starter");
    await engine.activateTaskPass(request.id, "admin_super");

    const assignments = await engine.assignDailyTasksForUser(user.id, "admin_super");
    expect(assignments.length).toBe(2);

    const overviewBefore = engine.getDailyOverview(user.id);
    expect(overviewBefore.activePlan?.name).toBe("Starter Pass");
    expect(overviewBefore.assignedCount).toBe(2);

    const checkIn = await engine.claimDailyCheckIn(user.id);
    expect(checkIn.rewardTokens).toBe(10);
    try {
      await engine.claimDailyCheckIn(user.id);
      throw new Error("Expected duplicate daily check-in to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "daily_checkin_already_claimed" });
    }

    const autoTask = engine.getDailyTasks(user.id).find((item) => !item.task.requiresApproval);
    expect(autoTask).toBeTruthy();
    await engine.startDailyTask(user.id, autoTask!.assignment.id);
    await engine.submitDailyTask(user.id, autoTask!.assignment.id);
    const claimed = await engine.claimDailyTask(user.id, autoTask!.assignment.id);
    expect(claimed.status).toBe("claimed");

    const claimAgain = await engine.claimDailyTask(user.id, autoTask!.assignment.id);
    expect(claimAgain.status).toBe("claimed");

    const tokenBalance = engine.getTokenBalance(user.id);
    const tokenLedger = engine.getTokenLedger(user.id);
    expect(tokenBalance.balance).toBe(10 + autoTask!.assignment.rewardTokens);
    expect(tokenLedger.filter((entry) => entry.reason === "daily_checkin")).toHaveLength(1);
    expect(tokenLedger.filter((entry) => entry.reason === "daily_task" && entry.referenceId === autoTask!.assignment.id)).toHaveLength(1);
  });

  it("blocks claim before approval for approval-required tasks", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);
    const request = await engine.requestTaskPassActivation(user.id, "pass_starter");
    await engine.activateTaskPass(request.id, "admin_super");
    await engine.assignDailyTasksForUser(user.id, "admin_super");

    const approvalTask = engine.getDailyTasks(user.id).find((item) => item.task.requiresApproval);
    expect(approvalTask).toBeTruthy();

    await engine.startDailyTask(user.id, approvalTask!.assignment.id);
    await engine.submitDailyTask(user.id, approvalTask!.assignment.id, "proof");
    await expect(engine.claimDailyTask(user.id, approvalTask!.assignment.id)).rejects.toMatchObject({
      code: "task_not_claimable",
    });
  });

  it("enforces daily token cap and skips assign-all for users without active pass", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);
    await engine.sendOtp("9000000007");
    const secondUser = (await engine.verifyOtp("9000000007", "123456", "Second User")).user;

    const request = await engine.requestTaskPassActivation(user.id, "pass_starter");
    await engine.activateTaskPass(request.id, "admin_super");
    const plans = engine.listTaskPassPlans();
    await engine.updateTaskPassPlan(
      "pass_starter",
      {
        ...plans.find((plan) => plan.id === "pass_starter")!,
        dailyTokenCap: 25,
      },
      "admin_super",
    );

    const allAssignments = await engine.assignDailyTasksForAll("admin_super");
    expect(allAssignments.every((assignment) => assignment.userId === user.id)).toBe(true);

    await engine.claimDailyCheckIn(user.id);
    const task = engine.getDailyTasks(user.id).find((item) => !item.task.requiresApproval)!;
    await engine.submitDailyTask(user.id, task.assignment.id);
    await expect(engine.claimDailyTask(user.id, task.assignment.id)).rejects.toMatchObject({
      code: "daily_token_cap_reached",
    });

    await engine.setUserBlocked(user.id, true, "admin_super");
    try {
      await engine.claimDailyCheckIn(user.id);
      throw new Error("Expected blocked user check-in to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "user_blocked" });
    }
    expect(engine.getDailyTasks(secondUser.id)).toEqual([]);
  });

  it("auto-activates a selected Task Pass after successful payment without listing chunks", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);
    const plan = engine.listTaskPassPlans().find((item) => item.id === "pass_starter")!;
    expect(plan.priceAmount).toBe(49);
    const deposit = await engine.createDeposit(user.id, plan.priceAmount, "mock", plan.id);

    const confirmed = await engine.confirmDeposit(deposit.id);
    const currentPass = engine.getCurrentTaskPass(user.id);

    expect(confirmed.status).toBe("reward_credited");
    expect(confirmed.taskPassPlanId).toBe(plan.id);
    expect(currentPass?.taskPass?.status).toBe("active");
    expect(currentPass?.plan?.id).toBe(plan.id);
    expect(engine.store.findSellOrderByDeposit(deposit.id)).toBeUndefined();
    expect(engine.getWalletTransactions(user.id).some((txn) => txn.type === "task_pass_purchase")).toBe(true);
  });

  it("creates locked deposit bonus records and rejects redemptions while disabled", async () => {
    const engine = createTaskPassEngine();
    const user = await bootstrapUser(engine);
    const deposit = await engine.createDeposit(user.id, 1000, "mock");
    await engine.confirmDeposit(deposit.id);

    const bonuses = engine.getDepositBonuses(user.id);
    expect(bonuses[0]?.status).toBe("locked");
    expect(bonuses[0]?.bonusTokens).toBeGreaterThan(0);
    await expect(engine.createRedemptionRequest(user.id, 100, "manual")).rejects.toMatchObject({
      code: "redemption_disabled",
    });
  });
});
