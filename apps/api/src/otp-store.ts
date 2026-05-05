import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type RedisClientType } from "redis";
import { AppError } from "./errors.js";

export type OtpRecord = {
  sessionId: string;
  phone: string;
  code: string;
  expiresAt: string;
  provider?: string;
  providerSessionId?: string;
};

export interface OtpStore {
  get(phone: string): Promise<OtpRecord | null>;
  set(phone: string, record: OtpRecord, ttlSeconds: number): Promise<void>;
  delete(phone: string): Promise<void>;
  incrementRateLimit(phone: string, ttlSeconds: number): Promise<number>;
  incrementScopedRateLimit(scope: string, key: string, ttlSeconds: number): Promise<number>;
}

export class MemoryOtpStore implements OtpStore {
  protected readonly otpSessions = new Map<string, OtpRecord>();
  protected readonly rateCounters = new Map<string, { count: number; expiresAt: number }>();

  async get(phone: string) {
    const record = this.otpSessions.get(phone);
    if (!record) {
      return null;
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      this.otpSessions.delete(phone);
      return null;
    }
    return record;
  }

  async set(phone: string, record: OtpRecord, _ttlSeconds?: number) {
    this.otpSessions.set(phone, record);
  }

  async delete(phone: string) {
    this.otpSessions.delete(phone);
  }

  async incrementRateLimit(phone: string, ttlSeconds: number) {
    return this.incrementScopedRateLimit("otp", phone, ttlSeconds);
  }

  async incrementScopedRateLimit(scope: string, key: string, ttlSeconds: number) {
    const composedKey = `${scope}:${key}`;
    const existing = this.rateCounters.get(composedKey);
    if (!existing || existing.expiresAt < Date.now()) {
      this.rateCounters.set(composedKey, { count: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }
}

type FileOtpState = {
  otpSessions: Record<string, OtpRecord>;
  rateCounters: Record<string, { count: number; expiresAt: number }>;
};

export class FileOtpStore extends MemoryOtpStore {
  private loaded = false;

  constructor(private readonly filePath: string) {
    super();
  }

  private resolvePath() {
    return path.isAbsolute(this.filePath) ? this.filePath : path.resolve(process.cwd(), this.filePath);
  }

  private async ensureLoaded() {
    if (this.loaded) {
      return;
    }

    const resolvedPath = this.resolvePath();
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    try {
      const raw = await fs.readFile(resolvedPath, "utf8");
      const parsed = JSON.parse(raw) as FileOtpState;
      for (const [phone, record] of Object.entries(parsed.otpSessions ?? {})) {
        this.otpSessions.set(phone, record);
      }
      for (const [phone, counter] of Object.entries(parsed.rateCounters ?? {})) {
        this.rateCounters.set(phone, counter);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      await this.persist();
    }

    this.loaded = true;
  }

  private async persist() {
    const state: FileOtpState = {
      otpSessions: Object.fromEntries(this.otpSessions.entries()),
      rateCounters: Object.fromEntries(this.rateCounters.entries()),
    };
    const resolvedPath = this.resolvePath();
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, JSON.stringify(state, null, 2), "utf8");
  }

  override async get(phone: string) {
    await this.ensureLoaded();
    return super.get(phone);
  }

  override async set(phone: string, record: OtpRecord, ttlSeconds: number) {
    await this.ensureLoaded();
    await super.set(phone, record, ttlSeconds);
    await this.persist();
  }

  override async delete(phone: string) {
    await this.ensureLoaded();
    await super.delete(phone);
    await this.persist();
  }

  override async incrementRateLimit(phone: string, ttlSeconds: number) {
    await this.ensureLoaded();
    const count = await super.incrementRateLimit(phone, ttlSeconds);
    await this.persist();
    return count;
  }

  override async incrementScopedRateLimit(scope: string, key: string, ttlSeconds: number) {
    await this.ensureLoaded();
    const count = await super.incrementScopedRateLimit(scope, key, ttlSeconds);
    await this.persist();
    return count;
  }
}

export class RedisOtpStore implements OtpStore {
  private client?: RedisClientType;

  constructor(private readonly redisUrl: string) {}

  private async getClient() {
    if (!this.client) {
      this.client = createClient({ url: this.redisUrl });
      this.client.on("error", () => undefined);
      await this.client.connect();
    }
    return this.client;
  }

  async get(phone: string) {
    const client = await this.getClient();
    const value = await client.get(`otp:${phone}`);
    return value ? (JSON.parse(value) as OtpRecord) : null;
  }

  async set(phone: string, record: OtpRecord, ttlSeconds: number) {
    const client = await this.getClient();
    await client.set(`otp:${phone}`, JSON.stringify(record), { EX: ttlSeconds });
  }

  async delete(phone: string) {
    const client = await this.getClient();
    await client.del(`otp:${phone}`);
  }

  async incrementRateLimit(phone: string, ttlSeconds: number) {
    return this.incrementScopedRateLimit("otp", phone, ttlSeconds);
  }

  async incrementScopedRateLimit(scope: string, key: string, ttlSeconds: number) {
    const client = await this.getClient();
    const redisKey = `ratelimit:${scope}:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, ttlSeconds);
    }
    return count;
  }
}

export const createOtpStore = (options: {
  redisUrl?: string;
  otpFilePath?: string;
  allowMemory: boolean;
  nodeEnv: string;
}): OtpStore => {
  if (options.redisUrl) {
    return new RedisOtpStore(options.redisUrl);
  }
  if (options.otpFilePath) {
    return new FileOtpStore(options.otpFilePath);
  }
  if (options.allowMemory || options.nodeEnv === "test") {
    return new MemoryOtpStore();
  }
  throw new AppError("redis_required", "Redis URL is required when memory infrastructure is disabled", 500);
};
