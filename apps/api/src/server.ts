import { Pool } from "pg";
import { createPlatformApp } from "./app.js";
import { readConfig } from "./config.js";
import { createOtpStore } from "./otp-store.js";
import { PlatformEngine } from "./platform.js";
import { FileStore, InMemoryStore, PostgresStore } from "./store.js";

const config = readConfig();
const otpStore = createOtpStore({
  redisUrl: config.REDIS_URL,
  otpFilePath: config.OTP_STATE_FILE_PATH,
  allowMemory: config.ALLOW_MEMORY_INFRASTRUCTURE,
  nodeEnv: config.NODE_ENV,
});

const store = config.DATABASE_URL
  ? new PostgresStore(new Pool({ connectionString: config.DATABASE_URL }))
  : config.STATE_FILE_PATH
    ? new FileStore(config.STATE_FILE_PATH)
  : new InMemoryStore();

await store.initialize();
const migratedUserIds = store.ensureSevenDigitUserIds();
if (migratedUserIds > 0) {
  await store.flush();
}

const engine = new PlatformEngine(store, otpStore, config);
const { app } = createPlatformApp(engine, config);

setInterval(() => {
  void engine.runMatchingCycle();
}, 5_000).unref();

app.listen(config.PORT, () => {
  console.log(
    `Reward wallet API listening on http://localhost:${config.PORT} using ${
      config.DATABASE_URL ? "PostgresStore" : config.STATE_FILE_PATH ? "FileStore" : "InMemoryStore"
    }`,
  );
});
