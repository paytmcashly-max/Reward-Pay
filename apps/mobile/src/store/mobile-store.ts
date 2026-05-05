import type {
  ChunkBucket,
  DepositOrder,
  GameDefinition,
  PaymentProvider,
  ReferralSummary,
  RewardRule,
  User,
  WalletSummary,
  WalletTransaction,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import { create } from "zustand";
import { apiClient, type ProviderStatus } from "@/api/client";
import { isDemoMode } from "@/config/runtime";
import { demoChunkBuckets, demoGames, demoReferral, demoRewardRules, demoTransactions, demoWallet, marketPulse } from "@/data/demo-data";
import { sessionStorage } from "@/utils/session-storage";
import { getRewardPreview } from "@/utils/money";

const demoUser: User = {
  id: "6206319",
  phone: "9000000000",
  name: "Demo User",
  referralCode: "RWD2026",
  role: "user",
  blocked: false,
  createdAt: new Date().toISOString(),
};

const demoBeneficiary: WithdrawBeneficiary = {
  id: "bene_demo_upi",
  userId: demoUser.id,
  type: "upi",
  label: "Primary UPI",
  accountName: "Demo User",
  upiId: "demo@upi",
  createdAt: new Date().toISOString(),
};

type WithdrawalDraft = {
  amount: number;
  beneficiaryId?: string;
  label?: string;
  accountName?: string;
  upiId?: string;
};

type MobileStore = {
  isHydrating: boolean;
  isSubmitting: boolean;
  demoMode: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  user: User | null;
  wallet: WalletSummary;
  referral: ReferralSummary;
  games: GameDefinition[];
  rewardRules: RewardRule[];
  transactions: WalletTransaction[];
  deposits: DepositOrder[];
  chunkBuckets: ChunkBucket[];
  beneficiaries: WithdrawBeneficiary[];
  withdrawals: WithdrawRequest[];
  providerStatus: ProviderStatus | null;
  marketPulse: typeof marketPulse;
  lastActionMessage: string;
  errorMessage: string | null;
  pendingPhone: string;
  debugOtpCode: string | null;
  hydrate: () => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (input: { phone: string; code: string; name?: string; referralCode?: string }) => Promise<void>;
  refreshData: () => Promise<void>;
  createDeposit: (amount: number, provider?: PaymentProvider) => Promise<DepositOrder | null>;
  syncDeposit: (depositId: string) => Promise<DepositOrder | null>;
  cancelDeposit: (depositId: string) => Promise<DepositOrder | null>;
  submitWithdrawal: (draft: WithdrawalDraft) => Promise<WithdrawRequest | null>;
  playGame: (gameId: GameDefinition["id"]) => Promise<string>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const buildTransaction = (transaction: WalletTransaction): WalletTransaction => ({
  ...transaction,
  createdAt: new Date().toISOString(),
});

const applyDemoDeposit = (wallet: WalletSummary, rules: RewardRule[], amount: number) => {
  const { reward } = getRewardPreview(amount, rules);
  return {
    wallet: {
      ...wallet,
      rewardBalance: wallet.rewardBalance + reward,
      listedBalance: wallet.listedBalance + amount,
      updatedAt: new Date().toISOString(),
    },
    reward,
  };
};

const createDemoWithdrawal = (wallet: WalletSummary, amount: number) => ({
  ...wallet,
  withdrawableBalance: wallet.withdrawableBalance - amount,
  lockedBalance: wallet.lockedBalance + amount,
  updatedAt: new Date().toISOString(),
});

export const useMobileStore = create<MobileStore>((set, get) => {
  const refreshLiveData = async (token: string) => {
    const [me, transactions, deposits, referral, games, rewardRules, chunkBuckets, beneficiaries, withdrawals, providerStatus] = await Promise.all([
      apiClient.getMe(token),
      apiClient.getWalletTransactions(token),
      apiClient.listDeposits(token),
      apiClient.getReferrals(token),
      apiClient.getGames(),
      apiClient.getRewardRules(),
      apiClient.getChunkBuckets(),
      apiClient.listBeneficiaries(token).catch(() => []),
      apiClient.listWithdrawals(token).catch(() => []),
      apiClient.getProviderStatus().catch(() => null),
    ]);

    set({
      user: me.user,
      wallet: me.walletSummary,
      transactions,
      deposits,
      referral,
      games,
      rewardRules,
      chunkBuckets,
      beneficiaries,
      withdrawals,
      providerStatus,
      isAuthenticated: true,
      sessionToken: token,
      lastActionMessage: "Live API connected. Wallet and market state refreshed.",
      errorMessage: null,
    });
  };

  return {
    isHydrating: true,
    isSubmitting: false,
    demoMode: isDemoMode,
    isAuthenticated: isDemoMode,
    sessionToken: null,
    user: isDemoMode ? demoUser : null,
    wallet: demoWallet,
    referral: demoReferral,
    games: demoGames,
    rewardRules: demoRewardRules,
    transactions: demoTransactions,
    deposits: [],
    chunkBuckets: demoChunkBuckets,
    beneficiaries: [demoBeneficiary],
    withdrawals: [],
    providerStatus: null,
    marketPulse,
    lastActionMessage: isDemoMode
      ? "Demo mode active. Add EXPO_PUBLIC_API_BASE_URL to switch to the live API."
      : "Sign in with OTP to load your live wallet.",
    errorMessage: null,
    pendingPhone: "",
    debugOtpCode: null,

    hydrate: async () => {
      set({ isHydrating: true, errorMessage: null });

      if (isDemoMode) {
        set({
          isHydrating: false,
          isAuthenticated: true,
          demoMode: true,
          user: demoUser,
        });
        return;
      }

      try {
        const [games, rewardRules, chunkBuckets, providerStatus] = await Promise.all([
          apiClient.getGames(),
          apiClient.getRewardRules(),
          apiClient.getChunkBuckets(),
          apiClient.getProviderStatus().catch(() => null),
        ]);
        set({ games, rewardRules, chunkBuckets, providerStatus });

        const token = await sessionStorage.getToken();
        if (!token) {
          set({ isHydrating: false, isAuthenticated: false, sessionToken: null });
          return;
        }

        try {
          await refreshLiveData(token);
          set({ isHydrating: false });
        } catch (error) {
          await sessionStorage.clearToken();
          set({
            isHydrating: false,
            isAuthenticated: false,
            sessionToken: null,
            user: null,
            errorMessage: error instanceof Error ? "Session expired. Sign in again." : "Session expired. Sign in again.",
            lastActionMessage: "Previous session was cleared. Please sign in again.",
          });
        }
      } catch (error) {
        set({
          isHydrating: false,
          isAuthenticated: false,
          sessionToken: null,
          errorMessage: error instanceof Error ? error.message : "Unable to restore session",
        });
      }
    },

    sendOtp: async (phone) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set({
            pendingPhone: phone,
            debugOtpCode: "123456",
            lastActionMessage: "Demo OTP generated. Use 123456 to continue.",
            isSubmitting: false,
          });
          return;
        }

        const result = await apiClient.sendOtp(phone);
        set({
          pendingPhone: phone,
          debugOtpCode: result.debugCode ?? null,
          lastActionMessage: "OTP sent. Enter the code to continue.",
          isSubmitting: false,
        });
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to send OTP",
        });
      }
    },

    verifyOtp: async (input) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set({
            isAuthenticated: true,
            user: demoUser,
            sessionToken: "demo-token",
            pendingPhone: input.phone,
            isSubmitting: false,
            lastActionMessage: "Demo login complete.",
          });
          return;
        }

        const session = await apiClient.verifyOtp(input);
        await sessionStorage.setToken(session.accessToken);
        set({
          sessionToken: session.accessToken,
          user: session.user,
          wallet: session.walletSummary,
        });
        await refreshLiveData(session.accessToken);
        set({
          isSubmitting: false,
          isAuthenticated: true,
          pendingPhone: input.phone,
          debugOtpCode: null,
          lastActionMessage: "Signed in successfully.",
        });
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to verify OTP",
        });
      }
    },

    refreshData: async () => {
      if (isDemoMode) {
        return;
      }

      const token = get().sessionToken;
      if (!token) {
        return;
      }

      set({ isSubmitting: true, errorMessage: null });
      try {
        await refreshLiveData(token);
      } catch (error) {
        set({ errorMessage: error instanceof Error ? error.message : "Unable to refresh data" });
      } finally {
        set({ isSubmitting: false });
      }
    },

    createDeposit: async (amount, provider = "cashfree") => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (!Number.isFinite(amount) || amount < 100) {
          throw new Error("Minimum deposit amount is Rs 100.");
        }

        if (isDemoMode) {
          const { wallet, reward } = applyDemoDeposit(get().wallet, get().rewardRules, amount);
          const deposit: DepositOrder = {
            id: `demo_dep_${Date.now()}`,
            userId: wallet.userId,
            amount,
            provider: "mock",
            status: "listed",
            checkoutUrl: "https://sandbox.reward-wallet.local/mock-checkout",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => ({
            wallet,
            transactions: [
              buildTransaction({
                id: `txn_${Date.now()}_listed`,
                userId: state.wallet.userId,
                type: "chunk_listed",
                amount,
                metadata: { note: "Demo auto-listing", chunks: Math.max(2, Math.ceil(amount / 300)) },
                createdAt: new Date().toISOString(),
              }),
              buildTransaction({
                id: `txn_${Date.now()}_reward`,
                userId: state.wallet.userId,
                type: "reward_credit",
                amount: reward,
                metadata: { note: "Reward credited", source: "demo deposit" },
                createdAt: new Date().toISOString(),
              }),
              ...state.transactions,
            ],
            deposits: [deposit, ...state.deposits],
            lastActionMessage: `Demo deposit complete. Rs ${amount} listed and Rs ${reward} reward credited.`,
            isSubmitting: false,
          }));
          return deposit;
        }

        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }

        const deposit = await apiClient.createDeposit(token, amount, provider);
        const finalizedDeposit = provider === "mock" ? await apiClient.syncDeposit(token, deposit.id) : deposit;
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage:
            provider === "mock"
              ? `Instant test top-up completed. Your deposit was listed and matched for withdrawal testing.`
              : `Deposit order created. Complete payment and then tap Sync. Current status: ${deposit.status}.`,
        });
        return finalizedDeposit;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to create deposit",
        });
        return null;
      }
    },

    syncDeposit: async (depositId) => {
      if (isDemoMode) {
        const existing = get().deposits.find((deposit) => deposit.id === depositId) ?? null;
        if (!existing) {
          set({ errorMessage: "Deposit not found in demo mode." });
          return null;
        }
        return existing;
      }

      const token = get().sessionToken;
      if (!token) {
        set({ errorMessage: "Sign in first" });
        return null;
      }

      set({ isSubmitting: true, errorMessage: null });
      try {
        const deposit = await apiClient.syncDeposit(token, depositId);
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage: `Deposit sync completed. Current status: ${deposit.status}.`,
        });
        return deposit;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to sync deposit",
        });
        return null;
      }
    },

    cancelDeposit: async (depositId) => {
      if (isDemoMode) {
        const existing = get().deposits.find((deposit) => deposit.id === depositId) ?? null;
        if (!existing) {
          set({ errorMessage: "Deposit not found in demo mode." });
          return null;
        }
        const cancelled = { ...existing, status: "cancelled" as const, updatedAt: new Date().toISOString() };
        set((state) => ({
          deposits: state.deposits.map((deposit) => (deposit.id === depositId ? cancelled : deposit)),
          isSubmitting: false,
          lastActionMessage: "Deposit was cancelled.",
        }));
        return cancelled;
      }

      const token = get().sessionToken;
      if (!token) {
        set({ errorMessage: "Sign in first" });
        return null;
      }

      set({ isSubmitting: true, errorMessage: null });
      try {
        const deposit = await apiClient.cancelDeposit(token, depositId);
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage: "Deposit was cancelled.",
        });
        return deposit;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to cancel deposit",
        });
        return null;
      }
    },

    submitWithdrawal: async (draft) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
          throw new Error("Enter a valid withdrawal amount.");
        }

        if (isDemoMode) {
          if (draft.amount > get().wallet.withdrawableBalance) {
            throw new Error("Withdrawal can only use sold and unlocked balance.");
          }

          const nextWallet = createDemoWithdrawal(get().wallet, draft.amount);
          const request: WithdrawRequest = {
            id: `demo_withdraw_${Date.now()}`,
            userId: nextWallet.userId,
            beneficiaryId: get().beneficiaries[0]?.id ?? demoBeneficiary.id,
            amount: draft.amount,
            status: "queued_for_review",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          set((state) => ({
            wallet: nextWallet,
            withdrawals: [request, ...state.withdrawals],
            transactions: [
              buildTransaction({
                id: `txn_${Date.now()}_withdraw`,
                userId: state.wallet.userId,
                type: "withdraw_request",
                amount: draft.amount,
                metadata: { note: "Queued for admin review" },
                createdAt: new Date().toISOString(),
              }),
              ...state.transactions,
            ],
            lastActionMessage: `Withdrawal request for Rs ${draft.amount} queued.`,
            isSubmitting: false,
          }));
          return request;
        }

        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }

        if (draft.amount > get().wallet.withdrawableBalance) {
          throw new Error("Withdrawal can only use sold and unlocked balance.");
        }

        let beneficiaryId = draft.beneficiaryId;
        if (!beneficiaryId) {
          if (!draft.upiId?.includes("@")) {
            throw new Error("Enter a valid UPI ID.");
          }
          const beneficiary = await apiClient.createBeneficiary(token, {
            type: "upi",
            label: draft.label || "Primary UPI",
            accountName: draft.accountName || get().user?.name || "User",
            upiId: draft.upiId,
          });
          beneficiaryId = beneficiary.id;
        }

        const request = await apiClient.createWithdrawal(token, { beneficiaryId, amount: draft.amount });
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage: `Withdrawal request for Rs ${draft.amount} queued for review.`,
        });
        return request;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to submit withdrawal",
        });
        return null;
      }
    },

    playGame: async (gameId) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          const game = get().games.find((item) => item.id === gameId);
          if (!game) {
            throw new Error("Game not found.");
          }

          const nextWallet = { ...get().wallet };
          const available = nextWallet.rewardBalance + nextWallet.principalBalance;
          if (available < game.entryFee) {
            throw new Error("Not enough balance.");
          }

          if (nextWallet.rewardBalance >= game.entryFee) {
            nextWallet.rewardBalance -= game.entryFee;
          } else {
            const remainder = game.entryFee - nextWallet.rewardBalance;
            nextWallet.rewardBalance = 0;
            nextWallet.principalBalance -= remainder;
          }

          const reward = Math.floor((game.minReward + game.maxReward) / 2);
          nextWallet.rewardBalance += reward;
          nextWallet.updatedAt = new Date().toISOString();

          set((state) => ({
            wallet: nextWallet,
            transactions: [
              buildTransaction({
                id: `txn_${Date.now()}_payout`,
                userId: state.wallet.userId,
                type: "game_payout",
                amount: reward,
                metadata: { note: `${game.name} reward` },
                createdAt: new Date().toISOString(),
              }),
              buildTransaction({
                id: `txn_${Date.now()}_entry`,
                userId: state.wallet.userId,
                type: "game_entry",
                amount: game.entryFee,
                metadata: { note: `${game.name} entry` },
                createdAt: new Date().toISOString(),
              }),
              ...state.transactions,
            ],
            isSubmitting: false,
            lastActionMessage: `${game.name} settled. Rs ${reward} reward credited.`,
          }));
          return `${game.name} settled with Rs ${reward} reward.`;
        }

        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }

        const result = await apiClient.playGame(token, gameId);
        await refreshLiveData(token);
        set({
          wallet: result.wallet,
          isSubmitting: false,
          lastActionMessage: `${result.game.name} settled. Rs ${result.reward} reward credited.`,
        });
        return `${result.game.name} settled with Rs ${result.reward} reward.`;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to play game",
        });
        return error instanceof Error ? error.message : "Unable to play game";
      }
    },

    signOut: async () => {
      await sessionStorage.clearToken();
      set({
        isAuthenticated: isDemoMode,
        sessionToken: null,
        user: isDemoMode ? demoUser : null,
        wallet: demoWallet,
        referral: demoReferral,
        transactions: demoTransactions,
        deposits: [],
        beneficiaries: [demoBeneficiary],
        withdrawals: [],
        pendingPhone: "",
        debugOtpCode: null,
        lastActionMessage: isDemoMode
          ? "Demo mode active. Add EXPO_PUBLIC_API_BASE_URL to switch to live."
          : "Signed out.",
      });
    },

    clearError: () => set({ errorMessage: null }),
  };
});
