import type { ChunkBucket, DemandPool, Paginated, RewardRule, User } from "@reward-wallet/shared";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { AppError, isAppError } from "./errors.js";
import { PlatformEngine } from "./platform.js";
import { verifyToken, verifyWebhookSignature } from "./security.js";

const sendOtpSchema = z.object({
  phone: z.string().min(10),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4),
  name: z.string().optional(),
  referralCode: z.string().optional(),
});

const inviteLoginSchema = z.object({
  phone: z.string().min(10),
  inviteCode: z.string().min(4),
  name: z.string().optional(),
  referralCode: z.string().optional(),
});

const adminLoginSchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(4),
});

const createDepositSchema = z.object({
  amount: z.number().min(100),
  provider: z.enum(["cashfree", "mock"]).default("cashfree"),
});

const beneficiarySchema = z.object({
  type: z.enum(["upi", "bank"]),
  label: z.string().min(2),
  accountName: z.string().min(2),
  upiId: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
});

const withdrawalSchema = z.object({
  beneficiaryId: z.string().min(1),
  amount: z.number().min(1),
});

const rulesSchema = z.array(
  z.object({
    id: z.string(),
    minDepositAmount: z.number(),
    maxDepositAmount: z.number(),
    rewardPercent: z.number(),
    active: z.boolean(),
    createdAt: z.string(),
  }),
);

const bucketSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    minAmount: z.number(),
    maxAmount: z.number(),
    targetAmount: z.number(),
    active: z.boolean(),
  }),
);

const demandSchema = z.array(
  z.object({
    id: z.string(),
    bucketId: z.string(),
    label: z.string(),
    requestedAmount: z.number(),
    remainingAmount: z.number(),
    priority: z.number(),
    createdAt: z.string(),
    active: z.boolean(),
  }),
);

const rejectSchema = z.object({
  reason: z.string().min(2),
});

const blockUserSchema = z.object({
  blocked: z.boolean(),
});

