import { Pool } from "pg";
import { createClient } from "redis";
import { readConfig } from "../src/config.js";

const config = readConfig();

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

const run = async () => {
  checks.push({
    name: "API mode",
    ok: true,
    detail: `NODE_ENV=${config.NODE_ENV}`,
  });

  const cashfreeConfigured = Boolean(
    config.CASHFREE_CLIENT_ID &&
      config.CASHFREE_CLIENT_SECRET &&
      (config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION) &&
      (config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION),
  );

  checks.push({
    name: "Cashfree credentials",
    ok: cashfreeConfigured,
    detail: cashfreeConfigured
      ? `Configured against ${config.CASHFREE_BASE_URL} (payments ${
          config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION
        }, payouts ${config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION})`
      : "Missing CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET / CASHFREE_PAYMENT_API_VERSION / CASHFREE_PAYOUT_API_VERSION",
  });

  checks.push({
    name: "Cashfree payments mode",
    ok: cashfreeConfigured && !config.EXPLICIT_MOCK_PAYMENTS,
    detail: config.EXPLICIT_MOCK_PAYMENTS
      ? "Mock payments enabled. Set EXPLICIT_MOCK_PAYMENTS=false for live payment API calls."
      : "Live payments requested.",
  });

  checks.push({
    name: "Cashfree payouts mode",
    ok: cashfreeConfigured && !config.EXPLICIT_MOCK_PAYOUTS,
    detail: config.EXPLICIT_MOCK_PAYOUTS
      ? "Mock payouts enabled. Set EXPLICIT_MOCK_PAYOUTS=false after your Cashfree payouts account is enabled."
      : "Live payouts requested.",
  });

  const inviteLoginConfigured = Boolean(config.ENABLE_INVITE_LOGIN && config.INVITE_CODE);
  const msg91Configured = Boolean(config.MSG91_AUTH_KEY && config.MSG91_TEMPLATE_ID);
  checks.push({
    name: "Auth mode",
    ok: inviteLoginConfigured || msg91Configured,
    detail: inviteLoginConfigured
      ? "Invite login is enabled for closed beta access."
      : msg91Configured
        ? `MSG91 OTP configured against ${config.MSG91_BASE_URL}`
        : "Missing invite login configuration and MSG91 OTP configuration",
  });

  checks.push({
    name: "Production safety",
    ok:
      config.NODE_ENV !== "production" ||
      (!config.ALLOW_DEV_HEADERS &&
        !config.ALLOW_MEMORY_INFRASTRUCTURE &&
        config.JWT_SECRET !== "reward-wallet-dev-secret-please-change" &&
        config.ADMIN_SUPER_PASSWORD !== "admin1234" &&
        config.ADMIN_OPERATOR_PASSWORD !== "operator1234"),
    detail:
      config.NODE_ENV !== "production"
        ? "Non-production mode allows development fallbacks."
        : "Production mode requires locked auth, no memory fallback, and rotated secrets/passwords.",
  });

  if (config.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: config.DATABASE_URL });
      await pool.query("select 1");
      await pool.end();
      checks.push({
        name: "Postgres",
        ok: true,
        detail: "Connected successfully.",
      });
    } catch (error) {
      checks.push({
        name: "Postgres",
        ok: false,
        detail: error instanceof Error ? error.message : "Connection failed",
      });
    }
  } else {
    checks.push({
      name: "Postgres",
      ok: false,
      detail: config.STATE_FILE_PATH
        ? "DATABASE_URL is empty. API will use FileStore fallback."
        : "DATABASE_URL is empty. API will use InMemoryStore.",
    });
  }

  if (config.STATE_FILE_PATH) {
    checks.push({
      name: "Local persistent store",
      ok: true,
      detail: `File snapshot enabled at ${config.STATE_FILE_PATH}`,
    });
  }

  if (config.REDIS_URL) {
    try {
      const client = createClient({ url: config.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.quit();
      checks.push({
        name: "Redis",
        ok: true,
        detail: "Connected successfully.",
      });
    } catch (error) {
      checks.push({
        name: "Redis",
        ok: false,
        detail: error instanceof Error ? error.message : "Connection failed",
      });
    }
  } else {
    checks.push({
      name: "Redis",
      ok: false,
      detail: config.OTP_STATE_FILE_PATH
        ? "REDIS_URL is empty. OTP state will use file-backed fallback."
        : "REDIS_URL is empty. OTP store will use memory fallback while allowed.",
    });
  }

  if (config.OTP_STATE_FILE_PATH) {
    checks.push({
      name: "Local OTP store",
      ok: true,
      detail: `File-backed OTP state enabled at ${config.OTP_STATE_FILE_PATH}`,
    });
  }

  console.log("Reward Wallet API Doctor");
  console.log("========================");
  for (const check of checks) {
    console.log(`${check.ok ? "[OK]" : "[WARN]"} ${check.name}: ${check.detail}`);
  }

  const hasBlockingIssue = checks.some((check) => {
    if (check.name === "Cashfree payments mode" || check.name === "Cashfree payouts mode") {
      return false;
    }
    if (check.name === "Postgres" && config.STATE_FILE_PATH) {
      return false;
    }
    if (check.name === "Redis" && config.OTP_STATE_FILE_PATH) {
      return false;
    }
    return !check.ok && ["Cashfree credentials", "Postgres", "Redis", "Auth mode", "Production safety"].includes(check.name);
  });

  process.exitCode = hasBlockingIssue ? 1 : 0;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
