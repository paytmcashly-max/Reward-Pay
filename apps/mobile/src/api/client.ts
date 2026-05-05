import type {
  ApiError,
  AuthSession,
  ChunkBucket,
  DepositOrder,
  GameDefinition,
  ReferralSummary,
  RewardRule,
  User,
  WalletSummary,
  WalletTransaction,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import { runtimeConfig } from "@/config/runtime";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string | null;
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  if (!runtimeConfig.apiBaseUrl) {
    throw new Error("API base URL is not configured");
  }

  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;
  if (!response.ok) {
    const payload = typeof data === "object" && data ? (data as ApiError) : null;
    const message = payload?.message ?? "Request failed";
    const error = new Error(message) as Error & { code?: string; details?: Record<string, unknown> };
    error.code = payload?.code;
    error.details = payload?.details;
    throw error;
  }
  return data as T;
};

export type ProviderStatus = {
  cashfree: {
    paymentsLive: boolean;
    payoutsLive: boolean;
    baseUrl: string;
    paymentApiVersion: string | null;
    payoutApiVersion: string | null;
  };
  fallbackMode: boolean;
  storageMode: "postgres" | "file" | "memory";
  otpMode: "redis" | "file" | "memory";
  memoryInfrastructure: boolean;
  databaseConfigured: boolean;
  redisConfigured: boolean;
};

export const apiClient = {
  sendOtp: (phone: string) => request<{ sessionId: string; debugCode?: string }>("/auth/send-otp", { method: "POST", body: { phone } }),
  verifyOtp: (input: { phone: string; code: string; name?: string; referralCode?: string }) =>
    request<AuthSession>("/auth/verify-otp", { method: "POST", body: input }),
  getMe: (token: string) => request<{ user: User; walletSummary: WalletSummary }>("/me", { token }),
  getWalletSummary: (token: string) => request<WalletSummary>("/wallet/summary", { token }),
  getWalletTransactions: (token: string) => request<WalletTransaction[]>("/wallet/transactions", { token }),
  listDeposits: (token: string) => request<DepositOrder[]>("/deposits", { token }),
  syncDeposit: (token: string, depositId: string) => request<DepositOrder>(`/deposits/${depositId}/sync`, { method: "POST", token }),
  cancelDeposit: (token: string, depositId: string) => request<DepositOrder>(`/deposits/${depositId}/cancel`, { method: "POST", token }),
  getReferrals: (token: string) => request<ReferralSummary>("/referrals/me", { token }),
  getGames: () => request<GameDefinition[]>("/games"),
  getRewardRules: () => request<RewardRule[]>("/config/reward-rules"),
  getChunkBuckets: () => request<ChunkBucket[]>("/config/chunk-buckets"),
  getProviderStatus: () => request<ProviderStatus>("/health/providers"),
  createDeposit: (token: string, amount: number, provider: "cashfree" | "mock") =>
    request<DepositOrder>("/deposits", { method: "POST", token, body: { amount, provider } }),
  createBeneficiary: (
    token: string,
    input: Omit<WithdrawBeneficiary, "id" | "userId" | "createdAt">,
  ) => request<WithdrawBeneficiary>("/withdrawals/beneficiaries", { method: "POST", token, body: input }),
  listBeneficiaries: (token: string) => request<WithdrawBeneficiary[]>("/withdrawals/beneficiaries", { token }),
  createWithdrawal: (token: string, input: { beneficiaryId: string; amount: number }) =>
    request<WithdrawRequest>("/withdrawals", { method: "POST", token, body: input }),
  listWithdrawals: (token: string) => request<WithdrawRequest[]>("/withdrawals", { token }),
  playGame: (token: string, gameId: GameDefinition["id"]) =>
    request<{ game: GameDefinition; reward: number; wallet: WalletSummary }>(`/games/${gameId}/play`, {
      method: "POST",
      token,
    }),
};