const matchingSchema = z.object({
  paused: z.boolean(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const userHeader = "x-user-id";
const adminHeader = "x-admin-id";
const rawBodySymbol = Symbol("rawBody");
type RequestWithRawBody = express.Request & { [rawBodySymbol]?: string };

const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

const paginate = <T>(items: T[], page: number, pageSize: number): Paginated<T> => {
  const startIndex = (page - 1) * pageSize;
  return {
    items: items.slice(startIndex, startIndex + pageSize),
    total: items.length,
    page,
    pageSize,
  };
};

const routeParam = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);

export const createPlatformApp = (engine: PlatformEngine, config: AppConfig) => {
  const app = express();
  app.use(cors());
  app.use(
    express.json({
      verify: (req, _res, buffer) => {
        (req as RequestWithRawBody)[rawBodySymbol] = buffer.toString("utf8");
      },
    }),
  );

  const renderCashfreeCheckoutPage = (options: {
    depositId: string;
    amount: number;
    paymentSessionId: string;
    mode: "sandbox" | "production";
    orderId: string;
    returnUrl: string;
  }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reward Wallet Checkout</title>
    <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #f7f2e7 0%, #f0e6d2 100%);
        color: #132033;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: min(100%, 460px);
        background: rgba(255, 250, 240, 0.96);
        border: 1px solid #d8c9ad;
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(19, 32, 51, 0.12);
      }
      .eyebrow {
        color: #ef7a58;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: 28px;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.5;
        color: #5f6776;
      }
      .amount {
        font-size: 34px;
        font-weight: 800;
        color: #132033;
        margin: 8px 0 18px;
      }
      .button {
        width: 100%;
        border: 0;
        border-radius: 18px;
        background: #132033;
        color: white;
        font-size: 16px;
        font-weight: 700;
        padding: 16px;
        cursor: pointer;
      }
      .button.secondary {
        margin-top: 12px;
        background: #ffffff;
        color: #132033;
        border: 1px solid #d8c9ad;
      }
      .meta {
        margin-top: 18px;
        font-size: 13px;
        color: #5f6776;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="eyebrow">Secure Checkout</div>
      <h1>Complete your deposit</h1>
      <p>Tap the button below to open the official Cashfree payment page for this order.</p>
      <div class="amount">Rs ${options.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
      <button class="button" id="pay-now">Pay securely</button>
      <button class="button secondary" onclick="window.location.href='${options.returnUrl}'">I already paid</button>
      <div class="meta">Order ID: ${options.orderId}</div>
      <div class="meta">After payment, return to the app and use Sync on the deposit history card.</div>
    </main>
    <script>
      const cashfree = Cashfree({ mode: "${options.mode}" });
      const openCheckout = () => {
        cashfree.checkout({
          paymentSessionId: "${options.paymentSessionId}",
          redirectTarget: "_self",
          returnUrl: "${options.returnUrl}",
        }).then((result) => {
          if (result && result.error) {
            alert(result.error.message || "Unable to open checkout.");
          }
        });
      };
      document.getElementById("pay-now").addEventListener("click", openCheckout);
      setTimeout(openCheckout, 500);
    </script>
  </body>
</html>`;

  const renderCashfreeReturnPage = (options: { depositId: string; orderId?: string }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Return to Reward Wallet</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #f4efe4;
        font-family: Arial, sans-serif;
        color: #132033;
      }
      .card {
        width: min(100%, 460px);
        background: #fffaf0;
        border: 1px solid #d8c9ad;
        border-radius: 24px;
        padding: 24px;
      }
      h1 { margin-top: 0; }
      p { color: #5f6776; line-height: 1.5; }
      .button {
        display: inline-block;
        margin-top: 10px;
        padding: 14px 18px;
        border-radius: 16px;
        background: #132033;
        color: #ffffff;
        text-decoration: none;
        font-weight: 700;
      }
      code {
        display: block;
        margin-top: 12px;
        padding: 12px;
        border-radius: 14px;
        background: #f0e5d0;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Payment submitted</h1>
      <p>Go back to the app and tap <strong>Sync</strong> on the deposit card to refresh the payment status.</p>
      <p>If the payment is already completed, the order will move from pending into your reward-and-listing flow.</p>
      <code>Deposit ID: ${options.depositId}${options.orderId ? `\nOrder ID: ${options.orderId}` : ""}</code>
      <a class="button" href="javascript:window.history.back()">Go back</a>
    </main>
  </body>
</html>`;

  const getUserId = (req: express.Request) => {
    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const payload = verifyToken(token, config.JWT_SECRET);
      if (payload.kind !== "user") {
        throw new AppError("invalid_token_kind", "User token required", 401);
      }
      return payload.sub;
    }

    if (config.ALLOW_DEV_HEADERS) {
      const userId = req.header(userHeader);
      if (userId) {
        return userId;
      }
    }

    throw new AppError("missing_auth", "Missing user authentication", 401);
  };

  const getAdminId = (req: express.Request) => {
    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const payload = verifyToken(token, config.JWT_SECRET);
      if (payload.kind !== "admin") {
        throw new AppError("invalid_token_kind", "Admin token required", 401);
      }
      return payload.sub;
    }

    if (config.ALLOW_DEV_HEADERS) {
      return req.header(adminHeader) ?? "admin_super";
    }

    throw new AppError("missing_auth", "Missing admin authentication", 401);
  };

  const getPagination = (req: express.Request) => paginationSchema.parse(req.query);
  const getClientKey = (req: express.Request) => {
    const forwarded = req.header("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "unknown";
    return ip.replace(/[^a-zA-Z0-9:._-]/g, "_");
  };
  const enforceRateLimit = async (input: {
    scope: string;
    key: string;
    ttlSeconds: number;
    limit: number;
  }) => {
    await engine.consumeRateLimit(input.scope, input.key, input.ttlSeconds, input.limit);
  };

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: config.NODE_ENV });
  });

  app.get("/health/providers", (_req, res) => {
    res.json(engine.getProviderStatus());
  });

  app.post(
    "/auth/send-otp",
    asyncRoute(async (req, res) => {
      const body = sendOtpSchema.parse(req.body);
      await enforceRateLimit({
        scope: "send_otp_ip",
        key: getClientKey(req),
        ttlSeconds: 10 * 60,
        limit: 20,
      });
      res.json(await engine.sendOtp(body.phone));
    }),
  );

  app.post(
    "/auth/verify-otp",
    asyncRoute(async (req, res) => {
      const body = verifyOtpSchema.parse(req.body);
      await enforceRateLimit({
        scope: "verify_otp",
        key: `${getClientKey(req)}:${body.phone}`,
        ttlSeconds: 10 * 60,
        limit: 10,
      });
      res.json(await engine.verifyOtp(body.phone, body.code, body.name, body.referralCode));
    }),
  );

  app.post(
    "/auth/invite-login",
    asyncRoute(async (req, res) => {
      const body = inviteLoginSchema.parse(req.body);
      await enforceRateLimit({
        scope: "invite_login",
        key: `${getClientKey(req)}:${body.phone}`,
        ttlSeconds: 10 * 60,
        limit: 12,
      });
      res.json(await engine.inviteLogin(body.phone, body.inviteCode, body.name, body.referralCode));
    }),
  );

  app.get("/config/reward-rules", (_req, res) => {
    res.json(engine.listRewardRules());
  });

  app.get("/config/chunk-buckets", (_req, res) => {
    res.json(engine.listChunkBuckets());
  });

  app.post(
    "/admin/auth/login",
    asyncRoute(async (req, res) => {
      const body = adminLoginSchema.parse(req.body);
      await enforceRateLimit({
        scope: "admin_login",
        key: `${getClientKey(req)}:${body.phone}`,
        ttlSeconds: 15 * 60,
        limit: 10,
      });
      res.json(engine.loginAdmin(body.phone, body.password));
    }),
  );

  app.get(
    "/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getCurrentUser(getUserId(req)));
    }),
  );

  app.get(
    "/wallet/summary",
    asyncRoute(async (req, res) => {
      res.json(engine.getWalletSummary(getUserId(req)));
    }),
  );

  app.get(
    "/wallet/transactions",
    asyncRoute(async (req, res) => {
      res.json(engine.getWalletTransactions(getUserId(req)));
    }),
  );

  app.post(
    "/deposits",
    asyncRoute(async (req, res) => {
      const body = createDepositSchema.parse(req.body);
      res.status(201).json(await engine.createDeposit(getUserId(req), body.amount, body.provider));
    }),
  );

  app.get(
    "/deposits",
    asyncRoute(async (req, res) => {
      res.json(engine.listUserDeposits(getUserId(req)));
    }),
  );

  app.get(
    "/deposits/:id",
    asyncRoute(async (req, res) => {
      const deposit = engine.listUserDeposits(getUserId(req)).find((item) => item.id === req.params.id);
      if (!deposit) {
        throw new AppError("deposit_not_found", "Deposit not found", 404);
      }
      res.json(deposit);
    }),
  );

  app.post(
    "/deposits/:id/sync",
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      await enforceRateLimit({
        scope: "deposit_sync",
        key: `${userId}:${routeParam(req.params.id)}`,
        ttlSeconds: 5 * 60,
        limit: 20,
      });
      res.json(await engine.syncDepositStatus(routeParam(req.params.id), userId));
    }),
  );

  app.post(
    "/deposits/:id/cancel",
    asyncRoute(async (req, res) => {
      res.json(await engine.cancelDeposit(routeParam(req.params.id), getUserId(req)));
    }),
  );

  app.get(
    "/checkout/cashfree/:id",
    asyncRoute(async (req, res) => {
      const depositId = routeParam(req.params.id);
      const deposit = engine.listDeposits().find((item) => item.id === depositId);
      if (!deposit || deposit.provider !== "cashfree" || !deposit.checkoutSession?.paymentSessionId) {
        throw new AppError("checkout_not_found", "Cashfree checkout session not found", 404);
      }

      const requestHost = req.get("host");
      const baseUrl = `${req.protocol}://${requestHost}`;
      const returnUrl = `${baseUrl}/checkout/cashfree/${deposit.id}/return?order_id=${deposit.providerOrderId ?? deposit.id}`;
      const mode = config.CASHFREE_BASE_URL.includes("sandbox") ? "sandbox" : "production";

      res.type("html").send(
        renderCashfreeCheckoutPage({
          depositId: deposit.id,
          amount: deposit.amount,
          paymentSessionId: deposit.checkoutSession.paymentSessionId,
          mode,
          orderId: deposit.providerOrderId ?? deposit.id,
          returnUrl,
        }),
      );
    }),
  );

  app.get(
    "/checkout/cashfree/:id/return",
    asyncRoute(async (req, res) => {
      const depositId = routeParam(req.params.id);
      const deposit = engine.listDeposits().find((item) => item.id === depositId);
      if (!deposit) {
        throw new AppError("checkout_not_found", "Deposit not found", 404);
      }
      const orderId = typeof req.query.order_id === "string" ? req.query.order_id : undefined;
      res.type("html").send(renderCashfreeReturnPage({ depositId, orderId }));
    }),
  );

  app.post(
    "/webhooks/cashfree",
    asyncRoute(async (req, res) => {
      if (config.CASHFREE_WEBHOOK_SECRET) {
        const signature = req.header("x-webhook-signature");
        if (!signature) {
          throw new AppError("missing_webhook_signature", "Missing Cashfree webhook signature", 401);
        }
        const rawBody = (req as RequestWithRawBody)[rawBodySymbol] ?? JSON.stringify(req.body ?? {});
        const valid = verifyWebhookSignature({
          rawBody,
          signature,
          secret: config.CASHFREE_WEBHOOK_SECRET,
        });
        if (!valid) {
          throw new AppError("invalid_webhook_signature", "Invalid Cashfree webhook signature", 401);
        }
      }

      const deposit = await engine.handlePaymentWebhook("cashfree", {
        ...(req.body as Record<string, unknown>),
        _meta: {
          signaturePresent: Boolean(req.header("x-webhook-signature")),
          forwardedFor: req.header("x-forwarded-for") ?? null,
          userAgent: req.header("user-agent") ?? null,
        },
      });
      res.json({ ok: true, deposit });
    }),
  );

  app.post(
    "/withdrawals/beneficiaries",
    asyncRoute(async (req, res) => {
      const body = beneficiarySchema.parse(req.body);
      res.status(201).json(await engine.createBeneficiary(getUserId(req), body));
    }),
  );

  app.get(
    "/withdrawals/beneficiaries",
    asyncRoute(async (req, res) => {
      res.json(engine.listBeneficiaries(getUserId(req)));
    }),
  );

  app.post(
    "/withdrawals",
    asyncRoute(async (req, res) => {
      const body = withdrawalSchema.parse(req.body);
      const userId = getUserId(req);
      await enforceRateLimit({
        scope: "withdraw_submit",
        key: userId,
        ttlSeconds: 10 * 60,
        limit: 10,
      });
      res.status(201).json(await engine.createWithdrawal(userId, body.beneficiaryId, body.amount));
    }),
  );

  app.get(
    "/withdrawals",
    asyncRoute(async (req, res) => {
      res.json(engine.listWithdrawals(getUserId(req)));
    }),
  );

  app.get("/games", (_req, res) => {
    res.json(engine.getGames());
  });

  app.post(
    "/games/:id/play",
    asyncRoute(async (req, res) => {
      res.json(await engine.playGame(getUserId(req), req.params.id as "spin" | "scratch" | "prediction"));
    }),
  );

  app.get(
    "/referrals/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getReferralSummary(getUserId(req)));
    }),
  );

  app.get(
    "/admin/users",
    asyncRoute(async (req, res) => {
      const pagination = getPagination(req);
      getAdminId(req);
      res.json(paginate<User>(engine.listUsers(), pagination.page, pagination.pageSize));
    }),
  );

  app.post(
    "/admin/users/:id/block",
    asyncRoute(async (req, res) => {
      const body = blockUserSchema.parse(req.body);
      res.json(await engine.setUserBlocked(routeParam(req.params.id), body.blocked, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/deposits",
    asyncRoute(async (req, res) => {
      const pagination = getPagination(req);
      getAdminId(req);
      res.json(paginate(engine.listDeposits(), pagination.page, pagination.pageSize));
    }),
  );

  app.post(
    "/admin/deposits/:id/verify",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(await engine.confirmDeposit(routeParam(req.params.id)));
    }),
  );

  app.get(
    "/admin/withdrawals",
    asyncRoute(async (req, res) => {
      const pagination = getPagination(req);
      getAdminId(req);
      res.json(paginate(engine.listAllWithdrawals(), pagination.page, pagination.pageSize));
    }),
  );

  app.post(
    "/admin/withdrawals/:id/approve",
    asyncRoute(async (req, res) => {
      res.json(await engine.approveWithdrawal(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/withdrawals/:id/reject",
    asyncRoute(async (req, res) => {
      const body = rejectSchema.parse(req.body);
      res.json(engine.rejectWithdrawal(routeParam(req.params.id), getAdminId(req), body.reason));
    }),
  );

  app.get(
    "/admin/reward-rules",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listRewardRules());
    }),
  );

  app.post(
    "/admin/reward-rules",
    asyncRoute(async (req, res) => {
      const rules = rulesSchema.parse(req.body) as RewardRule[];
      res.json(await engine.replaceRewardRules(rules, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/chunk-buckets",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listChunkBuckets());
    }),
  );

  app.post(
    "/admin/chunk-buckets",
    asyncRoute(async (req, res) => {
      const buckets = bucketSchema.parse(req.body) as ChunkBucket[];
      res.json(await engine.replaceChunkBuckets(buckets, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/demand-pools",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listDemandPools());
    }),
  );

  app.post(
    "/admin/demand-pools",
    asyncRoute(async (req, res) => {
      const pools = demandSchema.parse(req.body) as DemandPool[];
      res.json(await engine.replaceDemandPools(pools, getAdminId(req)));
    }),
  );

  app.post(
    "/admin/matching/run",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      await engine.runMatchingCycle();
      res.json(engine.getPlatformSnapshot());
    }),
  );

  app.post(
    "/admin/matching/pause",
    asyncRoute(async (req, res) => {
      const body = matchingSchema.parse(req.body);
      res.json({ paused: await engine.setMatchingPaused(body.paused, getAdminId(req)) });
    }),
  );

  app.get(
    "/admin/audit-logs",
    asyncRoute(async (req, res) => {
      const pagination = getPagination(req);
      getAdminId(req);
      res.json(paginate(engine.listAuditLogs(), pagination.page, pagination.pageSize));
    }),
  );

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppError(error)) {
      res.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ code: "internal_error", message });
  });

  return { app, engine };
};
