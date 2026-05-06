import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const envBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    return value.toLowerCase() === "true";
  });

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16).default("reward-wallet-dev-secret"),
  JWT_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 7),
  ALLOW_DEV_HEADERS: envBoolean.default(true),
  ALLOW_MEMORY_INFRASTRUCTURE: envBoolean.default(true),
  EXPLICIT_MOCK_PAYMENTS: envBoolean.default(true),
  EXPLICIT_MOCK_PAYOUTS: envBoolean.optional(),
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  CASHFREE_API_VERSION: z.string().optional(),
  CASHFREE_PAYMENT_API_VERSION: z.string().optional(),
  CASHFREE_PAYOUT_API_VERSION: z.string().optional(),
  CASHFREE_BASE_URL: z.string().default("https://sandbox.cashfree.com"),
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  MSG91_BASE_URL: z.string().default("https://control.msg91.com"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  ENABLE_INVITE_LOGIN: envBoolean.default(false),
  INVITE_CODE: z.string().optional(),
  TASK_PASS_ENABLED: envBoolean.default(true),
  TOKEN_REDEMPTION_ENABLED: envBoolean.default(false),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  STATE_FILE_PATH: z.string().optional(),
  OTP_STATE_FILE_PATH: z.string().optional(),
  ADMIN_SUPER_PHONE: z.string().default("9999999999"),
  ADMIN_SUPER_PASSWORD: z.string().default("admin1234"),
  ADMIN_OPERATOR_PHONE: z.string().default("8888888888"),
  ADMIN_OPERATOR_PASSWORD: z.string().default("operator1234"),
});

export type AppConfig = z.infer<typeof configSchema>;

const DEFAULT_JWT_SECRET = "reward-wallet-dev-secret";
const DEFAULT_SUPERADMIN_PASSWORD = "admin1234";
const DEFAULT_OPERATOR_PASSWORD = "operator1234";

const parseDotEnv = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const entries = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator === -1) {
        return null;
      }
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      return [key, value] as const;
    })
    .filter((item): item is readonly [string, string] => Boolean(item));

  return Object.fromEntries(entries);
};

export const readConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const cwdEnv = parseDotEnv(path.resolve(process.cwd(), ".env"));
  const apiEnv = parseDotEnv(path.resolve(process.cwd(), "apps", "api", ".env"));
  const parsed = configSchema.parse({
    ...cwdEnv,
    ...apiEnv,
    ...env,
  });
  const config = {
    ...parsed,
    EXPLICIT_MOCK_PAYOUTS: parsed.EXPLICIT_MOCK_PAYOUTS ?? parsed.EXPLICIT_MOCK_PAYMENTS,
  };

  if (config.NODE_ENV === "production") {
    const issues: string[] = [];

    if (config.ALLOW_DEV_HEADERS) {
      issues.push("ALLOW_DEV_HEADERS must be false in production");
    }
    if (config.ALLOW_MEMORY_INFRASTRUCTURE) {
      issues.push("ALLOW_MEMORY_INFRASTRUCTURE must be false in production");
    }
    if (!config.DATABASE_URL) {
      issues.push("DATABASE_URL is required in production");
    }
    if (!config.REDIS_URL && !config.OTP_STATE_FILE_PATH) {
      issues.push("REDIS_URL or OTP_STATE_FILE_PATH is required in production");
    }
    if (config.JWT_SECRET === DEFAULT_JWT_SECRET || config.JWT_SECRET.includes("dev-secret")) {
      issues.push("JWT_SECRET must be replaced with a strong production secret");
    }
    if (config.ADMIN_SUPER_PASSWORD === DEFAULT_SUPERADMIN_PASSWORD) {
      issues.push("ADMIN_SUPER_PASSWORD must be rotated before production launch");
    }
    if (config.ADMIN_OPERATOR_PASSWORD === DEFAULT_OPERATOR_PASSWORD) {
      issues.push("ADMIN_OPERATOR_PASSWORD must be rotated before production launch");
    }
    if (config.EXPLICIT_MOCK_PAYMENTS) {
      issues.push("EXPLICIT_MOCK_PAYMENTS must be false in production");
    }
    if (!config.CASHFREE_CLIENT_ID || !config.CASHFREE_CLIENT_SECRET) {
      issues.push("CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET are required in production");
    }
    if (config.ENABLE_INVITE_LOGIN && !config.INVITE_CODE) {
      issues.push("INVITE_CODE is required when ENABLE_INVITE_LOGIN is true");
    }
    if (!config.ENABLE_INVITE_LOGIN && (!config.MSG91_AUTH_KEY || !config.MSG91_TEMPLATE_ID)) {
      issues.push("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required in production unless invite login is enabled");
    }

    if (issues.length) {
      throw new Error(`Invalid production configuration: ${issues.join("; ")}`);
    }
  }

  return config;
};
