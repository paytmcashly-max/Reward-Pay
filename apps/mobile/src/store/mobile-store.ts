import type {
  ChunkBucket,
  DailyCheckIn,
  DailyOverview,
  DailyTask,
  DepositBonus,
  DepositOrder,
  GameDefinition,
  PaymentProvider,
  RedemptionPayoutMethod,
  RedemptionRequest,
  ReferralSummary,
  RewardRule,
  TaskPassPlan,
  TokenBalanceSummary,
  TokenTransaction,
  User,
  UserDailyTaskAssignment,
  UserMilestoneView,
  UserTaskPass,
  WalletOverview,
  WalletSummary,
  WalletTransaction,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import { walletBalanceExplainers } from "@reward-wallet/shared";
import { create } from "zustand";
import { apiClient, type ProviderStatus } from "@/api/client";
import { isDemoMode } from "@/config/runtime";
import { demoGames, demoReferral, demoRewardRules, demoTransactions, demoWallet, marketPulse } from "@/data/demo-data";
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

const buildDemoTokenBalance = (balance: number): TokenBalanceSummary => ({
  balance,
  todayEarned: 0,
  todayCap: 60,
  redeemableTokens: balance,
  lockedBonusTokens: 0,
  minimumRedemption: 100,
  conversionRate: 1,
});

const demoTaskPassPlan: TaskPassPlan = {
  id: "pass_starter",
  name: "Starter Pass",
  durationDays: 7,
  dailyTaskMin: 2,
  dailyTaskMax: 3,
  dailyTokenCap: 60,
  targetTokens: 300,
  priceAmount: 49,
  currency: "INR",
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const demoTaskPassPlans: TaskPassPlan[] = [
  demoTaskPassPlan,
  {
    ...demoTaskPassPlan,
    id: "pass_growth",
    name: "Growth Pass",
    durationDays: 12,
    dailyTaskMin: 3,
    dailyTaskMax: 5,
    dailyTokenCap: 100,
    targetTokens: 500,
    priceAmount: 149,
  },
  {
    ...demoTaskPassPlan,
    id: "pass_plus",
    name: "Plus Pass",
    durationDays: 21,
    dailyTaskMin: 4,
    dailyTaskMax: 6,
    dailyTokenCap: 160,
    targetTokens: 1000,
    priceAmount: 349,
  },
  {
    ...demoTaskPassPlan,
    id: "pass_pro",
    name: "Pro Pass",
    durationDays: 30,
    dailyTaskMin: 5,
    dailyTaskMax: 8,
    dailyTokenCap: 250,
    targetTokens: 2000,
    priceAmount: 599,
  },
];

const demoUserTaskPass: UserTaskPass = {
  id: "task_pass_demo",
  userId: demoUser.id,
  planId: demoTaskPassPlan.id,
  status: "active",
  startsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  activatedByAdminId: "admin_super",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const demoDailyTasks: Array<{ assignment: UserDailyTaskAssignment; task: DailyTask }> = [
  {
    assignment: {
      id: "assignment_demo_link",
      userId: demoUser.id,
      taskPassId: demoUserTaskPass.id,
      taskId: "task_link_visit",
      date: new Date().toISOString().slice(0, 10),
      status: "assigned",
      rewardTokens: 20,
      createdAt: new Date().toISOString(),
    },
    task: {
      id: "task_link_visit",
      title: "Visit Link",
      description: "Open the assigned link and return to the app.",
      type: "link_visit",
      rewardTokens: 20,
      requiresApproval: false,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  {
    assignment: {
      id: "assignment_demo_proof",
      userId: demoUser.id,
      taskPassId: demoUserTaskPass.id,
      taskId: "task_proof_upload",
      date: new Date().toISOString().slice(0, 10),
      status: "assigned",
      rewardTokens: 30,
      createdAt: new Date().toISOString(),
    },
    task: {
      id: "task_proof_upload",
      title: "Submit Proof",
      description: "Upload proof for the assigned task.",
      type: "proof_upload",
      rewardTokens: 30,
      requiresApproval: true,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
];

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
  walletOverview: WalletOverview | null;
  taskPassPlans: TaskPassPlan[];
  currentTaskPass: { taskPass: UserTaskPass | null; plan: TaskPassPlan | null } | null;
  dailyOverview: DailyOverview | null;
  dailyTasks: Array<{ assignment: UserDailyTaskAssignment; task: DailyTask }>;
  tokenBalance: TokenBalanceSummary | null;
  tokenLedger: TokenTransaction[];
  milestones: UserMilestoneView[];
  bonuses: DepositBonus[];
  redemptions: RedemptionRequest[];
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
  hydrate: () => Promise<void>;
  inviteLogin: (input: { phone: string; inviteCode: string; name?: string; referralCode?: string }) => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (input: { phone: string; code: string; name?: string; referralCode?: string }) => Promise<void>;
  refreshData: () => Promise<void>;
  createDeposit: (amount: number, provider?: PaymentProvider, taskPassPlanId?: string) => Promise<DepositOrder | null>;
  requestTaskPassActivation: (planId: string, paymentReference?: string) => Promise<UserTaskPass | null>;
  claimDailyCheckIn: () => Promise<DailyCheckIn | null>;
  startDailyTask: (assignmentId: string) => Promise<UserDailyTaskAssignment | null>;
  submitDailyTask: (assignmentId: string, proof?: string) => Promise<UserDailyTaskAssignment | null>;
  claimDailyTask: (assignmentId: string) => Promise<UserDailyTaskAssignment | null>;
  claimMilestone: (milestoneId: string) => Promise<unknown | null>;
  createRedemption: (tokens: number, payoutMethod?: RedemptionPayoutMethod, note?: string) => Promise<RedemptionRequest | null>;
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
      principalBalance: wallet.principalBalance + amount,
      withdrawableBalance: wallet.withdrawableBalance + amount + reward,
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
    const [me, walletOverview, transactions, deposits, referral, games, rewardRules, beneficiaries, withdrawals, providerStatus, taskPassPlans, currentTaskPass, dailyOverview, dailyTasks, tokenBalance, tokenLedger, milestones, bonuses, redemptions] = await Promise.all([
      apiClient.getMe(token),
      apiClient.getWalletOverview(token).catch(async () => ({
        walletSummary: await apiClient.getWalletSummary(token),
        explainers: walletBalanceExplainers,
        timeline: [],
        withdrawalEligibility: await apiClient.getWithdrawalEligibility(token).catch(() => ({
          eligible: false,
          availableAmount: 0,
          pendingCount: 0,
          maxPendingWithdrawals: 0,
          reasons: [],
        })),
      })),
      apiClient.getWalletTransactions(token),
      apiClient.listDeposits(token),
      apiClient.getReferrals(token),
      apiClient.getGames(),
      apiClient.getRewardRules(),
      apiClient.listBeneficiaries(token).catch(() => []),
      apiClient.listWithdrawals(token).catch(() => []),
      apiClient.getProviderStatus().catch(() => null),
      apiClient.getTaskPassPlans().catch(() => []),
      apiClient.getMyTaskPass(token).catch(() => ({ taskPass: null, plan: null })),
      apiClient.getDailyOverview(token).catch(() => null),
      apiClient.getDailyTasks(token).catch(() => []),
      apiClient.getTokenBalance(token).catch(() => null),
      apiClient.getTokenLedger(token).catch(() => []),
      apiClient.getMilestones(token).catch(() => []),
      apiClient.getBonuses(token).catch(() => []),
      apiClient.getRedemptions(token).catch(() => []),
    ]);

    set({
      user: me.user,
      wallet: walletOverview.walletSummary,
      walletOverview,
      transactions,
      deposits,
      referral,
      games,
      rewardRules,
      chunkBuckets: [],
      beneficiaries,
      withdrawals,
      providerStatus,
      taskPassPlans,
      currentTaskPass,
      dailyOverview,
      dailyTasks,
      tokenBalance,
      tokenLedger,
      milestones,
      bonuses,
      redemptions,
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
    walletOverview: null,
    taskPassPlans: demoTaskPassPlans,
    currentTaskPass: isDemoMode ? { taskPass: demoUserTaskPass, plan: demoTaskPassPlan } : null,
    dailyOverview: isDemoMode
      ? {
          date: new Date().toISOString().slice(0, 10),
          activeTaskPass: demoUserTaskPass,
          activePlan: demoTaskPassPlan,
          dayNumber: 3,
          totalDays: demoTaskPassPlan.durationDays,
          assignedCount: demoDailyTasks.length,
          completedCount: 0,
          checkInClaimed: false,
          tokenBalance: buildDemoTokenBalance(demoWallet.withdrawableBalance),
        }
      : null,
    dailyTasks: isDemoMode ? demoDailyTasks : [],
    tokenBalance: isDemoMode ? buildDemoTokenBalance(demoWallet.withdrawableBalance) : null,
    tokenLedger: [],
    milestones: [],
    bonuses: [],
    redemptions: [],
    referral: demoReferral,
    games: demoGames,
    rewardRules: demoRewardRules,
    transactions: demoTransactions,
    deposits: [],
    chunkBuckets: [],
    beneficiaries: [demoBeneficiary],
    withdrawals: [],
    providerStatus: null,
    marketPulse,
    lastActionMessage: isDemoMode
      ? "Demo mode active. Add EXPO_PUBLIC_API_BASE_URL to switch to the live API."
      : "Use your phone number and invite code to sign in.",
    errorMessage: null,

    hydrate: async () => {
      set({ isHydrating: true, errorMessage: null });

      if (isDemoMode) {
        set({
          isHydrating: false,
          isAuthenticated: true,
          demoMode: true,
          user: demoUser,
          walletOverview: null,
          currentTaskPass: { taskPass: demoUserTaskPass, plan: demoTaskPassPlan },
          dailyOverview: {
            date: new Date().toISOString().slice(0, 10),
            activeTaskPass: demoUserTaskPass,
            activePlan: demoTaskPassPlan,
            dayNumber: 3,
            totalDays: demoTaskPassPlan.durationDays,
            assignedCount: demoDailyTasks.length,
            completedCount: 0,
            checkInClaimed: false,
            tokenBalance: buildDemoTokenBalance(demoWallet.withdrawableBalance),
          },
          dailyTasks: demoDailyTasks,
          tokenBalance: buildDemoTokenBalance(demoWallet.withdrawableBalance),
        });
        return;
      }

      try {
        const [games, rewardRules, providerStatus] = await Promise.all([
          apiClient.getGames(),
          apiClient.getRewardRules(),
          apiClient.getProviderStatus().catch(() => null),
        ]);
        set({ games, rewardRules, chunkBuckets: [], providerStatus });

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
            lastActionMessage: `Demo OTP generated for ${phone}.`,
            isSubmitting: false,
          });
          return;
        }

        const result = await apiClient.sendOtp(phone);
        set({
          lastActionMessage: result.debugCode
            ? `OTP sent. Debug code available: ${result.debugCode}`
            : "OTP sent. Enter the code to continue.",
          isSubmitting: false,
        });
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to send OTP",
        });
      }
    },

    inviteLogin: async (input) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set({
            isAuthenticated: true,
            user: demoUser,
            sessionToken: "demo-token",
            walletOverview: null,
            isSubmitting: false,
            lastActionMessage: "Demo invite login complete.",
          });
          return;
        }

        const session = await apiClient.inviteLogin(input);
        await sessionStorage.setToken(session.accessToken);
        set({
          sessionToken: session.accessToken,
          user: session.user,
          wallet: session.walletSummary,
          walletOverview: null,
        });
        await refreshLiveData(session.accessToken);
        set({
          isSubmitting: false,
          isAuthenticated: true,
          lastActionMessage: "Signed in successfully.",
        });
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to sign in with invite code",
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
            walletOverview: null,
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
          walletOverview: null,
        });
        await refreshLiveData(session.accessToken);
        set({
          isSubmitting: false,
          isAuthenticated: true,
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

    createDeposit: async (amount, provider = "cashfree", taskPassPlanId) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (!Number.isFinite(amount) || amount <= 0 || (!taskPassPlanId && amount < 100)) {
          throw new Error(taskPassPlanId ? "Invalid Task Pass price." : "Minimum deposit amount is Rs 100.");
        }

        if (isDemoMode) {
          const { wallet, reward } = applyDemoDeposit(get().wallet, get().rewardRules, amount);
          const selectedPlan = taskPassPlanId ? get().taskPassPlans.find((plan) => plan.id === taskPassPlanId) : null;
          const nextWallet = taskPassPlanId
            ? {
                ...get().wallet,
                withdrawableBalance: Math.max(0, get().wallet.withdrawableBalance - amount),
                updatedAt: new Date().toISOString(),
              }
            : wallet;
          const activatedTaskPass = selectedPlan
            ? {
                ...demoUserTaskPass,
                id: `task_pass_demo_${Date.now()}`,
                planId: selectedPlan.id,
                startsAt: new Date().toISOString(),
                endsAt: new Date(Date.now() + selectedPlan.durationDays * 24 * 60 * 60 * 1000).toISOString(),
                paymentReference: `demo_dep_${Date.now()}`,
                updatedAt: new Date().toISOString(),
              }
            : null;
          const deposit: DepositOrder = {
            id: `demo_dep_${Date.now()}`,
            userId: wallet.userId,
            amount,
            provider: "mock",
            status: "reward_credited",
            taskPassPlanId,
            checkoutUrl: "https://sandbox.reward-wallet.local/mock-checkout",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => ({
            wallet: nextWallet,
            dailyOverview: state.dailyOverview
              ? {
                  ...state.dailyOverview,
                  tokenBalance: {
                    ...state.dailyOverview.tokenBalance,
                    balance: nextWallet.withdrawableBalance,
                    redeemableTokens: nextWallet.withdrawableBalance,
                  },
                }
              : state.dailyOverview,
            tokenBalance: state.tokenBalance
              ? {
                  ...state.tokenBalance,
                  balance: nextWallet.withdrawableBalance,
                  redeemableTokens: nextWallet.withdrawableBalance,
                }
              : state.tokenBalance,
            currentTaskPass: activatedTaskPass && selectedPlan ? { taskPass: activatedTaskPass, plan: selectedPlan } : state.currentTaskPass,
            transactions: [
              buildTransaction({
                id: `txn_${Date.now()}_deposit`,
                userId: state.wallet.userId,
                type: taskPassPlanId ? "task_pass_purchase" : "deposit_principal",
                amount: taskPassPlanId ? -amount : amount,
                metadata: {
                  note: taskPassPlanId ? `${selectedPlan?.name ?? "Task Pass"} payment` : "Demo balance deposit",
                  taskPassPlanId,
                },
                createdAt: new Date().toISOString(),
              }),
              ...(taskPassPlanId
                ? []
                : [
                    buildTransaction({
                      id: `txn_${Date.now()}_reward`,
                      userId: state.wallet.userId,
                      type: "reward_credit",
                      amount: reward,
                      metadata: { note: "Reward credited", source: "demo deposit" },
                      createdAt: new Date().toISOString(),
                    }),
                  ]),
              ...state.transactions,
            ],
            deposits: [deposit, ...state.deposits],
            lastActionMessage: taskPassPlanId
              ? `Demo Task Pass payment complete. Rs ${amount} mapped to selected pass.`
              : `Demo deposit complete. Rs ${amount} added to your balance and Rs ${reward} reward credited.`,
            isSubmitting: false,
          }));
          return deposit;
        }

        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }

        const deposit = await apiClient.createDeposit(token, amount, provider, taskPassPlanId);
        const finalizedDeposit = provider === "mock" ? await apiClient.syncDeposit(token, deposit.id) : deposit;
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage:
            provider === "mock"
              ? `Instant test payment completed. Current status: ${finalizedDeposit.status}.`
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

    requestTaskPassActivation: async (planId, paymentReference) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set({
            currentTaskPass: { taskPass: demoUserTaskPass, plan: demoTaskPassPlan },
            isSubmitting: false,
            lastActionMessage: "Starter Pass request has been queued for admin activation.",
          });
          return demoUserTaskPass;
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const taskPass = await apiClient.requestTaskPassActivation(token, { planId, paymentReference });
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage: "Task Pass activation request saved.",
        });
        return taskPass;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to request Task Pass",
        });
        return null;
      }
    },

    claimDailyCheckIn: async () => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          if (get().dailyOverview?.checkInClaimed) {
            set({ isSubmitting: false, lastActionMessage: "Daily check-in is already claimed today." });
            return null;
          }
          set((state) => ({
            isSubmitting: false,
            dailyOverview: state.dailyOverview
              ? {
                  ...state.dailyOverview,
                  checkInClaimed: true,
                  tokenBalance: {
                    ...state.dailyOverview.tokenBalance,
                    balance: state.dailyOverview.tokenBalance.balance + 10,
                    redeemableTokens: state.dailyOverview.tokenBalance.redeemableTokens + 10,
                    todayEarned: state.dailyOverview.tokenBalance.todayEarned + 10,
                  },
                }
              : state.dailyOverview,
            tokenBalance: state.tokenBalance
              ? {
                  ...state.tokenBalance,
                  balance: state.tokenBalance.balance + 10,
                  redeemableTokens: state.tokenBalance.redeemableTokens + 10,
                  todayEarned: state.tokenBalance.todayEarned + 10,
                }
              : state.tokenBalance,
            wallet: {
              ...state.wallet,
              withdrawableBalance: state.wallet.withdrawableBalance + 10,
              updatedAt: new Date().toISOString(),
            },
            tokenLedger: [
              {
                id: `token_demo_checkin_${Date.now()}`,
                userId: state.user?.id ?? demoUser.id,
                amount: 10,
                direction: "credit",
                reason: "daily_checkin",
                referenceId: `checkin_${Date.now()}`,
                balanceAfter: state.wallet.withdrawableBalance + 10,
                createdAt: new Date().toISOString(),
              },
              ...state.tokenLedger,
            ],
            lastActionMessage: "Daily check-in claimed.",
          }));
          return {
            id: `checkin_${Date.now()}`,
            userId: demoUser.id,
            taskPassId: demoUserTaskPass.id,
            date: new Date().toISOString().slice(0, 10),
            rewardTokens: 10,
            claimedAt: new Date().toISOString(),
          };
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const checkIn = await apiClient.claimDailyCheckIn(token);
        await refreshLiveData(token);
        set({
          isSubmitting: false,
          lastActionMessage: "Daily check-in claimed.",
        });
        return checkIn;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to claim daily check-in",
        });
        return null;
      }
    },

    startDailyTask: async (assignmentId) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set((state) => ({
            isSubmitting: false,
            dailyTasks: state.dailyTasks.map((item) =>
              item.assignment.id === assignmentId
                ? { ...item, assignment: { ...item.assignment, status: "started", startedAt: new Date().toISOString() } }
                : item,
            ),
            lastActionMessage: "Task started.",
          }));
          return get().dailyTasks.find((item) => item.assignment.id === assignmentId)?.assignment ?? null;
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const assignment = await apiClient.startDailyTask(token, assignmentId);
        await refreshLiveData(token);
        set({ isSubmitting: false, lastActionMessage: "Task started." });
        return assignment;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to start task",
        });
        return null;
      }
    },

    submitDailyTask: async (assignmentId, proof) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          const submittedAt = new Date().toISOString();
          set((state) => ({
            isSubmitting: false,
            dailyTasks: state.dailyTasks.map((item) =>
              item.assignment.id === assignmentId
                ? {
                    ...item,
                    assignment: {
                      ...item.assignment,
                      status: "checking",
                      proof,
                      startedAt: item.assignment.startedAt ?? submittedAt,
                      submittedAt,
                      approvedAt: undefined,
                      rejectedReason: undefined,
                    },
                  }
                : item,
            ),
            lastActionMessage: "Task submitted. Automatic checks are running.",
          }));
          setTimeout(() => {
            set((state) => ({
              dailyTasks: state.dailyTasks.map((item) => {
                if (item.assignment.id !== assignmentId || item.assignment.status !== "checking") {
                  return item;
                }
                const needsProof = item.task.type === "manual" || item.task.type === "proof_upload" || item.task.type === "quiz";
                const proofValue = (item.assignment.proof ?? "").trim();
                if (needsProof && proofValue.length < 3) {
                  return {
                    ...item,
                    assignment: {
                      ...item.assignment,
                      status: "rejected",
                      rejectedReason: "Proof or answer was not clear enough for automatic checks.",
                    },
                  };
                }
                return {
                  ...item,
                  assignment: {
                    ...item.assignment,
                    status: "approved",
                    approvedAt: new Date().toISOString(),
                  },
                };
              }),
              lastActionMessage: "Task checks completed. Approved tasks can be claimed.",
            }));
          }, 3000);
          return get().dailyTasks.find((item) => item.assignment.id === assignmentId)?.assignment ?? null;
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const assignment = await apiClient.submitDailyTask(token, assignmentId, proof);
        await refreshLiveData(token);
        set({ isSubmitting: false, lastActionMessage: "Task submitted." });
        return assignment;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to submit task",
        });
        return null;
      }
    },

    claimDailyTask: async (assignmentId) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          const current = get().dailyTasks.find((item) => item.assignment.id === assignmentId);
          if (!current) {
            throw new Error("Task assignment not found.");
          }
          if (current.assignment.status === "claimed") {
            set({ isSubmitting: false, lastActionMessage: "Task reward is already claimed." });
            return current.assignment;
          }
          if (current.assignment.status !== "approved") {
            throw new Error("Task checks must approve this task before claim.");
          }
          set((state) => ({
            isSubmitting: false,
            dailyTasks: state.dailyTasks.map((item) =>
              item.assignment.id === assignmentId
                ? { ...item, assignment: { ...item.assignment, status: "claimed", claimedAt: new Date().toISOString() } }
                : item,
            ),
            dailyOverview: state.dailyOverview
              ? {
                  ...state.dailyOverview,
                  completedCount: state.dailyOverview.completedCount + 1,
                  tokenBalance: {
                    ...state.dailyOverview.tokenBalance,
                    balance: state.dailyOverview.tokenBalance.balance + current.assignment.rewardTokens,
                    redeemableTokens: state.dailyOverview.tokenBalance.redeemableTokens + current.assignment.rewardTokens,
                    todayEarned: state.dailyOverview.tokenBalance.todayEarned + current.assignment.rewardTokens,
                  },
                }
              : state.dailyOverview,
            tokenBalance: state.tokenBalance
              ? {
                  ...state.tokenBalance,
                  balance: state.tokenBalance.balance + current.assignment.rewardTokens,
                  redeemableTokens: state.tokenBalance.redeemableTokens + current.assignment.rewardTokens,
                  todayEarned: state.tokenBalance.todayEarned + current.assignment.rewardTokens,
                }
              : state.tokenBalance,
            wallet: {
              ...state.wallet,
              withdrawableBalance: state.wallet.withdrawableBalance + current.assignment.rewardTokens,
              updatedAt: new Date().toISOString(),
            },
            tokenLedger: [
              {
                id: `token_demo_task_${Date.now()}`,
                userId: state.user?.id ?? demoUser.id,
                amount: current.assignment.rewardTokens,
                direction: "credit",
                reason: "daily_task",
                referenceId: current.assignment.id,
                balanceAfter: state.wallet.withdrawableBalance + current.assignment.rewardTokens,
                createdAt: new Date().toISOString(),
              },
              ...state.tokenLedger,
            ],
            lastActionMessage: `${current.task.title} claimed successfully.`,
          }));
          return get().dailyTasks.find((item) => item.assignment.id === assignmentId)?.assignment ?? null;
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const assignment = await apiClient.claimDailyTask(token, assignmentId);
        await refreshLiveData(token);
        set({ isSubmitting: false, lastActionMessage: "Task reward claimed." });
        return assignment;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to claim task reward",
        });
        return null;
      }
    },

    claimMilestone: async (milestoneId) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (isDemoMode) {
          set({ isSubmitting: false, lastActionMessage: "Milestone reward claimed." });
          return { id: milestoneId };
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const result = await apiClient.claimMilestone(token, milestoneId);
        await refreshLiveData(token);
        set({ isSubmitting: false, lastActionMessage: "Milestone reward claimed." });
        return result;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to claim milestone",
        });
        return null;
      }
    },

    createRedemption: async (tokens, payoutMethod = "manual", note) => {
      set({ isSubmitting: true, errorMessage: null });
      try {
        if (!Number.isFinite(tokens) || tokens <= 0) {
          throw new Error("Enter a valid token amount.");
        }
        if (isDemoMode) {
          const currentBalance = get().tokenBalance;
          const redeemableTokens = currentBalance?.redeemableTokens ?? currentBalance?.balance ?? 0;
          if (tokens > redeemableTokens) {
            throw new Error("Not enough redeemable tokens.");
          }
          const request: RedemptionRequest = {
            id: `redemption_demo_${Date.now()}`,
            userId: get().user?.id ?? demoUser.id,
            tokens,
            valueAmount: tokens,
            status: "pending",
            payoutMethod,
            note,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            tokenBalance: state.tokenBalance
              ? {
                  ...state.tokenBalance,
                  balance: state.tokenBalance.balance - tokens,
                  redeemableTokens: Math.max(0, state.tokenBalance.redeemableTokens - tokens),
                }
              : state.tokenBalance,
            dailyOverview: state.dailyOverview
              ? {
                  ...state.dailyOverview,
                  tokenBalance: {
                    ...state.dailyOverview.tokenBalance,
                    balance: state.dailyOverview.tokenBalance.balance - tokens,
                    redeemableTokens: Math.max(0, state.dailyOverview.tokenBalance.redeemableTokens - tokens),
                  },
                }
              : state.dailyOverview,
            wallet: {
              ...state.wallet,
              withdrawableBalance: Math.max(0, state.wallet.withdrawableBalance - tokens),
              updatedAt: new Date().toISOString(),
            },
            tokenLedger: [
              {
                id: `token_demo_redemption_${Date.now()}`,
                userId: state.user?.id ?? demoUser.id,
                amount: tokens,
                direction: "debit",
                reason: "redemption",
                referenceId: request.id,
                balanceAfter: Math.max(0, state.wallet.withdrawableBalance - tokens),
                createdAt: new Date().toISOString(),
              },
              ...state.tokenLedger,
            ],
            redemptions: [request, ...state.redemptions],
            isSubmitting: false,
            lastActionMessage: "Redemption request queued.",
          }));
          return request;
        }
        const token = get().sessionToken;
        if (!token) {
          throw new Error("Sign in first");
        }
        const request = await apiClient.createRedemption(token, { tokens, payoutMethod, note });
        await refreshLiveData(token);
        set({ isSubmitting: false, lastActionMessage: "Redemption request queued." });
        return request;
      } catch (error) {
        set({
          isSubmitting: false,
          errorMessage: error instanceof Error ? error.message : "Unable to request redemption",
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
            throw new Error("Withdrawal can only use available balance.");
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
          throw new Error("Withdrawal can only use available balance.");
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
        walletOverview: null,
        taskPassPlans: [demoTaskPassPlan],
        currentTaskPass: isDemoMode ? { taskPass: demoUserTaskPass, plan: demoTaskPassPlan } : null,
        dailyOverview: isDemoMode
          ? {
              date: new Date().toISOString().slice(0, 10),
              activeTaskPass: demoUserTaskPass,
              activePlan: demoTaskPassPlan,
              dayNumber: 3,
              totalDays: demoTaskPassPlan.durationDays,
              assignedCount: demoDailyTasks.length,
              completedCount: 0,
              checkInClaimed: false,
              tokenBalance: { balance: 140, todayEarned: 0, todayCap: demoTaskPassPlan.dailyTokenCap, redeemableTokens: 140, lockedBonusTokens: 0, minimumRedemption: 100, conversionRate: 1 },
            }
          : null,
        dailyTasks: isDemoMode ? demoDailyTasks : [],
        tokenBalance: isDemoMode ? { balance: 140, todayEarned: 0, todayCap: demoTaskPassPlan.dailyTokenCap, redeemableTokens: 140, lockedBonusTokens: 0, minimumRedemption: 100, conversionRate: 1 } : null,
        tokenLedger: [],
        milestones: [],
        bonuses: [],
        redemptions: [],
        referral: demoReferral,
        transactions: demoTransactions,
        deposits: [],
        beneficiaries: [demoBeneficiary],
        withdrawals: [],
        lastActionMessage: isDemoMode
          ? "Demo mode active. Add EXPO_PUBLIC_API_BASE_URL to switch to live."
          : "Signed out.",
      });
    },

    clearError: () => set({ errorMessage: null }),
  };
});
