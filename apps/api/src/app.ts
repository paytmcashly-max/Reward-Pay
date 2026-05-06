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
  amount: z.number().positive(),
  provider: z.enum(["cashfree", "mock"]).default("cashfree"),
  taskPassPlanId: z.string().optional(),
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

const taskPassActivationRequestSchema = z.object({
  planId: z.string().min(1),
  paymentReference: z.string().optional(),
});

const taskPassPlanSchema = z.object({
  name: z.string().min(2),
  durationDays: z.number().int().positive(),
  dailyTaskMin: z.number().int().positive(),
  dailyTaskMax: z.number().int().positive(),
  dailyTokenCap: z.number().positive(),
  targetTokens: z.number().nonnegative(),
  priceAmount: z.number().nonnegative(),
  currency: z.string().min(3),
  active: z.boolean(),
});

const dailyTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  type: z.enum(["checkin", "manual", "quiz", "proof_upload", "link_visit", "ad_watch"]),
  rewardTokens: z.number().positive(),
  requiresApproval: z.boolean(),
  active: z.boolean(),
});

const submitTaskSchema = z.object({
  proof: z.string().optional(),
});

const milestoneSchema = z.object({
  planId: z.string().min(1),
  name: z.string().min(2),
  requiredDay: z.number().int().positive(),
  requiredCompletedTasks: z.number().int().nonnegative(),
  rewardTokens: z.number().positive(),
  active: z.boolean(),
});

const depositBonusRuleSchema = z.object({
  minDepositAmount: z.number().nonnegative(),
  bonusPercent: z.number().nonnegative(),
  maxBonusTokens: z.number().nonnegative(),
  unlockRequiredApprovedTasks: z.number().int().nonnegative(),
  active: z.boolean(),
});

const referralCommissionRuleSchema = z.object({
  trigger: z.enum(["referred_task_completed", "referred_milestone_completed", "referred_deposit_approved"]),
  rewardType: z.enum(["fixed_tokens", "percent_tokens", "percent_deposit_bonus"]),
  rewardValue: z.number().nonnegative(),
  maxRewardTokens: z.number().nonnegative().optional(),
  requiredTaskId: z.string().optional(),
  requiredMilestoneId: z.string().optional(),
  active: z.boolean(),
});

