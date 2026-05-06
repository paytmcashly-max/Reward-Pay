import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPlatformApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { MemoryOtpStore } from "../src/otp-store.js";
import { PlatformEngine } from "../src/platform.js";
import { InMemoryStore } from "../src/store.js";

const createTestApp = (env: Record<string, string> = {}) => {
  const config = readConfig({
    NODE_ENV: "test",
    JWT_SECRET: "reward-wallet-test-secret",
    ALLOW_MEMORY_INFRASTRUCTURE: "true",
    ALLOW_DEV_HEADERS: "true",
    EXPLICIT_MOCK_PAYMENTS: "true",
    ...env,
  });
  const engine = new PlatformEngine(new InMemoryStore(), new MemoryOtpStore(), config);
  return createPlatformApp(engine, config).app;
};

describe("api flow", () => {
  it("serves public whitelisting policy and pricing pages", async () => {
    const app = createTestApp({
      TASK_PASS_ENABLED: "true",
    });

    const pricing = await request(app).get("/pricing");
    expect(pricing.status).toBe(200);
    expect(pricing.text).toContain("Task Pass Pricing");
    expect(pricing.text).toContain("Growth Pass");
    expect(pricing.text).toContain("Rs 149");
    expect(pricing.text).toContain("Refunds & Cancellations");

    const contact = await request(app).get("/contact");
    expect(contact.status).toBe(200);
    expect(contact.text).toContain("Contact Us");
    expect(contact.text).toContain("support@rewardpay.app");

    const terms = await request(app).get("/terms");
    expect(terms.status).toBe(200);
    expect(terms.text).toContain("Terms & Conditions");
    expect(terms.text).toContain("Rewards depend on task completion and approval");

    const refunds = await request(app).get("/refunds");
    expect(refunds.status).toBe(200);
    expect(refunds.text).toContain("Refunds & Cancellations");
    expect(refunds.text).toContain("Duplicate successful payments");
  });

  it("supports otp, token auth, and wallet summary", async () => {
    const app = createTestApp();
    const sendOtp = await request(app).post("/auth/send-otp").send({ phone: "9000000002" });
    expect(sendOtp.status).toBe(200);

    const verify = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "9000000002", code: "123456", name: "Api User" });

    expect(verify.status).toBe(200);
    const token = verify.body.accessToken;

    const wallet = await request(app).get("/wallet/summary").set("authorization", `Bearer ${token}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.userId).toBeTruthy();

    const overview = await request(app).get("/wallet/overview").set("authorization", `Bearer ${token}`);
    expect(overview.status).toBe(200);
    expect(Array.isArray(overview.body.explainers)).toBe(true);
    expect(Array.isArray(overview.body.timeline)).toBe(true);

    const me = await request(app).get("/me").set("authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe("9000000002");
  });

  it("creates and syncs a deposit order", async () => {
    const app = createTestApp();
    await request(app).post("/auth/send-otp").send({ phone: "9000000003" });
    const verify = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "9000000003", code: "123456", name: "Deposit User" });

    const token = verify.body.accessToken as string;

    const deposit = await request(app)
      .post("/deposits")
      .set("authorization", `Bearer ${token}`)
      .send({ amount: 1000, provider: "cashfree" });

    expect(deposit.status).toBe(201);

    const sync = await request(app)
      .post(`/deposits/${deposit.body.id}/sync`)
      .set("authorization", `Bearer ${token}`)
      .send({});

    expect(sync.status).toBe(200);
    expect(sync.body.status).toBe("reward_credited");

    const syncAgain = await request(app)
      .post(`/deposits/${deposit.body.id}/sync`)
      .set("authorization", `Bearer ${token}`)
      .send({});

    expect(syncAgain.status).toBe(200);
    expect(syncAgain.body.status).toBe("reward_credited");

    const transactions = await request(app).get("/wallet/transactions").set("authorization", `Bearer ${token}`);
    expect(transactions.status).toBe(200);
    expect(transactions.body.filter((txn: { type: string; metadata: Record<string, string> }) => txn.type === "deposit_principal" && txn.metadata.depositId === deposit.body.id)).toHaveLength(1);
  });

  it("requires a webhook signature when the secret is configured", async () => {
    const app = createTestApp({
      CASHFREE_WEBHOOK_SECRET: "test_webhook_secret",
    });

    const response = await request(app).post("/webhooks/cashfree").send({ order_id: "dep_missing" });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("missing_webhook_signature");
  });

  it("accepts Cashfree dashboard webhook test payloads with timestamped signatures", async () => {
    const secret = "test_webhook_secret";
    const app = createTestApp({
      CASHFREE_WEBHOOK_SECRET: secret,
    });
    const payload = { type: "WEBHOOK", data: { test_object: { test_key: "test_value" } } };
    const rawBody = JSON.stringify(payload);
    const timestamp = "1746427759733";
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("base64");

    const response = await request(app)
      .post("/webhooks/cashfree")
      .set("content-type", "application/json")
      .set("x-webhook-timestamp", timestamp)
      .set("x-webhook-signature", signature)
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, test: true });
  });

  it("rate limits repeated deposit sync requests", async () => {
    const app = createTestApp();
    await request(app).post("/auth/send-otp").send({ phone: "9000000011" });
    const verify = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "9000000011", code: "123456", name: "Rate Limit User" });

    const token = verify.body.accessToken as string;

    const deposit = await request(app)
      .post("/deposits")
      .set("authorization", `Bearer ${token}`)
      .send({ amount: 1000, provider: "cashfree" });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sync = await request(app)
        .post(`/deposits/${deposit.body.id}/sync`)
        .set("authorization", `Bearer ${token}`)
        .send({});
      expect(sync.status).toBe(200);
    }

    const blocked = await request(app)
      .post(`/deposits/${deposit.body.id}/sync`)
      .set("authorization", `Bearer ${token}`)
      .send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("rate_limited");
  });

  it("supports invite login when enabled", async () => {
    const app = createTestApp({
      ENABLE_INVITE_LOGIN: "true",
      INVITE_CODE: "BETA2026",
    });

    const response = await request(app)
      .post("/auth/invite-login")
      .send({ phone: "9000000055", inviteCode: "beta2026", name: "Invite User" });

    expect(response.status).toBe(200);
    expect(response.body.user.phone).toBe("9000000055");
    expect(response.body.user.id).toMatch(/^\d{7}$/);
  });

  it("returns clear withdrawal eligibility errors for blocked users", async () => {
    const app = createTestApp();
    await request(app).post("/auth/send-otp").send({ phone: "9000000066" });
    const verify = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "9000000066", code: "123456", name: "Blocked User" });

    const token = verify.body.accessToken as string;
    const beneficiary = await request(app)
      .post("/withdrawals/beneficiaries")
      .set("authorization", `Bearer ${token}`)
      .send({
        type: "upi",
        label: "Main UPI",
        accountName: "Blocked User",
        upiId: "blocked@upi",
      });

    const adminLogin = await request(app)
      .post("/admin/auth/login")
      .send({ phone: "9999999999", password: "admin1234" });
    const adminToken = adminLogin.body.accessToken as string;

    await request(app)
      .post(`/admin/users/${verify.body.user.id}/block`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ blocked: true });

    const withdrawal = await request(app)
      .post("/withdrawals")
      .set("authorization", `Bearer ${token}`)
      .send({ beneficiaryId: beneficiary.body.id, amount: 100 });

    const eligibility = await request(app)
      .get("/wallet/withdrawal-eligibility?amount=100")
      .set("authorization", `Bearer ${token}`);

    expect(withdrawal.status).toBe(403);
    expect(withdrawal.body.code).toBe("user_blocked");
    expect(eligibility.status).toBe(200);
    expect(eligibility.body.reasons[0].code).toBe("blocked_user");
  });

  it("supports phase 1 task pass and token flow", async () => {
    const app = createTestApp({
      TASK_PASS_ENABLED: "true",
    });

    await request(app).post("/auth/send-otp").send({ phone: "9000000077" });
    const verify = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "9000000077", code: "123456", name: "Task Pass User" });

    const token = verify.body.accessToken as string;
    const plans = await request(app).get("/task-pass/plans");
    expect(plans.status).toBe(200);
    expect(plans.body.some((plan: { id: string }) => plan.id === "pass_starter")).toBe(true);

    const requestPass = await request(app)
      .post("/task-pass/activate-request")
      .set("authorization", `Bearer ${token}`)
      .send({ planId: "pass_starter" });
    expect(requestPass.status).toBe(201);

    const adminLogin = await request(app).post("/admin/auth/login").send({ phone: "9999999999", password: "admin1234" });
    const adminToken = adminLogin.body.accessToken as string;

    const activatePass = await request(app)
      .post(`/admin/task-passes/${requestPass.body.id}/activate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(activatePass.status).toBe(200);

    const assignTasks = await request(app)
      .post(`/admin/users/${verify.body.user.id}/assign-daily-tasks`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(assignTasks.status).toBe(200);
    expect(assignTasks.body).toHaveLength(2);

    const dailyOverview = await request(app).get("/daily").set("authorization", `Bearer ${token}`);
    expect(dailyOverview.status).toBe(200);
    expect(dailyOverview.body.activePlan.name).toBe("Starter Pass");

    const checkIn = await request(app).post("/daily/check-in").set("authorization", `Bearer ${token}`).send({});
    expect(checkIn.status).toBe(201);

    const dailyTasks = await request(app).get("/daily/tasks").set("authorization", `Bearer ${token}`);
    expect(dailyTasks.status).toBe(200);
    const autoTask = dailyTasks.body.find((item: { task: { requiresApproval: boolean } }) => !item.task.requiresApproval);
    expect(autoTask).toBeTruthy();

    await request(app)
      .post(`/daily/tasks/${autoTask.assignment.id}/submit`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    const claim = await request(app)
      .post(`/daily/tasks/${autoTask.assignment.id}/claim`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(claim.status).toBe(200);

    const tokenBalance = await request(app).get("/tokens/balance").set("authorization", `Bearer ${token}`);
    expect(tokenBalance.status).toBe(200);
    expect(tokenBalance.body.balance).toBeGreaterThan(0);

    const tokenLedger = await request(app).get("/tokens/ledger").set("authorization", `Bearer ${token}`);
    expect(tokenLedger.status).toBe(200);
    expect(tokenLedger.body.filter((entry: { reason: string }) => entry.reason === "daily_checkin")).toHaveLength(1);
    expect(tokenLedger.body.filter((entry: { reason: string }) => entry.reason === "daily_task")).toHaveLength(1);
  });
});
