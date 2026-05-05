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
    expect(sync.body.status).toBe("listed");
  });

  it("requires a webhook signature when the secret is configured", async () => {
    const app = createTestApp({
      CASHFREE_WEBHOOK_SECRET: "test_webhook_secret",
    });

    const response = await request(app).post("/webhooks/cashfree").send({ order_id: "dep_missing" });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("missing_webhook_signature");
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
});