const redemptionRequestSchema = z.object({
  tokens: z.number().positive(),
  payoutMethod: z.enum(["manual", "voucher", "bank", "upi"]),
  note: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const validationFieldLabels: Record<string, string> = {
  phone: "Phone number",
  code: "OTP code",
  inviteCode: "Invite code",
  name: "Name",
  referralCode: "Referral code",
  amount: "Amount",
  password: "Password",
  beneficiaryId: "Payout account",
  tokens: "Tokens",
  payoutMethod: "Payout method",
};

const friendlyValidationMessage = (issue: z.ZodIssue) => {
  const field = issue.path.join(".");
  const label = validationFieldLabels[field] ?? validationFieldLabels[issue.path.at(-1)?.toString() ?? ""] ?? "This field";

  if (issue.code === "invalid_type") {
    return `${label} is required.`;
  }

  if (issue.code === "too_small") {
    if (field === "phone") return "Enter a valid phone number.";
    if (field === "inviteCode") return "Invite code is required.";
    if (field === "code") return "Enter the OTP code.";
    return `${label} is too short.`;
  }

  if (issue.code === "invalid_enum_value") {
    return `${label} has an unsupported value.`;
  }

  return "Please check the details and try again.";
};

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

const defaultTaskPassPlans = [
  { name: "Starter Pass", durationDays: 7, dailyTaskMin: 2, dailyTaskMax: 3, dailyTokenCap: 60, targetTokens: 300, priceAmount: 49, currency: "INR" },
  { name: "Growth Pass", durationDays: 12, dailyTaskMin: 3, dailyTaskMax: 5, dailyTokenCap: 100, targetTokens: 500, priceAmount: 149, currency: "INR" },
  { name: "Plus Pass", durationDays: 21, dailyTaskMin: 4, dailyTaskMax: 6, dailyTokenCap: 160, targetTokens: 1000, priceAmount: 349, currency: "INR" },
  { name: "Pro Pass", durationDays: 30, dailyTaskMin: 5, dailyTaskMax: 8, dailyTokenCap: 250, targetTokens: 2000, priceAmount: 599, currency: "INR" },
];

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
      <p>If the payment is already completed, the order will move from pending into your cash wallet or Task Pass purchase flow.</p>
      <code>Deposit ID: ${options.depositId}${options.orderId ? `\nOrder ID: ${options.orderId}` : ""}</code>
      <a class="button" href="javascript:window.history.back()">Go back</a>
    </main>
  </body>
</html>`;

  const getPublicTaskPassPlans = () => {
    try {
      return engine.listTaskPassPlans().filter((plan) => plan.active);
    } catch {
      return defaultTaskPassPlans;
    }
  };

  const renderPublicPage = (options: { title: string; eyebrow: string; description: string; body: string }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${options.title} | RewardPay</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, Arial, sans-serif;
        color: #132033;
        background: #f6f8fb;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.12), transparent 34%),
          linear-gradient(180deg, #ffffff 0%, #f6f8fb 100%);
      }
      header, main, footer {
        width: min(100% - 32px, 920px);
        margin: 0 auto;
      }
      header {
        padding: 30px 0 18px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: #0f172a;
        font-weight: 800;
        font-size: 20px;
        text-decoration: none;
      }
      .logo {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: #16a34a;
        color: #ffffff;
        font-weight: 900;
      }
      .hero, .card {
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
      }
      .hero {
        padding: 30px;
        margin-bottom: 18px;
      }
      .eyebrow {
        margin: 0 0 10px;
        color: #16a34a;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(30px, 6vw, 48px);
        line-height: 1.02;
        letter-spacing: -1.2px;
      }
      h2 {
        margin: 0 0 10px;
        font-size: 22px;
      }
      p, li {
        color: #64748b;
        line-height: 1.65;
        font-size: 16px;
      }
      .lead {
        margin: 14px 0 0;
        max-width: 720px;
        font-size: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }
      .card {
        padding: 22px;
        margin-bottom: 14px;
      }
      .plan {
        border-radius: 20px;
        border: 1px solid #e2e8f0;
        padding: 18px;
        background: #ffffff;
      }
      .price {
        color: #0f172a;
        font-size: 28px;
        font-weight: 900;
        margin: 8px 0;
      }
      .pill {
        display: inline-flex;
        border-radius: 999px;
        background: #dcfce7;
        color: #15803d;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 800;
        margin: 4px 6px 0 0;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }
      nav a {
        color: #2563eb;
        font-weight: 700;
        text-decoration: none;
      }
      footer {
        padding: 18px 0 34px;
        color: #64748b;
        font-size: 13px;
      }
      @media (max-width: 560px) {
        .hero, .card { padding: 20px; border-radius: 20px; }
        header { padding-top: 22px; }
      }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="/pricing"><span class="logo">R</span><span>RewardPay</span></a>
      <nav aria-label="Policy navigation">
        <a href="/pricing">Pricing</a>
        <a href="/contact">Contact Us</a>
        <a href="/terms">Terms & Conditions</a>
        <a href="/refunds">Refunds & Cancellations</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <p class="eyebrow">${options.eyebrow}</p>
        <h1>${options.title}</h1>
        <p class="lead">${options.description}</p>
      </section>
      ${options.body}
    </main>
    <footer>RewardPay is a Task Pass rewards platform. Rewards depend on task completion and approval.</footer>
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

  app.get(["/", "/policies"], (_req, res) => {
    res.redirect(302, "/pricing");
  });

  app.get("/pricing", (_req, res) => {
    const plans = getPublicTaskPassPlans();
    const planCards = plans
      .map(
        (plan) => `<article class="plan">
          <h2>${plan.name}</h2>
          <div class="price">Rs ${plan.priceAmount}</div>
          <p>${plan.durationDays} days. Complete ${plan.dailyTaskMin}-${plan.dailyTaskMax} daily tasks to earn tokens.</p>
          <span class="pill">Daily cap ${plan.dailyTokenCap} tokens</span>
          <span class="pill">Earn up to ${plan.targetTokens} tokens</span>
          <span class="pill">${plan.currency}</span>
        </article>`,
      )
      .join("");

    res.type("html").send(
      renderPublicPage({
        title: "Task Pass Pricing",
        eyebrow: "Products and services",
        description:
          "RewardPay offers Task Pass plans in INR. Users can purchase a pass, complete daily tasks, and earn tokens based on task completion and approval.",
        body: `<section class="card">
          <h2>Available Task Pass plans</h2>
          <p>Task Pass purchase unlocks daily task access for the selected duration. Pricing is one-time for each pass cycle.</p>
          <div class="grid">${planCards}</div>
        </section>`,
      }),
    );
  });

  app.get("/contact", (_req, res) => {
    res.type("html").send(
      renderPublicPage({
        title: "Contact Us",
        eyebrow: "Support",
        description: "For payment, Task Pass, account, or redemption support, contact the RewardPay support team.",
        body: `<section class="card">
          <h2>Support details</h2>
          <p>Email: support@rewardpay.app</p>
          <p>Business hours: Monday to Saturday, 10:00 AM to 6:00 PM IST.</p>
          <p>Please include your registered phone number, order ID, and a short description of the issue when contacting support.</p>
        </section>`,
      }),
    );
  });

  app.get("/terms", (_req, res) => {
    res.type("html").send(
      renderPublicPage({
        title: "Terms & Conditions",
        eyebrow: "User agreement",
        description: "These terms explain the basic rules for using RewardPay Task Pass, daily tasks, token rewards, and redemption requests.",
        body: `<section class="card">
          <h2>Platform usage</h2>
          <ul>
            <li>Users must provide accurate account and payment details.</li>
            <li>Task Pass access is valid only for the duration shown at purchase.</li>
            <li>Tokens are credited only after eligible task completion, check-in, milestone, referral, or bonus events.</li>
            <li>Rewards depend on task completion and approval. Rejected or fraudulent activity may not receive tokens.</li>
            <li>RewardPay may block accounts that abuse referrals, payments, tasks, or redemption requests.</li>
          </ul>
        </section>
        <section class="card">
          <h2>Payments and redemptions</h2>
          <ul>
            <li>Task Pass prices are listed in Indian Rupees (INR).</li>
            <li>Payment confirmation depends on the payment provider and webhook verification.</li>
            <li>Redemption requests are reviewed before payout and may require valid account details.</li>
          </ul>
        </section>`,
      }),
    );
  });

  app.get(["/refunds", "/refunds-cancellations"], (_req, res) => {
    res.type("html").send(
      renderPublicPage({
        title: "Refunds & Cancellations",
        eyebrow: "Payment policy",
        description: "This policy explains how RewardPay handles Task Pass cancellations, failed payments, duplicate payments, and refund requests.",
        body: `<section class="card">
          <h2>Refund policy</h2>
          <ul>
            <li>Failed or unconfirmed payments are not treated as successful Task Pass purchases.</li>
            <li>Duplicate successful payments can be reviewed by support after the user shares the order ID.</li>
            <li>Refund eligibility depends on payment status, Task Pass activation state, and platform review.</li>
            <li>Approved refunds are processed back to the original payment method where supported by the payment provider.</li>
          </ul>
        </section>
        <section class="card">
          <h2>Cancellation policy</h2>
          <ul>
            <li>Pending payment orders may be cancelled before provider confirmation.</li>
            <li>Activated Task Passes are generally not cancellable after daily task access has started.</li>
            <li>Users can contact support for payment-status disputes or accidental duplicate purchases.</li>
          </ul>
        </section>`,
      }),
    );
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
    "/wallet/overview",
    asyncRoute(async (req, res) => {
      res.json(engine.getWalletOverview(getUserId(req)));
    }),
  );

  app.get(
    "/wallet/withdrawal-eligibility",
    asyncRoute(async (req, res) => {
      const amount = req.query.amount ? Number(routeParam(req.query.amount as string | string[])) : undefined;
      res.json(engine.getWithdrawalEligibility(getUserId(req), Number.isFinite(amount) ? amount : undefined));
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
      res.status(201).json(await engine.createDeposit(getUserId(req), body.amount, body.provider, body.taskPassPlanId));
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
        const timestamp = req.header("x-webhook-timestamp") ?? undefined;
        const rawBody = (req as RequestWithRawBody)[rawBodySymbol] ?? JSON.stringify(req.body ?? {});
        const valid = verifyWebhookSignature({
          rawBody,
          signature,
          timestamp,
          secret: config.CASHFREE_WEBHOOK_SECRET,
        });
        if (!valid) {
          throw new AppError("invalid_webhook_signature", "Invalid Cashfree webhook signature", 401);
        }
      }

      const webhookBody = req.body as Record<string, unknown>;
      const isDashboardTest =
        webhookBody.type === "WEBHOOK" &&
        typeof webhookBody.data === "object" &&
        webhookBody.data !== null &&
        "test_object" in webhookBody.data;

      if (isDashboardTest) {
        res.json({ ok: true, test: true });
        return;
      }

      const deposit = await engine.handlePaymentWebhook("cashfree", {
        ...webhookBody,
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
    "/task-pass/plans",
    asyncRoute(async (_req, res) => {
      res.json(engine.listTaskPassPlans());
    }),
  );

  app.post(
    "/task-pass/activate-request",
    asyncRoute(async (req, res) => {
      const body = taskPassActivationRequestSchema.parse(req.body);
      res.status(201).json(await engine.requestTaskPassActivation(getUserId(req), body.planId, body.paymentReference));
    }),
  );

  app.get(
    "/task-pass/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getCurrentTaskPass(getUserId(req)));
    }),
  );

  app.get(
    "/daily",
    asyncRoute(async (req, res) => {
      res.json(engine.getDailyOverview(getUserId(req)));
    }),
  );

  app.post(
    "/daily/check-in",
    asyncRoute(async (req, res) => {
      res.status(201).json(await engine.claimDailyCheckIn(getUserId(req)));
    }),
  );

  app.get(
    "/daily/tasks",
    asyncRoute(async (req, res) => {
      res.json(engine.getDailyTasks(getUserId(req)));
    }),
  );

  app.post(
    "/daily/tasks/:assignmentId/start",
    asyncRoute(async (req, res) => {
      res.json(await engine.startDailyTask(getUserId(req), routeParam(req.params.assignmentId)));
    }),
  );

  app.post(
    "/daily/tasks/:assignmentId/submit",
    asyncRoute(async (req, res) => {
      const body = submitTaskSchema.parse(req.body ?? {});
      res.json(await engine.submitDailyTask(getUserId(req), routeParam(req.params.assignmentId), body.proof));
    }),
  );

  app.post(
    "/daily/tasks/:assignmentId/claim",
    asyncRoute(async (req, res) => {
      res.json(await engine.claimDailyTask(getUserId(req), routeParam(req.params.assignmentId)));
    }),
  );

  app.get(
    "/tokens/balance",
    asyncRoute(async (req, res) => {
      res.json(engine.getTokenBalance(getUserId(req)));
    }),
  );

  app.get(
    "/tokens/ledger",
    asyncRoute(async (req, res) => {
      res.json(engine.getTokenLedger(getUserId(req)));
    }),
  );

  app.get(
    "/milestones/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getMilestoneViews(getUserId(req)));
    }),
  );

  app.post(
    "/milestones/:id/claim",
    asyncRoute(async (req, res) => {
      res.json(await engine.claimMilestone(getUserId(req), routeParam(req.params.id)));
    }),
  );

  app.get(
    "/bonuses/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getDepositBonuses(getUserId(req)));
    }),
  );

  app.get(
    "/redemptions/me",
    asyncRoute(async (req, res) => {
      res.json(engine.getRedemptions(getUserId(req)));
    }),
  );

  app.post(
    "/redemptions",
    asyncRoute(async (req, res) => {
      const body = redemptionRequestSchema.parse(req.body);
      res.status(201).json(await engine.createRedemptionRequest(getUserId(req), body.tokens, body.payoutMethod, body.note));
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
    "/admin/task-pass-plans",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listTaskPassPlans());
    }),
  );

  app.post(
    "/admin/task-pass-plans",
    asyncRoute(async (req, res) => {
      const body = taskPassPlanSchema.parse(req.body);
      res.status(201).json(await engine.createTaskPassPlan(body, getAdminId(req)));
    }),
  );

  app.patch(
    "/admin/task-pass-plans/:id",
    asyncRoute(async (req, res) => {
      const body = taskPassPlanSchema.partial().parse(req.body);
      res.json(await engine.updateTaskPassPlan(routeParam(req.params.id), body, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/task-passes",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listTaskPasses());
    }),
  );

  app.post(
    "/admin/task-passes/:id/activate",
    asyncRoute(async (req, res) => {
      res.json(await engine.activateTaskPass(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/task-passes/:id/cancel",
    asyncRoute(async (req, res) => {
      res.json(await engine.cancelTaskPass(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.get(
    "/admin/tasks",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listDailyTasks());
    }),
  );

  app.post(
    "/admin/tasks",
    asyncRoute(async (req, res) => {
      const body = dailyTaskSchema.parse(req.body);
      res.status(201).json(await engine.createDailyTask(body, getAdminId(req)));
    }),
  );

  app.patch(
    "/admin/tasks/:id",
    asyncRoute(async (req, res) => {
      const body = dailyTaskSchema.partial().parse(req.body);
      res.json(await engine.updateDailyTask(routeParam(req.params.id), body, getAdminId(req)));
    }),
  );

  app.post(
    "/admin/tasks/:id/disable",
    asyncRoute(async (req, res) => {
      res.json(await engine.disableDailyTask(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/users/:userId/assign-daily-tasks",
    asyncRoute(async (req, res) => {
      res.json(await engine.assignDailyTasksForUser(routeParam(req.params.userId), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/daily/assign-all",
    asyncRoute(async (req, res) => {
      res.json(await engine.assignDailyTasksForAll(getAdminId(req)));
    }),
  );

  app.get(
    "/admin/daily-assignments",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listAdminDailyAssignments());
    }),
  );

  app.get(
    "/admin/task-submissions",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listAdminTaskSubmissions());
    }),
  );

  app.post(
    "/admin/task-submissions/:id/approve",
    asyncRoute(async (req, res) => {
      res.json(await engine.approveTaskSubmission(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/task-submissions/:id/reject",
    asyncRoute(async (req, res) => {
      const body = rejectSchema.parse(req.body);
      res.json(await engine.rejectTaskSubmission(routeParam(req.params.id), getAdminId(req), body.reason));
    }),
  );

  app.get(
    "/admin/token-ledger",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.getAdminTokenLedger());
    }),
  );

  app.get(
    "/admin/milestones",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listMilestones());
    }),
  );

  app.post(
    "/admin/milestones",
    asyncRoute(async (req, res) => {
      const body = milestoneSchema.parse(req.body);
      res.status(201).json(await engine.createMilestone(body, getAdminId(req)));
    }),
  );

  app.patch(
    "/admin/milestones/:id",
    asyncRoute(async (req, res) => {
      const body = milestoneSchema.partial().parse(req.body);
      res.json(await engine.updateMilestone(routeParam(req.params.id), body, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/deposit-bonus-rules",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listDepositBonusRules());
    }),
  );

  app.post(
    "/admin/deposit-bonus-rules",
    asyncRoute(async (req, res) => {
      const body = depositBonusRuleSchema.parse(req.body);
      res.status(201).json(await engine.createDepositBonusRule(body, getAdminId(req)));
    }),
  );

  app.patch(
    "/admin/deposit-bonus-rules/:id",
    asyncRoute(async (req, res) => {
      const body = depositBonusRuleSchema.partial().parse(req.body);
      res.json(await engine.updateDepositBonusRule(routeParam(req.params.id), body, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/deposit-bonuses",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(Array.from(engine.store.depositBonuses.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }),
  );

  app.get(
    "/admin/referral-commission-rules",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listReferralCommissionRules());
    }),
  );

  app.post(
    "/admin/referral-commission-rules",
    asyncRoute(async (req, res) => {
      const body = referralCommissionRuleSchema.parse(req.body);
      res.status(201).json(await engine.createReferralCommissionRule(body, getAdminId(req)));
    }),
  );

  app.patch(
    "/admin/referral-commission-rules/:id",
    asyncRoute(async (req, res) => {
      const body = referralCommissionRuleSchema.partial().parse(req.body);
      res.json(await engine.updateReferralCommissionRule(routeParam(req.params.id), body, getAdminId(req)));
    }),
  );

  app.get(
    "/admin/referral-commissions",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listReferralCommissions());
    }),
  );

  app.get(
    "/admin/redemptions",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.listAdminRedemptions());
    }),
  );

  app.post(
    "/admin/redemptions/:id/approve",
    asyncRoute(async (req, res) => {
      res.json(await engine.approveRedemption(routeParam(req.params.id), getAdminId(req)));
    }),
  );

  app.post(
    "/admin/redemptions/:id/reject",
    asyncRoute(async (req, res) => {
      const body = rejectSchema.parse(req.body);
      res.json(await engine.rejectRedemption(routeParam(req.params.id), getAdminId(req), body.reason));
    }),
  );

  app.post(
    "/admin/redemptions/:id/mark-paid",
    asyncRoute(async (req, res) => {
      res.json(await engine.markRedemptionPaid(routeParam(req.params.id), getAdminId(req)));
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

  app.get(
    "/admin/risk-report",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.getAdminRiskReport());
    }),
  );

  app.get(
    "/admin/reconciliation",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(engine.getReconciliationReport());
    }),
  );

  app.post(
    "/admin/deposits/:id/sync",
    asyncRoute(async (req, res) => {
      getAdminId(req);
      res.json(await engine.syncDepositStatus(routeParam(req.params.id)));
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

    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      res.status(400).json({
        code: "validation_error",
        message: firstIssue ? friendlyValidationMessage(firstIssue) : "Please check the details and try again.",
        details: {
          issues: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: friendlyValidationMessage(issue),
          })),
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ code: "internal_error", message });
  });

  return { app, engine };
};
