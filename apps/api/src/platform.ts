import {
  walletBalanceExplainers,
} from "@reward-wallet/shared";
import type {
  AdminDailyAssignment,
  AdminRiskReport,
  AdminSession,
  ChunkBucket,
  DailyCheckIn,
  DailyOverview,
  DailyTask,
  DepositBonus,
  DepositBonusRule,
  DemandPool,
  DepositOrder,
  GameDefinition,
  MoneyTimelineStep,
  PaymentProvider,
  ReconciliationEntry,
  ReconciliationReport,
  RedemptionPayoutMethod,
  RedemptionRequest,
  ReferralSummary,
  RewardMilestone,
  RiskIndicator,
  ReferralCommission,
  ReferralCommissionRule,
  RewardRule,
  SellOrder,
  SellOrderChunk,
  TaskPassPlan,
  TokenBalanceSummary,
  TokenTransaction,
  TradeMatch,
  User,
  UserDailyTaskAssignment,
  UserMilestoneProgress,
  UserMilestoneView,
  UserTaskPass,
  WalletBalanceExplainer,
  WalletOverview,
  WalletSummary,
  WithdrawalEligibility,
  WithdrawBeneficiary,
  WithdrawRequest,
} from "@reward-wallet/shared";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { OtpRecord, OtpStore } from "./otp-store.js";
import { signToken } from "./security.js";
import { createOtpProvider, type OtpProvider } from "./sms.js";
import {
  CashfreePaymentProviderAdapter,
  CashfreePayoutProviderAdapter,
  MockPaymentProviderAdapter,
  MockPayoutProviderAdapter,
  type PaymentProviderAdapter,
  type PayoutProviderAdapter,
} from "./adapters.js";
import { createSevenDigitUserId, InMemoryStore, id, now } from "./store.js";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_RATE_TTL_SECONDS = 5 * 60;
const OTP_RATE_LIMIT = 5;
const DEFAULT_MIN_WITHDRAWAL_AMOUNT = 100;
const DEFAULT_MAX_PENDING_WITHDRAWALS = 3;
const DEFAULT_MIN_REDEMPTION_TOKENS = 100;
const CHECKIN_TASK_ID = "task_checkin";
const TASK_VALIDATION_DELAY_MS = 2 * 60 * 1000;
const MIN_TASK_DWELL_MS = 8 * 1000;

export class PlatformEngine {
  readonly paymentAdapters: Record<PaymentProvider, PaymentProviderAdapter>;
  readonly payoutAdapters: Record<PaymentProvider, PayoutProviderAdapter>;
  readonly otpProvider: OtpProvider;
  matchingPaused = false;

  constructor(
    readonly store: InMemoryStore,
    private readonly otpStore: OtpStore,
    private readonly config: AppConfig,
  ) {
    this.otpProvider = createOtpProvider(config);
    const cashfreeConfig = {
      clientId: config.CASHFREE_CLIENT_ID,
      clientSecret: config.CASHFREE_CLIENT_SECRET,
      baseUrl: config.CASHFREE_BASE_URL,
    };

    this.paymentAdapters = {
      cashfree:
        config.CASHFREE_CLIENT_ID &&
        config.CASHFREE_CLIENT_SECRET &&
        (config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION) &&
        !config.EXPLICIT_MOCK_PAYMENTS
          ? new CashfreePaymentProviderAdapter({
              ...cashfreeConfig,
              apiVersion: config.CASHFREE_PAYMENT_API_VERSION || config.CASHFREE_API_VERSION,
            })
          : new MockPaymentProviderAdapter(),
      mock: new MockPaymentProviderAdapter(),
    };

    this.payoutAdapters = {
      cashfree:
        config.CASHFREE_CLIENT_ID &&
        config.CASHFREE_CLIENT_SECRET &&
        (config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION) &&
        !config.EXPLICIT_MOCK_PAYOUTS
          ? new CashfreePayoutProviderAdapter({
              ...cashfreeConfig,
              apiVersion: config.CASHFREE_PAYOUT_API_VERSION || config.CASHFREE_API_VERSION,
            })
          : new MockPayoutProviderAdapter(
              !config.EXPLICIT_MOCK_PAYMENTS && config.EXPLICIT_MOCK_PAYOUTS
                ? {
                    status: "PROCESSING",
                    description: "Payout adapter is in mock mode; no live transfer has been sent.",
                  }
                : undefined,
            ),
      mock: new MockPayoutProviderAdapter(),
    };
  }

  async sendOtp(phone: string) {
    const rateCount = await this.otpStore.incrementRateLimit(phone, OTP_RATE_TTL_SECONDS);
    if (rateCount > OTP_RATE_LIMIT) {
      throw new AppError("otp_rate_limited", "Too many OTP requests. Try again in a few minutes.", 429);
    }

    const code = this.generateOtpCode();
    const session: OtpRecord = {
      sessionId: id("otp"),
      phone,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
      provider: this.otpProvider.channel,
    };
    const delivery = await this.otpProvider.sendOtp({ phone, code });
    session.providerSessionId = delivery.providerSessionId;
    await this.otpStore.set(phone, session, OTP_TTL_SECONDS);
    return {
      sessionId: session.sessionId,
      debugCode: this.config.NODE_ENV === "production" || this.otpProvider.channel !== "mock" ? undefined : code,
    };
  }

  async verifyOtp(phone: string, code: string, name?: string, referralCode?: string) {
    const session = await this.otpStore.get(phone);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      throw new AppError("invalid_otp", "Invalid or expired OTP", 401);
    }

    const valid = await this.otpProvider.verifyOtp({ phone, code, session });
    if (!valid) {
      throw new AppError("invalid_otp", "Invalid or expired OTP", 401);
    }

    const user = this.findOrCreateEndUser(phone, name, referralCode);

    await this.otpStore.delete(phone);
    await this.store.flush();
    return this.buildAuthSession(user);
  }

  async inviteLogin(phone: string, inviteCode: string, name?: string, referralCode?: string) {
    if (!this.config.ENABLE_INVITE_LOGIN || !this.config.INVITE_CODE) {
      throw new AppError("invite_login_disabled", "Invite login is not enabled", 400);
    }

    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    const expectedInviteCode = this.config.INVITE_CODE.trim().toUpperCase();
    if (normalizedInviteCode !== expectedInviteCode) {
      throw new AppError("invalid_invite_code", "Invalid invite code", 401);
    }

    const user = this.findOrCreateEndUser(phone, name, referralCode);
    await this.store.flush();
    return this.buildAuthSession(user);
  }

  loginAdmin(phone: string, password: string): AdminSession {
    const admin = this.store.findUserByPhone(phone);
    if (!admin || (admin.role !== "superadmin" && admin.role !== "operator")) {
      throw new AppError("admin_not_found", "Admin account not found", 404);
    }

    const passwordMatches =
      (admin.role === "superadmin" && phone === this.config.ADMIN_SUPER_PHONE && password === this.config.ADMIN_SUPER_PASSWORD) ||
      (admin.role === "operator" && phone === this.config.ADMIN_OPERATOR_PHONE && password === this.config.ADMIN_OPERATOR_PASSWORD);

    if (!passwordMatches) {
      throw new AppError("invalid_admin_credentials", "Invalid admin credentials", 401);
    }

    return {
      accessToken: this.issueAccessToken(admin, "admin"),
      user: admin,
    };
  }

  getCurrentUser(userId: string) {
    const user = this.mustUser(userId, "user");
    return {
      user,
      walletSummary: this.getWalletSummary(userId),
    };
  }

  getWalletSummary(userId: string): WalletSummary {
    return { ...this.store.getWallet(userId) };
  }

  getWalletTransactions(userId: string) {
    this.assertActiveUser(userId);
    return this.store.walletTransactions.filter((txn) => txn.userId === userId);
  }

  getWalletOverview(userId: string): WalletOverview {
    this.assertActiveUser(userId);
    return {
      walletSummary: this.getWalletSummary(userId),
      explainers: walletBalanceExplainers,
      timeline: this.buildMoneyTimeline(userId),
      withdrawalEligibility: this.getWithdrawalEligibility(userId),
    };
  }

  getWithdrawalEligibility(userId: string, requestedAmount?: number): WithdrawalEligibility {
    const user = this.mustUser(userId, "user");
    const wallet = this.store.getWallet(userId);
    const reasons: WithdrawalEligibility["reasons"] = [];
    const pendingCount = this.listWithdrawalsUnsafe(userId).filter((request) =>
      ["queued_for_review", "approved", "provider_processing"].includes(request.status),
    ).length;

    if (user.blocked) {
      reasons.push({
        code: "blocked_user",
        message: "Your account is blocked from withdrawals right now.",
      });
    }

    if (requestedAmount !== undefined && requestedAmount < DEFAULT_MIN_WITHDRAWAL_AMOUNT) {
      reasons.push({
        code: "minimum_amount_not_met",
        message: `Minimum withdrawal amount is Rs ${DEFAULT_MIN_WITHDRAWAL_AMOUNT}.`,
      });
    }

    if (requestedAmount !== undefined && wallet.withdrawableBalance < requestedAmount) {
      reasons.push({
        code: "insufficient_balance",
        message: "Your cash wallet does not have enough withdrawable balance.",
      });
    }

    if (pendingCount >= DEFAULT_MAX_PENDING_WITHDRAWALS) {
      reasons.push({
        code: "pending_withdrawal_limit",
        message: `You already have ${pendingCount} withdrawals under review.`,
      });
    }

    return {
      eligible: reasons.length === 0,
      requestedAmount,
      availableAmount: wallet.withdrawableBalance,
      minimumAmount: DEFAULT_MIN_WITHDRAWAL_AMOUNT,
      pendingCount,
      maxPendingWithdrawals: DEFAULT_MAX_PENDING_WITHDRAWALS,
      reasons,
    };
  }

  getReferralSummary(userId: string): ReferralSummary {
    this.assertActiveUser(userId);
    return this.store.upsertReferralSummary(userId);
  }

  listTaskPassPlans() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.taskPassPlans.values()).sort((a, b) => a.durationDays - b.durationDays);
  }

  listTaskPasses() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.userTaskPasses.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getCurrentTaskPass(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    return this.getCurrentTaskPassContext(userId);
  }

  async requestTaskPassActivation(userId: string, planId: string, paymentReference?: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const plan = this.mustTaskPassPlan(planId);
    const existing = Array.from(this.store.userTaskPasses.values()).find(
      (taskPass) =>
        taskPass.userId === userId &&
        taskPass.planId === plan.id &&
        (taskPass.status === "pending" || taskPass.status === "active"),
    );
    if (existing) {
      return existing;
    }

    const taskPass: UserTaskPass = {
      id: id("task_pass"),
      userId,
      planId,
      status: "pending",
      paymentReference,
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.userTaskPasses.set(taskPass.id, taskPass);
    await this.store.flush();
    return taskPass;
  }

  async createTaskPassPlan(input: Omit<TaskPassPlan, "id" | "createdAt" | "updatedAt">, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    this.validateTaskPassPlan(input);
    const plan: TaskPassPlan = {
      id: id("plan"),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.store.taskPassPlans.set(plan.id, plan);
    this.audit(adminUserId, "task_pass_plan.create", "task_pass_plan", plan.id, { ...plan });
    await this.store.flush();
    return plan;
  }

  async updateTaskPassPlan(planId: string, patch: Partial<Omit<TaskPassPlan, "id" | "createdAt">>, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const plan = this.mustTaskPassPlan(planId);
    const nextPlan: TaskPassPlan = {
      ...plan,
      ...patch,
      id: plan.id,
      createdAt: plan.createdAt,
      updatedAt: now(),
    };
    this.validateTaskPassPlan(nextPlan);
    this.store.taskPassPlans.set(planId, nextPlan);
    this.audit(adminUserId, "task_pass_plan.update", "task_pass_plan", planId, patch as Record<string, unknown>);
    await this.store.flush();
    return nextPlan;
  }

  async activateTaskPass(taskPassId: string, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const taskPass = this.mustUserTaskPass(taskPassId);
    const nextTaskPass = this.activateTaskPassRecord(taskPass, adminUserId);
    this.audit(adminUserId, "task_pass.activate", "user_task_pass", taskPassId, {
      userId: taskPass.userId,
      planId: taskPass.planId,
    });
    await this.store.flush();
    return nextTaskPass;
  }

  async cancelTaskPass(taskPassId: string, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const taskPass = this.mustUserTaskPass(taskPassId);
    const nextTaskPass: UserTaskPass = {
      ...taskPass,
      status: "cancelled",
      updatedAt: now(),
    };
    this.store.userTaskPasses.set(taskPassId, nextTaskPass);
    this.audit(adminUserId, "task_pass.cancel", "user_task_pass", taskPassId, {
      userId: taskPass.userId,
      planId: taskPass.planId,
    });
    await this.store.flush();
    return nextTaskPass;
  }

  listMilestones() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.rewardMilestones.values()).sort((a, b) => a.requiredDay - b.requiredDay);
  }

  async createMilestone(input: Omit<RewardMilestone, "id" | "createdAt" | "updatedAt">, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    this.mustTaskPassPlan(input.planId);
    const milestone: RewardMilestone = {
      id: id("milestone"),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.store.rewardMilestones.set(milestone.id, milestone);
    this.audit(adminUserId, "milestone.create", "reward_milestone", milestone.id, milestone as unknown as Record<string, unknown>);
    await this.store.flush();
    return milestone;
  }

  async updateMilestone(milestoneId: string, patch: Partial<Omit<RewardMilestone, "id" | "createdAt">>, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const milestone = this.mustMilestone(milestoneId);
    const nextMilestone: RewardMilestone = {
      ...milestone,
      ...patch,
      id: milestone.id,
      createdAt: milestone.createdAt,
      updatedAt: now(),
    };
    this.store.rewardMilestones.set(milestoneId, nextMilestone);
    this.audit(adminUserId, "milestone.update", "reward_milestone", milestoneId, patch as Record<string, unknown>);
    await this.store.flush();
    return nextMilestone;
  }

  listReferralCommissionRules() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.referralCommissionRules.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createReferralCommissionRule(input: Omit<ReferralCommissionRule, "id" | "createdAt" | "updatedAt">, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const rule: ReferralCommissionRule = {
      id: id("referral_rule"),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.store.referralCommissionRules.set(rule.id, rule);
    this.audit(adminUserId, "referral_commission_rule.create", "referral_commission_rule", rule.id, rule as unknown as Record<string, unknown>);
    await this.store.flush();
    return rule;
  }

  async updateReferralCommissionRule(
    ruleId: string,
    patch: Partial<Omit<ReferralCommissionRule, "id" | "createdAt">>,
    adminUserId: string,
  ) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const rule = this.mustReferralCommissionRule(ruleId);
    const nextRule: ReferralCommissionRule = {
      ...rule,
      ...patch,
      id: rule.id,
      createdAt: rule.createdAt,
      updatedAt: now(),
    };
    this.store.referralCommissionRules.set(ruleId, nextRule);
    this.audit(adminUserId, "referral_commission_rule.update", "referral_commission_rule", ruleId, patch as Record<string, unknown>);
    await this.store.flush();
    return nextRule;
  }

  listReferralCommissions() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.referralCommissions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listDailyTasks() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.dailyTasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listAdminDailyAssignments(): AdminDailyAssignment[] {
    this.assertTaskPassEnabled();
    return Array.from(this.store.userDailyTaskAssignments.values())
      .sort((a, b) => {
        const dateOrder = b.date.localeCompare(a.date);
        if (dateOrder !== 0) {
          return dateOrder;
        }
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map((assignment) => {
        const taskPass = this.store.userTaskPasses.get(assignment.taskPassId) ?? null;
        const plan = taskPass ? this.store.taskPassPlans.get(taskPass.planId) ?? null : null;
        return {
          assignment,
          task: this.store.dailyTasks.get(assignment.taskId) ?? null,
          user: this.store.users.get(assignment.userId) ?? null,
          taskPass,
          plan,
        };
      });
  }

  async createDailyTask(input: Omit<DailyTask, "id" | "createdAt" | "updatedAt">, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const task: DailyTask = {
      id: id("daily_task"),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.store.dailyTasks.set(task.id, task);
    this.audit(adminUserId, "daily_task.create", "daily_task", task.id, { ...task });
    await this.store.flush();
    return task;
  }

  async updateDailyTask(taskId: string, patch: Partial<Omit<DailyTask, "id" | "createdAt">>, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const task = this.mustDailyTask(taskId);
    const nextTask: DailyTask = {
      ...task,
      ...patch,
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: now(),
    };
    this.store.dailyTasks.set(task.id, nextTask);
    this.audit(adminUserId, "daily_task.update", "daily_task", task.id, patch as Record<string, unknown>);
    await this.store.flush();
    return nextTask;
  }

  async disableDailyTask(taskId: string, adminUserId: string) {
    return this.updateDailyTask(taskId, { active: false }, adminUserId);
  }

  async assignDailyTasksForUser(userId: string, adminUserId: string, date = this.getTodayDate()) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const context = this.requireActiveTaskPassContext(userId);
    const assignableTasks = this.getAssignableTasksForPlan(context.plan);
    const existingAssignments = this.store.findAssignmentsForUserDate(userId, date);
    const nextAssignments: UserDailyTaskAssignment[] = [];

    for (const task of assignableTasks.slice(0, context.plan.dailyTaskMin)) {
      const duplicate = existingAssignments.find((assignment) => assignment.taskId === task.id);
      if (duplicate) {
        nextAssignments.push(duplicate);
        continue;
      }

      const assignment: UserDailyTaskAssignment = {
        id: id("assignment"),
        userId,
        taskPassId: context.taskPass.id,
        taskId: task.id,
        date,
        status: "assigned",
        rewardTokens: task.rewardTokens,
        createdAt: now(),
      };
      this.store.userDailyTaskAssignments.set(assignment.id, assignment);
      nextAssignments.push(assignment);
    }

    this.audit(adminUserId, "daily_tasks.assign_user", "user", userId, {
      date,
      assignmentCount: nextAssignments.length,
      taskPassId: context.taskPass.id,
    });
    await this.store.flush();
    return nextAssignments;
  }

  async assignDailyTasksForAll(adminUserId: string, date = this.getTodayDate()) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const results: UserDailyTaskAssignment[] = [];
    const activeUsers = Array.from(this.store.users.values()).filter((user) => user.role === "user" && !user.blocked);
    for (const user of activeUsers) {
      const context = this.getCurrentTaskPassContext(user.id);
      if (!context || context.taskPass.status !== "active") {
        continue;
      }
      const assignments = await this.assignDailyTasksForUser(user.id, adminUserId, date);
      results.push(...assignments);
    }
    this.audit(adminUserId, "daily_tasks.assign_all", "daily_assignments", date, { assignmentCount: results.length });
    await this.store.flush();
    return results;
  }

  getDailyOverview(userId: string): DailyOverview {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    this.processDueTaskValidationsForUser(userId);
    const context = this.getCurrentTaskPassContext(userId);
    if (!context) {
      return {
        date: this.getTodayDate(),
        activeTaskPass: null,
        activePlan: null,
        dayNumber: null,
        totalDays: null,
        assignedCount: 0,
        completedCount: 0,
        checkInClaimed: false,
        tokenBalance: {
          ...this.getTokenBalance(userId),
          todayEarned: 0,
          todayCap: 0,
        },
      };
    }

    const assignments = this.getDailyAssignments(userId);
    const completedCount = assignments.filter((assignment) => assignment.status === "claimed").length;
    const checkInClaimed = this.hasDailyCheckIn(userId, context.taskPass.id, this.getTodayDate());
    const tokenBalance = this.getTokenBalance(userId);
    const nextMilestone =
      this.getMilestoneViews(userId).find((item) => item.progress.status !== "claimed") ?? null;

    return {
      date: this.getTodayDate(),
      activeTaskPass: context.taskPass,
      activePlan: context.plan,
      dayNumber: this.getTaskPassDayNumber(context.taskPass),
      totalDays: context.plan.durationDays,
      assignedCount: assignments.length,
      completedCount,
      checkInClaimed,
      tokenBalance,
      nextMilestone,
    };
  }

  claimDailyCheckIn(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const context = this.requireActiveTaskPassContext(userId);
    const date = this.getTodayDate();
    if (this.hasDailyCheckIn(userId, context.taskPass.id, date)) {
      throw new AppError("daily_checkin_already_claimed", "Daily check-in has already been claimed today.", 400);
    }

    this.assertDailyTokenCap(userId, context.plan, 10);
    const checkIn: DailyCheckIn = {
      id: id("checkin"),
      userId,
      taskPassId: context.taskPass.id,
      date,
      rewardTokens: 10,
      claimedAt: now(),
    };
    this.store.dailyCheckIns.unshift(checkIn);
    this.creditTokens(userId, 10, "daily_checkin", checkIn.id);
    return this.store.flush().then(() => checkIn);
  }

  getDailyTasks(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    this.processDueTaskValidationsForUser(userId);
    const context = this.getCurrentTaskPassContext(userId);
    if (!context) {
      return [];
    }

    const taskMap = this.store.dailyTasks;
    return this.getDailyAssignments(userId).map((assignment) => ({
      assignment,
      task: taskMap.get(assignment.taskId)!,
    }));
  }

  async startDailyTask(userId: string, assignmentId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const assignment = this.mustAssignment(assignmentId, userId);
    if (assignment.status !== "assigned") {
      return assignment;
    }
    const nextAssignment: UserDailyTaskAssignment = {
      ...assignment,
      status: "started",
      startedAt: assignment.startedAt ?? now(),
    };
    this.store.userDailyTaskAssignments.set(assignment.id, nextAssignment);
    await this.store.flush();
    return nextAssignment;
  }

  async submitDailyTask(userId: string, assignmentId: string, proof?: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const assignment = this.mustAssignment(assignmentId, userId);
    const task = this.mustDailyTask(assignment.taskId);
    if (assignment.status === "claimed") {
      return assignment;
    }

    const submittedAt = assignment.submittedAt ?? now();

    const nextAssignment: UserDailyTaskAssignment = {
      ...assignment,
      status: "checking",
      proof: proof ?? assignment.proof,
      startedAt: assignment.startedAt ?? (assignment.status === "assigned" ? submittedAt : assignment.startedAt),
      submittedAt,
      approvedAt: undefined,
      rejectedReason: undefined,
    };
    this.store.userDailyTaskAssignments.set(assignment.id, this.processTaskValidation(nextAssignment, task));
    const processed = this.mustAssignment(assignment.id, userId);
    if (processed.status === "approved") {
      await this.maybeUnlockDepositBonusesForUser(userId);
    }
    await this.store.flush();
    return processed;
  }

  async claimDailyTask(userId: string, assignmentId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    this.processDueTaskValidationsForUser(userId);
    const assignment = this.mustAssignment(assignmentId, userId);
    if (assignment.status === "claimed") {
      return assignment;
    }
    if (assignment.status === "checking") {
      throw new AppError("task_checking", "Task checks are running. Please wait 2-3 minutes and refresh.", 400);
    }
    if (assignment.status !== "approved") {
      throw new AppError("task_not_claimable", "This task must be approved before claiming.", 400);
    }

    const context = this.requireActiveTaskPassContext(userId);
    this.assertDailyTokenCap(userId, context.plan, assignment.rewardTokens);
    if (this.store.tokenTransactions.some((transaction) => transaction.referenceId === assignment.id && transaction.reason === "daily_task")) {
      return assignment;
    }

    const nextAssignment: UserDailyTaskAssignment = {
      ...assignment,
      status: "claimed",
      claimedAt: assignment.claimedAt ?? now(),
    };
    this.store.userDailyTaskAssignments.set(assignment.id, nextAssignment);
    this.creditTokens(userId, assignment.rewardTokens, "daily_task", assignment.id);
    this.maybeTriggerReferralCommissionsForTask(userId, assignment.taskId, assignment.id);
    await this.maybeUnlockDepositBonusesForUser(userId);
    await this.store.flush();
    return nextAssignment;
  }

  getTokenBalance(userId: string): TokenBalanceSummary {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const today = this.getTodayDate();
    const wallet = this.store.getWallet(userId);
    const todayCredits = this.store.tokenTransactions.filter(
      (transaction) =>
        transaction.userId === userId &&
        transaction.direction === "credit" &&
        transaction.createdAt.slice(0, 10) === today,
    );
    const activeContext = this.getCurrentTaskPassContext(userId);
    return {
      balance: wallet.withdrawableBalance,
      todayEarned: todayCredits.reduce((sum, transaction) => sum + transaction.amount, 0),
      todayCap: activeContext?.plan.dailyTokenCap ?? 0,
      redeemableTokens: wallet.withdrawableBalance,
      lockedBonusTokens: this.getLockedBonusTokens(userId),
      minimumRedemption: DEFAULT_MIN_REDEMPTION_TOKENS,
      conversionRate: 1,
    };
  }

  getTokenLedger(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    return this.store.tokenTransactions.filter((transaction) => transaction.userId === userId);
  }

  getAdminTokenLedger() {
    this.assertTaskPassEnabled();
    return this.store.tokenTransactions;
  }

  getMilestoneViews(userId: string): UserMilestoneView[] {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const context = this.getCurrentTaskPassContext(userId);
    if (!context) {
      return [];
    }

    const currentDay = this.getTaskPassDayNumber(context.taskPass);
    const completedTasks = this.getCompletedTaskCountForTaskPass(context.taskPass.id);
    return Array.from(this.store.rewardMilestones.values())
      .filter((milestone) => milestone.planId === context.plan.id && milestone.active)
      .sort((a, b) => a.requiredDay - b.requiredDay)
      .map((milestone) => {
        const progress = this.ensureMilestoneProgress(userId, context.taskPass.id, milestone, currentDay, completedTasks);
        return {
          milestone,
          progress,
          currentDay,
          completedTasks,
        };
      });
  }

  async claimMilestone(userId: string, milestoneId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    const context = this.requireActiveTaskPassContext(userId);
    const milestone = this.mustMilestone(milestoneId);
    if (milestone.planId !== context.plan.id) {
      throw new AppError("milestone_not_found", "Milestone not found", 404);
    }
    const currentDay = this.getTaskPassDayNumber(context.taskPass);
    const completedTasks = this.getCompletedTaskCountForTaskPass(context.taskPass.id);
    const progress = this.ensureMilestoneProgress(userId, context.taskPass.id, milestone, currentDay, completedTasks);
    if (progress.status === "claimed") {
      return progress;
    }
    if (progress.status !== "completed") {
      throw new AppError("milestone_not_claimable", "This milestone is not ready to claim yet.", 400);
    }

    const nextProgress: UserMilestoneProgress = {
      ...progress,
      status: "claimed",
      claimedAt: progress.claimedAt ?? now(),
    };
    this.store.userMilestoneProgresses.set(nextProgress.id, nextProgress);
    this.creditTokens(userId, milestone.rewardTokens, "milestone_reward", milestone.id);
    this.maybeTriggerReferralCommissionsForMilestone(userId, milestone.id);
    await this.store.flush();
    return nextProgress;
  }

  getDepositBonuses(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    return Array.from(this.store.depositBonuses.values())
      .filter((bonus) => bonus.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listDepositBonusRules() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.depositBonusRules.values()).sort((a, b) => a.minDepositAmount - b.minDepositAmount);
  }

  async createDepositBonusRule(input: Omit<DepositBonusRule, "id" | "createdAt" | "updatedAt">, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const rule: DepositBonusRule = {
      id: id("deposit_bonus_rule"),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.store.depositBonusRules.set(rule.id, rule);
    this.audit(adminUserId, "deposit_bonus_rule.create", "deposit_bonus_rule", rule.id, rule as unknown as Record<string, unknown>);
    await this.store.flush();
    return rule;
  }

  async updateDepositBonusRule(ruleId: string, patch: Partial<Omit<DepositBonusRule, "id" | "createdAt">>, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const rule = this.mustDepositBonusRule(ruleId);
    const nextRule: DepositBonusRule = {
      ...rule,
      ...patch,
      id: rule.id,
      createdAt: rule.createdAt,
      updatedAt: now(),
    };
    this.store.depositBonusRules.set(ruleId, nextRule);
    this.audit(adminUserId, "deposit_bonus_rule.update", "deposit_bonus_rule", ruleId, patch as Record<string, unknown>);
    await this.store.flush();
    return nextRule;
  }

  getRedemptions(userId: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    return Array.from(this.store.redemptionRequests.values())
      .filter((request) => request.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createRedemptionRequest(userId: string, tokens: number, payoutMethod: RedemptionPayoutMethod, note?: string) {
    this.assertTaskPassEnabled();
    this.assertActiveUser(userId);
    if (!this.config.TOKEN_REDEMPTION_ENABLED) {
      throw new AppError("redemption_disabled", "Redemption is currently disabled.", 400);
    }
    if (tokens < DEFAULT_MIN_REDEMPTION_TOKENS) {
      throw new AppError("minimum_redemption_not_met", `Minimum redemption is ${DEFAULT_MIN_REDEMPTION_TOKENS} tokens.`, 400);
    }
    const available = this.getRedeemableTokenBalance(userId);
    if (available < tokens) {
      throw new AppError("insufficient_token_balance", "You do not have enough redeemable tokens.", 400);
    }

    const request: RedemptionRequest = {
      id: id("redemption"),
      userId,
      tokens,
      valueAmount: tokens,
      status: "pending",
      payoutMethod,
      note,
      createdAt: now(),
    };
    this.store.redemptionRequests.set(request.id, request);
    this.debitTokens(userId, tokens, "redemption", request.id);
    await this.store.flush();
    return request;
  }

  listAdminRedemptions() {
    this.assertTaskPassEnabled();
    return Array.from(this.store.redemptionRequests.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async approveRedemption(redemptionId: string, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustRedemption(redemptionId);
    const nextRequest: RedemptionRequest = {
      ...request,
      status: "approved",
      reviewedAt: now(),
    };
    this.store.redemptionRequests.set(redemptionId, nextRequest);
    this.audit(adminUserId, "redemption.approve", "redemption_request", redemptionId, { userId: request.userId, tokens: request.tokens });
    await this.store.flush();
    return nextRequest;
  }

  async rejectRedemption(redemptionId: string, adminUserId: string, note?: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustRedemption(redemptionId);
    if (request.status === "rejected") {
      return request;
    }
    const nextRequest: RedemptionRequest = {
      ...request,
      status: "rejected",
      note: note ?? request.note,
      reviewedAt: now(),
    };
    this.store.redemptionRequests.set(redemptionId, nextRequest);
    this.creditTokens(request.userId, request.tokens, "admin_adjustment", `redemption_restore:${request.id}`);
    this.audit(adminUserId, "redemption.reject", "redemption_request", redemptionId, { userId: request.userId, tokens: request.tokens, note });
    await this.store.flush();
    return nextRequest;
  }

  async markRedemptionPaid(redemptionId: string, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustRedemption(redemptionId);
    const nextRequest: RedemptionRequest = {
      ...request,
      status: "paid",
      reviewedAt: request.reviewedAt ?? now(),
      paidAt: now(),
    };
    this.store.redemptionRequests.set(redemptionId, nextRequest);
    this.audit(adminUserId, "redemption.mark_paid", "redemption_request", redemptionId, { userId: request.userId, tokens: request.tokens });
    await this.store.flush();
    return nextRequest;
  }

  listAdminTaskSubmissions() {
    this.assertTaskPassEnabled();
    return this.listAdminDailyAssignments().filter((item) =>
      ["checking", "submitted", "approved", "rejected"].includes(item.assignment.status),
    );
  }

  async approveTaskSubmission(assignmentId: string, adminUserId: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const assignment = this.mustAssignment(assignmentId);
    const nextAssignment: UserDailyTaskAssignment = {
      ...assignment,
      status: "approved",
      approvedAt: assignment.approvedAt ?? now(),
      rejectedReason: undefined,
    };
    this.store.userDailyTaskAssignments.set(assignmentId, nextAssignment);
    await this.maybeUnlockDepositBonusesForUser(nextAssignment.userId);
    this.audit(adminUserId, "task_submission.approve", "user_daily_task_assignment", assignmentId, {
      userId: nextAssignment.userId,
      taskId: nextAssignment.taskId,
    });
    await this.store.flush();
    return nextAssignment;
  }

  async rejectTaskSubmission(assignmentId: string, adminUserId: string, reason: string) {
    this.assertTaskPassEnabled();
    this.mustUser(adminUserId, "admin");
    const assignment = this.mustAssignment(assignmentId);
    const nextAssignment: UserDailyTaskAssignment = {
      ...assignment,
      status: "rejected",
      rejectedReason: reason,
    };
    this.store.userDailyTaskAssignments.set(assignmentId, nextAssignment);
    this.audit(adminUserId, "task_submission.reject", "user_daily_task_assignment", assignmentId, {
      userId: nextAssignment.userId,
      taskId: nextAssignment.taskId,
      reason,
    });
    await this.store.flush();
    return nextAssignment;
  }

  listUserDeposits(userId: string) {
    this.assertActiveUser(userId);
    return this.listUserDepositsUnsafe(userId);
  }

  async createDeposit(userId: string, amount: number, provider: PaymentProvider, taskPassPlanId?: string): Promise<DepositOrder> {
    const user = this.mustUser(userId, "user");
    this.assertActiveUser(userId);
    if (this.config.NODE_ENV === "production" && provider === "mock") {
      throw new AppError("unsupported_provider", "Mock provider is disabled in production", 400);
    }
    if (taskPassPlanId) {
      const plan = this.mustTaskPassPlan(taskPassPlanId);
      if (!plan.active) {
        throw new AppError("task_pass_plan_inactive", "The selected Task Pass is not active.", 400);
      }
      if (!Number.isFinite(amount) || amount < plan.priceAmount) {
        throw new AppError("task_pass_price_required", `Task Pass payment must be at least ${plan.priceAmount}.`, 400);
      }
    } else if (!Number.isFinite(amount) || amount < 100) {
      throw new AppError("min_deposit_amount", "Minimum deposit amount is 100", 400);
    }

    const depositId = id("dep");
    const adapter = this.paymentAdapters[provider];
    if (!adapter) {
      throw new AppError("unsupported_provider", "Unsupported deposit provider", 400);
    }

    const checkout = await adapter.createDepositOrder({
      depositId,
      amount,
      provider,
      customer: {
        customerId: user.id,
        customerPhone: user.phone,
        customerName: user.name,
      },
    });

    const deposit: DepositOrder = {
      id: depositId,
      userId,
      amount,
      provider,
      status: "payment_pending",
      checkoutUrl: checkout.checkoutUrl,
      providerOrderId: checkout.providerOrderId,
      checkoutSession: checkout,
      taskPassPlanId,
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.depositOrders.set(deposit.id, deposit);
    this.store.addDepositProviderEvent(deposit.id, checkout.provider, "deposit.created", {
      checkout,
    });
    await this.store.flush();
    return deposit;
  }

  async confirmDeposit(depositId: string): Promise<DepositOrder> {
    const deposit = this.mustDeposit(depositId);
    if (deposit.status === "paid" || deposit.status === "verified" || deposit.status === "reward_credited") {
      await this.ensureTaskPassDepositSideEffects(deposit);
      await this.store.flush();
      return deposit;
    }

    const provider = this.paymentAdapters[(deposit.provider as PaymentProvider) ?? "mock"];
    const verification = await provider.verifyPayment(deposit);
    if (!verification.successful) {
      throw new AppError("payment_verification_failed", "Payment verification failed", 400);
    }

    const wallet = this.store.getWallet(deposit.userId);
    const stageAlreadyApplied = (eventType: string) => this.store.hasDepositProviderEvent(deposit.id, eventType);

    if (!stageAlreadyApplied("deposit.lifecycle.principal_credited")) {
      deposit.status = "paid";
      if (deposit.taskPassPlanId) {
        this.store.addWalletTransaction(deposit.userId, "task_pass_purchase", -deposit.amount, {
          depositId: deposit.id,
          provider: deposit.provider,
          taskPassPlanId: deposit.taskPassPlanId,
        });
      } else {
        wallet.principalBalance += deposit.amount;
        wallet.withdrawableBalance += deposit.amount;
        this.store.addWalletTransaction(deposit.userId, "deposit_principal", deposit.amount, {
          depositId: deposit.id,
          provider: deposit.provider,
        });
      }
      wallet.updatedAt = now();
      this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.lifecycle.principal_credited", {
        amount: deposit.amount,
        mode: deposit.taskPassPlanId ? "task_pass_purchase" : "cash_wallet",
      });
    }

    deposit.status = "verified";
    deposit.updatedAt = now();
    if (!stageAlreadyApplied("deposit.lifecycle.reward_credited")) {
      this.applyReward(deposit);
      this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.lifecycle.reward_credited", {
        amount: deposit.amount,
      });
    }

    await this.ensureTaskPassDepositSideEffects(deposit);
    deposit.status = "reward_credited";
    deposit.updatedAt = now();
    await this.store.flush();
    return deposit;
  }

  async syncDepositStatus(depositId: string, userId?: string) {
    const deposit = this.mustDeposit(depositId);
    if (userId && deposit.userId !== userId) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }

    if (deposit.status === "paid" || deposit.status === "verified" || deposit.status === "reward_credited") {
      return this.confirmDeposit(deposit.id);
    }

    const provider = this.paymentAdapters[(deposit.provider as PaymentProvider) ?? "mock"];
    const verification = await provider.verifyPayment(deposit);
    this.store.addDepositProviderEvent(deposit.id, provider.provider, "deposit.status_sync", {
      verified: verification.successful,
      terminal: verification.terminal,
      providerStatus: verification.providerStatus,
      description: verification.description,
      statusBefore: deposit.status,
    });

    if (verification.successful) {
      if (
        this.store.hasDepositProviderEvent(deposit.id, "deposit.status_sync", (event) => event.payload.verificationKey === "success_terminal")
      ) {
        return this.confirmDeposit(deposit.id);
      }
      this.store.addDepositProviderEvent(deposit.id, provider.provider, "deposit.status_sync", {
        verificationKey: "success_terminal",
      });
      return this.confirmDeposit(deposit.id);
    }

    if (verification.terminal) {
      deposit.status = this.resolveFailedDepositStatus(verification.providerStatus);
      deposit.updatedAt = now();
      await this.store.flush();
      return deposit;
    }

    if (deposit.status !== "payment_pending") {
      deposit.status = "payment_pending";
      deposit.updatedAt = now();
    }

    if (!verification.successful) {
      await this.store.flush();
      return deposit;
    }
  }

  async cancelDeposit(depositId: string, userId: string) {
    const deposit = this.mustDeposit(depositId);
    if (deposit.userId !== userId) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }
    if (deposit.status === "paid" || deposit.status === "verified" || deposit.status === "reward_credited") {
      throw new AppError("deposit_not_cancellable", "This payment is already processed and cannot be cancelled.", 400);
    }

    const statusBefore = deposit.status;
    deposit.status = "cancelled";
    deposit.updatedAt = now();
    this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.cancelled", {
      statusBefore,
    });
    await this.store.flush();
    return deposit;
  }

  async handlePaymentWebhook(provider: PaymentProvider, payload: Record<string, unknown>) {
    const adapter = this.paymentAdapters[provider];
    if (!adapter) {
      throw new AppError("unsupported_provider", "Unsupported webhook provider", 400);
    }

    const resolved = await adapter.resolveWebhook(payload);
    const deposit = Array.from(this.store.depositOrders.values()).find(
      (candidate) => candidate.providerOrderId === resolved.providerOrderId || candidate.id === resolved.providerOrderId,
    );

    if (!deposit) {
      throw new AppError("deposit_not_found", "Deposit not found for webhook payload", 404);
    }

    const idempotencyKey = this.getWebhookIdempotencyKey(provider, payload, resolved.providerOrderId);
    if (
      idempotencyKey &&
      this.store.hasDepositProviderEvent(deposit.id, "deposit.webhook", (event) => event.payload.idempotencyKey === idempotencyKey)
    ) {
      return deposit;
    }
    this.store.addDepositProviderEvent(deposit.id, provider, "deposit.webhook", payload);
    if (idempotencyKey) {
      this.store.addDepositProviderEvent(deposit.id, provider, "deposit.webhook", { idempotencyKey });
    }

    if (!resolved.successful) {
      await this.store.flush();
      return deposit;
    }

    return this.confirmDeposit(deposit.id);
  }

  async createBeneficiary(
    userId: string,
    input: Omit<WithdrawBeneficiary, "id" | "userId" | "createdAt">,
  ): Promise<WithdrawBeneficiary> {
    this.assertActiveUser(userId);
    const beneficiary: WithdrawBeneficiary = {
      id: id("beneficiary"),
      userId,
      createdAt: now(),
      ...input,
    };

    const payoutAdapter = this.resolvePayoutAdapter();
    if (!payoutAdapter.validateDestination(beneficiary)) {
      throw new AppError("invalid_beneficiary", "Invalid payout destination", 400);
    }

    this.store.withdrawBeneficiaries.set(beneficiary.id, beneficiary);
    await this.store.flush();
    return beneficiary;
  }

  listBeneficiaries(userId: string) {
    this.assertActiveUser(userId);
    return Array.from(this.store.withdrawBeneficiaries.values()).filter((item) => item.userId === userId);
  }

  async createWithdrawal(userId: string, beneficiaryId: string, amount: number): Promise<WithdrawRequest> {
    this.assertActiveUser(userId);
    const beneficiary = this.store.withdrawBeneficiaries.get(beneficiaryId);
    if (!beneficiary || beneficiary.userId !== userId) {
      throw new AppError("beneficiary_not_found", "Beneficiary not found", 404);
    }
    const eligibility = this.getWithdrawalEligibility(userId, amount);
    if (!eligibility.eligible) {
      const firstReason = eligibility.reasons[0];
      throw new AppError(firstReason.code, firstReason.message, 400, {
        eligibility,
      });
    }
    const wallet = this.store.getWallet(userId);

    wallet.withdrawableBalance -= amount;
    wallet.lockedBalance += amount;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(userId, "withdraw_request", -amount, { beneficiaryId });

    const request: WithdrawRequest = {
      id: id("withdraw"),
      userId,
      beneficiaryId,
      amount,
      status: "queued_for_review",
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.withdrawRequests.set(request.id, request);
    await this.store.flush();
    return request;
  }

  listWithdrawals(userId: string) {
    this.assertActiveUser(userId);
    return this.listWithdrawalsUnsafe(userId);
  }

  listAllWithdrawals() {
    return Array.from(this.store.withdrawRequests.values());
  }

  async approveWithdrawal(withdrawalId: string, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustWithdrawal(withdrawalId);
    const wallet = this.store.getWallet(request.userId);
    const beneficiary = this.store.withdrawBeneficiaries.get(request.beneficiaryId);
    if (!beneficiary) {
      throw new AppError("beneficiary_not_found", "Withdrawal beneficiary not found", 404);
    }

    request.status = "approved";
    request.updatedAt = now();
    this.audit(adminUserId, "withdrawal.approve", "withdraw_request", request.id, { amount: request.amount });

    const payout = await this.resolvePayoutAdapter().createPayout({ withdrawal: request, beneficiary });
    request.providerReference = payout.providerReference;
    request.providerStatus = payout.status;

    if (payout.status === "SUCCESS") {
      request.status = "paid";
      wallet.soldBalance -= request.amount;
      wallet.lockedBalance -= request.amount;
    } else if (payout.status === "FAILED") {
      request.status = "reversed";
      wallet.withdrawableBalance += request.amount;
      wallet.lockedBalance -= request.amount;
      this.store.addWalletTransaction(request.userId, "withdraw_reversal", request.amount, {
        reason: payout.description,
      });
    } else {
      request.status = "provider_processing";
    }
    wallet.updatedAt = now();
    request.updatedAt = now();
    this.audit(adminUserId, `withdrawal.${request.status}`, "withdraw_request", request.id, {
      provider: payout.provider,
      providerReference: payout.providerReference,
      status: payout.status,
      description: payout.description,
    });
    await this.store.flush();
    return request;
  }

  async rejectWithdrawal(withdrawalId: string, adminUserId: string, reason: string) {
    this.mustUser(adminUserId, "admin");
    const request = this.mustWithdrawal(withdrawalId);
    const wallet = this.store.getWallet(request.userId);
    request.status = "rejected";
    request.updatedAt = now();
    wallet.withdrawableBalance += request.amount;
    wallet.lockedBalance -= request.amount;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(request.userId, "withdraw_reversal", request.amount, { reason });
    this.audit(adminUserId, "withdrawal.reject", "withdraw_request", request.id, { reason });
    await this.store.flush();
    return request;
  }

  listUsers() {
    return Array.from(this.store.users.values()).filter((user) => user.role === "user");
  }

  async setUserBlocked(userId: string, blocked: boolean, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    const user = this.store.users.get(userId);
    if (!user) {
      throw new AppError("user_not_found", "User not found", 404);
    }
    user.blocked = blocked;
    this.audit(adminUserId, blocked ? "user.block" : "user.unblock", "user", userId, { blocked });
    await this.store.flush();
    return user;
  }

  listDeposits() {
    return Array.from(this.store.depositOrders.values());
  }

  listRewardRules() {
    return Array.from(this.store.rewardRules.values());
  }

  async replaceRewardRules(rules: RewardRule[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.validateRewardRules(rules);
    this.store.rewardRules.clear();
    for (const rule of rules) {
      this.store.rewardRules.set(rule.id, rule);
    }
    this.audit(adminUserId, "reward_rules.replace", "reward_rule", "bulk", { count: rules.length });
    await this.store.flush();
    return this.listRewardRules();
  }

  listChunkBuckets(): ChunkBucket[] {
    return this.store.getChunkBuckets();
  }

  async replaceChunkBuckets(buckets: ChunkBucket[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.store.rewardChunkBuckets.clear();
    for (const bucket of buckets) {
      this.store.rewardChunkBuckets.set(bucket.id, bucket);
    }
    this.audit(adminUserId, "chunk_buckets.replace", "chunk_bucket", "bulk", { count: buckets.length });
    await this.store.flush();
    return this.listChunkBuckets();
  }

  listDemandPools(): DemandPool[] {
    return Array.from(this.store.demandPools.values());
  }

  async replaceDemandPools(pools: DemandPool[], adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.store.demandPools.clear();
    for (const pool of pools) {
      this.store.demandPools.set(pool.id, pool);
    }
    this.audit(adminUserId, "demand_pools.replace", "demand_pool", "bulk", { count: pools.length });
    await this.store.flush();
    return this.listDemandPools();
  }

  getGames(): GameDefinition[] {
    return this.store.games;
  }

  async playGame(userId: string, gameId: GameDefinition["id"]) {
    this.assertActiveUser(userId);
    const game = this.store.games.find((entry) => entry.id === gameId);
    if (!game) {
      throw new AppError("game_not_found", "Game not found", 404);
    }
    const wallet = this.store.getWallet(userId);
    if (wallet.rewardBalance + wallet.principalBalance < game.entryFee) {
      throw new AppError("insufficient_playable_balance", "Insufficient playable balance", 400);
    }

    if (wallet.rewardBalance >= game.entryFee) {
      wallet.rewardBalance -= game.entryFee;
    } else {
      const remainingEntry = game.entryFee - wallet.rewardBalance;
      wallet.rewardBalance = 0;
      wallet.principalBalance = Math.max(0, wallet.principalBalance - remainingEntry);
    }
    this.store.addWalletTransaction(userId, "game_entry", -game.entryFee, { gameId });

    const reward = Math.floor(Math.random() * (game.maxReward - game.minReward + 1)) + game.minReward;
    wallet.rewardBalance += reward;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(userId, "game_payout", reward, { gameId });
    await this.store.flush();

    return {
      game,
      reward,
      wallet: this.getWalletSummary(userId),
    };
  }

  async runMatchingCycle() {
    if (this.matchingPaused) {
      return;
    }

    for (const pool of this.listDemandPools()) {
      if (pool.active && pool.remainingAmount <= 0) {
        pool.remainingAmount = pool.requestedAmount;
      }
    }

    let mutated = false;
    const demandPools = this.listDemandPools()
      .filter((pool) => pool.active && pool.remainingAmount > 0)
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

    for (const pool of demandPools) {
      const chunks = Array.from(this.store.sellOrderChunks.values())
        .filter((chunk) => chunk.bucketId === pool.bucketId && chunk.remainingAmount > 0)
        .sort((a, b) => a.listedAt.localeCompare(b.listedAt));

      for (const chunk of chunks) {
        if (pool.remainingAmount <= 0) {
          break;
        }
        const fill = Math.min(pool.remainingAmount, chunk.remainingAmount);
        if (fill <= 0) {
          continue;
        }
        chunk.remainingAmount -= fill;
        pool.remainingAmount -= fill;
        mutated = true;

        const wallet = this.store.getWallet(chunk.userId);
        wallet.listedBalance -= fill;
        wallet.soldBalance += fill;
        wallet.withdrawableBalance += fill;
        wallet.updatedAt = now();

        const sellOrder = this.store.sellOrders.get(chunk.sellOrderId);
        if (sellOrder) {
          sellOrder.soldAmount += fill;
          sellOrder.status = sellOrder.soldAmount >= sellOrder.totalAmount ? "sold" : "partially_sold";
        }

        const match: TradeMatch = {
          id: id("match"),
          sellOrderChunkId: chunk.id,
          demandPoolId: pool.id,
          userId: chunk.userId,
          amount: fill,
          createdAt: now(),
        };
        this.store.tradeMatches.unshift(match);
        this.store.addWalletTransaction(chunk.userId, "chunk_match", fill, {
          demandPoolId: pool.id,
          chunkId: chunk.id,
        });
      }
    }

    if (mutated) {
      await this.store.flush();
    }
  }

  getPlatformSnapshot() {
    return {
      deposits: this.listDeposits(),
      demandPools: this.listDemandPools(),
      rewardRules: this.listRewardRules(),
      chunkBuckets: this.listChunkBuckets(),
      withdrawals: this.listAllWithdrawals(),
      matchingPaused: this.matchingPaused,
    };
  }

  async setMatchingPaused(paused: boolean, adminUserId: string) {
    this.mustUser(adminUserId, "admin");
    this.matchingPaused = paused;
    this.audit(adminUserId, paused ? "matching.pause" : "matching.resume", "matching_engine", "default", { paused });
    await this.store.flush();
    return this.matchingPaused;
  }

  listAuditLogs() {
    return this.store.adminAuditLogs;
  }

  getAdminRiskReport(): AdminRiskReport {
    const users = this.listUsers();
    return {
      users: Object.fromEntries(users.map((user) => [user.id, this.buildUserRiskIndicator(user.id)])),
      deposits: Object.fromEntries(this.listDeposits().map((deposit) => [deposit.id, this.buildDepositRiskIndicator(deposit)])),
      withdrawals: Object.fromEntries(
        this.listAllWithdrawals().map((withdrawal) => [withdrawal.id, this.buildWithdrawalRiskIndicator(withdrawal)]),
      ),
    };
  }

  getReconciliationReport(): ReconciliationReport {
    const entries: ReconciliationEntry[] = [];
    for (const deposit of this.listDeposits()) {
      const successfulSyncSeen = this.store.hasDepositProviderEvent(
        deposit.id,
        "deposit.status_sync",
        (event) => event.payload.verified === true || event.payload.verificationKey === "success_terminal",
      );
      const webhookSuccessSeen = this.store.hasDepositProviderEvent(
        deposit.id,
        "deposit.webhook",
        (event) => {
          const paymentStatus =
            (event.payload.payment_status as string | undefined) ??
            (event.payload.type as string | undefined) ??
            ((event.payload.data as { payment?: { payment_status?: string } } | undefined)?.payment?.payment_status);
          return ["SUCCESS", "PAID", "PAYMENT_SUCCESS_WEBHOOK"].includes(String(paymentStatus ?? "").toUpperCase());
        },
      );

      if ((successfulSyncSeen || webhookSuccessSeen) && deposit.status !== "listed") {
        entries.push({
          id: `recon_sync_${deposit.id}`,
          kind: "provider_paid_app_pending",
          depositId: deposit.id,
          userId: deposit.userId,
          amount: deposit.amount,
          status: deposit.status,
          note: "Provider confirmation exists but the app has not fully listed this deposit yet.",
          createdAt: deposit.createdAt,
          updatedAt: deposit.updatedAt,
        });
      }

      if (deposit.status === "listed" && !successfulSyncSeen && !webhookSuccessSeen) {
        entries.push({
          id: `recon_provider_${deposit.id}`,
          kind: "listed_without_provider_success",
          depositId: deposit.id,
          userId: deposit.userId,
          amount: deposit.amount,
          status: deposit.status,
          note: "App marked this deposit as listed without a recorded provider success event.",
          createdAt: deposit.createdAt,
          updatedAt: deposit.updatedAt,
        });
      }
    }

    return { entries };
  }

  getProviderStatus() {
    const paymentsLive =
      Boolean(
        this.config.CASHFREE_CLIENT_ID &&
          this.config.CASHFREE_CLIENT_SECRET &&
          (this.config.CASHFREE_PAYMENT_API_VERSION || this.config.CASHFREE_API_VERSION),
      ) &&
      !this.config.EXPLICIT_MOCK_PAYMENTS;

    const payoutsLive =
      Boolean(
        this.config.CASHFREE_CLIENT_ID &&
          this.config.CASHFREE_CLIENT_SECRET &&
          (this.config.CASHFREE_PAYOUT_API_VERSION || this.config.CASHFREE_API_VERSION),
      ) &&
      !this.config.EXPLICIT_MOCK_PAYOUTS;

    return {
      cashfree: {
        paymentsLive,
        payoutsLive,
        baseUrl: this.config.CASHFREE_BASE_URL,
        paymentApiVersion: this.config.CASHFREE_PAYMENT_API_VERSION || this.config.CASHFREE_API_VERSION || null,
        payoutApiVersion: this.config.CASHFREE_PAYOUT_API_VERSION || this.config.CASHFREE_API_VERSION || null,
      },
      fallbackMode: !paymentsLive || !payoutsLive,
      storageMode: this.config.DATABASE_URL ? "postgres" : this.config.STATE_FILE_PATH ? "file" : "memory",
      otpMode: this.config.REDIS_URL ? "redis" : this.config.OTP_STATE_FILE_PATH ? "file" : "memory",
      memoryInfrastructure: this.config.ALLOW_MEMORY_INFRASTRUCTURE,
      databaseConfigured: Boolean(this.config.DATABASE_URL),
      redisConfigured: Boolean(this.config.REDIS_URL),
      otpProvider: this.otpProvider.channel,
      authMode: this.config.ENABLE_INVITE_LOGIN ? "invite" : "otp",
    };
  }

  async consumeRateLimit(scope: string, key: string, ttlSeconds: number, limit: number) {
    const count = await this.otpStore.incrementScopedRateLimit(scope, key, ttlSeconds);
    if (count > limit) {
      throw new AppError("rate_limited", "Too many requests. Please try again shortly.", 429, {
        scope,
        retryAfterSeconds: ttlSeconds,
      });
    }
  }

  private assertTaskPassEnabled() {
    if (!this.config.TASK_PASS_ENABLED) {
      throw new AppError("task_pass_disabled", "Task Pass is not enabled right now.", 400);
    }
  }

  private mustTaskPassPlan(planId: string) {
    const plan = this.store.taskPassPlans.get(planId);
    if (!plan) {
      throw new AppError("task_pass_plan_not_found", "Task Pass plan not found.", 404);
    }
    return plan;
  }

  private mustUserTaskPass(taskPassId: string) {
    const taskPass = this.store.userTaskPasses.get(taskPassId);
    if (!taskPass) {
      throw new AppError("task_pass_not_found", "Task Pass request not found.", 404);
    }
    return taskPass;
  }

  private mustDailyTask(taskId: string) {
    const task = this.store.dailyTasks.get(taskId);
    if (!task) {
      throw new AppError("daily_task_not_found", "Daily task not found.", 404);
    }
    return task;
  }

  private mustAssignment(assignmentId: string, userId?: string) {
    const assignment = this.store.userDailyTaskAssignments.get(assignmentId);
    if (!assignment || (userId && assignment.userId !== userId)) {
      throw new AppError("assignment_not_found", "Task assignment not found.", 404);
    }
    return assignment;
  }

  private processDueTaskValidationsForUser(userId: string) {
    let changed = false;
    for (const assignment of this.store.userDailyTaskAssignments.values()) {
      if (assignment.userId !== userId || assignment.status !== "checking") {
        continue;
      }
      const task = this.store.dailyTasks.get(assignment.taskId);
      if (!task) {
        continue;
      }
      const processed = this.processTaskValidation(assignment, task);
      if (processed !== assignment) {
        this.store.userDailyTaskAssignments.set(assignment.id, processed);
        changed = true;
      }
    }
    if (changed) {
      void this.store.flush();
    }
  }

  private processTaskValidation(assignment: UserDailyTaskAssignment, task: DailyTask) {
    if (assignment.status !== "checking" || !assignment.submittedAt) {
      return assignment;
    }
    const submittedAt = new Date(assignment.submittedAt).getTime();
    if (Date.now() - submittedAt < this.getTaskValidationDelayMs()) {
      return assignment;
    }

    const validation = this.validateTaskSubmission(assignment, task);
    if (!validation.valid) {
      return {
        ...assignment,
        status: "rejected" as const,
        rejectedReason: validation.reason,
      };
    }

    return {
      ...assignment,
      status: "approved" as const,
      approvedAt: assignment.approvedAt ?? now(),
      rejectedReason: undefined,
    };
  }

  private validateTaskSubmission(assignment: UserDailyTaskAssignment, task: DailyTask) {
    if (!assignment.startedAt) {
      return { valid: false, reason: "Task must be started before submission." };
    }
    const startedAt = new Date(assignment.startedAt).getTime();
    const submittedAt = assignment.submittedAt ? new Date(assignment.submittedAt).getTime() : Date.now();
    if (submittedAt - startedAt < this.getTaskMinimumDwellMs()) {
      return { valid: false, reason: "Task was submitted too quickly. Please complete the required task before submitting." };
    }

    const proof = (assignment.proof ?? "").trim();
    if (task.type === "manual" || task.type === "proof_upload") {
      if (proof.length < 8) {
        return { valid: false, reason: "Proof is too short. Add a clear note or proof link." };
      }
    }
    if (task.type === "quiz") {
      if (!proof || !/(answer|option|[a-dA-D]|\d)/.test(proof)) {
        return { valid: false, reason: "Quiz answer is missing or not recognizable." };
      }
    }

    return { valid: true };
  }

  private getTaskValidationDelayMs() {
    return this.config.NODE_ENV === "test" ? 0 : TASK_VALIDATION_DELAY_MS;
  }

  private getTaskMinimumDwellMs() {
    return this.config.NODE_ENV === "test" ? 0 : MIN_TASK_DWELL_MS;
  }

  private validateTaskPassPlan(plan: Omit<TaskPassPlan, "id" | "createdAt" | "updatedAt"> | TaskPassPlan) {
    if (plan.durationDays <= 0 || plan.dailyTaskMin <= 0 || plan.dailyTaskMax <= 0 || plan.dailyTokenCap <= 0) {
      throw new AppError("invalid_task_pass_plan", "Task Pass plan values must be positive.", 400);
    }
    if (plan.dailyTaskMin > plan.dailyTaskMax) {
      throw new AppError("invalid_task_pass_plan", "Daily task min cannot exceed daily task max.", 400);
    }
    if (plan.targetTokens < 0 || plan.priceAmount < 0) {
      throw new AppError("invalid_task_pass_plan", "Target tokens and price amount must be non-negative.", 400);
    }
  }

  private getCurrentTaskPassContext(userId: string, referenceDate = now()) {
    const taskPass = this.store.findActiveTaskPass(userId, referenceDate);
    if (!taskPass) {
      return null;
    }
    const plan = this.store.taskPassPlans.get(taskPass.planId);
    if (!plan || !plan.active) {
      return null;
    }
    return { taskPass, plan };
  }

  private requireActiveTaskPassContext(userId: string, referenceDate = now()) {
    const context = this.getCurrentTaskPassContext(userId, referenceDate);
    if (!context) {
      throw new AppError("task_pass_required", "You need an active Task Pass for this action.", 400);
    }
    return context;
  }

  private activateTaskPassRecord(taskPass: UserTaskPass, adminUserId?: string) {
    const plan = this.mustTaskPassPlan(taskPass.planId);
    const startsAt = now();
    const endsAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

    for (const existing of this.store.userTaskPasses.values()) {
      if (existing.userId === taskPass.userId && existing.id !== taskPass.id && existing.status === "active") {
        existing.status = "expired";
        existing.updatedAt = now();
      }
    }

    const nextTaskPass: UserTaskPass = {
      ...taskPass,
      status: "active",
      startsAt,
      endsAt,
      activatedByAdminId: adminUserId ?? taskPass.activatedByAdminId,
      updatedAt: now(),
    };
    this.store.userTaskPasses.set(taskPass.id, nextTaskPass);
    return nextTaskPass;
  }

  private getAssignableTasksForPlan(plan: TaskPassPlan) {
    return Array.from(this.store.dailyTasks.values())
      .filter((task) => task.active && task.type !== "checkin")
      .sort((a, b) => {
        if (b.rewardTokens !== a.rewardTokens) {
          return b.rewardTokens - a.rewardTokens;
        }
        return a.createdAt.localeCompare(b.createdAt);
      })
      .slice(0, plan.dailyTaskMax);
  }

  private getTodayDate() {
    return now().slice(0, 10);
  }

  private getTaskPassDayNumber(taskPass: UserTaskPass) {
    if (!taskPass.startsAt) {
      return null;
    }
    const startsAt = new Date(taskPass.startsAt);
    const today = new Date(this.getTodayDate());
    return Math.max(1, Math.floor((today.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }

  private hasDailyCheckIn(userId: string, taskPassId: string, date: string) {
    return this.store.dailyCheckIns.some(
      (checkIn) => checkIn.userId === userId && checkIn.taskPassId === taskPassId && checkIn.date === date,
    );
  }

  private getDailyAssignments(userId: string, date = this.getTodayDate()) {
    return this.store
      .findAssignmentsForUserDate(userId, date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private creditTokens(
    userId: string,
    amount: number,
    reason: TokenTransaction["reason"],
    referenceId: string,
  ) {
    const existing = this.store.tokenTransactions.find(
      (transaction) =>
        transaction.userId === userId &&
        transaction.direction === "credit" &&
        transaction.reason === reason &&
        transaction.referenceId === referenceId,
    );
    if (existing) {
      return existing;
    }
    const wallet = this.store.getWallet(userId);
    wallet.withdrawableBalance += amount;
    wallet.updatedAt = now();
    return this.store.addTokenTransaction(userId, amount, "credit", reason, referenceId, wallet.withdrawableBalance);
  }

  private assertDailyTokenCap(userId: string, plan: TaskPassPlan, nextCreditAmount: number) {
    const today = this.getTodayDate();
    const alreadyEarned = this.store.tokenTransactions
      .filter(
        (transaction) =>
          transaction.userId === userId &&
          transaction.direction === "credit" &&
          transaction.createdAt.slice(0, 10) === today,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    if (alreadyEarned + nextCreditAmount > plan.dailyTokenCap) {
      throw new AppError("daily_token_cap_reached", "Today's token cap has already been reached.", 400, {
        dailyTokenCap: plan.dailyTokenCap,
      });
    }
  }

  private getCompletedTaskCountForTaskPass(taskPassId: string) {
    return Array.from(this.store.userDailyTaskAssignments.values()).filter(
      (assignment) => assignment.taskPassId === taskPassId && assignment.status === "claimed",
    ).length;
  }

  private ensureMilestoneProgress(
    userId: string,
    taskPassId: string,
    milestone: RewardMilestone,
    currentDay: number | null,
    completedTasks: number,
  ) {
    const existing = Array.from(this.store.userMilestoneProgresses.values()).find(
      (progress) => progress.userId === userId && progress.taskPassId === taskPassId && progress.milestoneId === milestone.id,
    );
    const shouldComplete =
      currentDay !== null && currentDay >= milestone.requiredDay && completedTasks >= milestone.requiredCompletedTasks;

    if (!existing) {
      const progress: UserMilestoneProgress = {
        id: id("milestone_progress"),
        userId,
        taskPassId,
        milestoneId: milestone.id,
        status: shouldComplete ? "completed" : "pending",
        completedAt: shouldComplete ? now() : undefined,
      };
      this.store.userMilestoneProgresses.set(progress.id, progress);
      return progress;
    }

    if (existing.status === "pending" && shouldComplete) {
      const nextProgress: UserMilestoneProgress = {
        ...existing,
        status: "completed",
        completedAt: existing.completedAt ?? now(),
      };
      this.store.userMilestoneProgresses.set(nextProgress.id, nextProgress);
      return nextProgress;
    }
    return existing;
  }

  private getRedeemableTokenBalance(userId: string) {
    return this.store.getWallet(userId).withdrawableBalance;
  }

  private getLockedBonusTokens(userId: string) {
    return Array.from(this.store.depositBonuses.values())
      .filter((bonus) => bonus.userId === userId && bonus.status === "locked")
      .reduce((sum, bonus) => sum + bonus.bonusTokens, 0);
  }

  private getTokenBalanceForUserUnsafe(userId: string) {
    return this.store.tokenTransactions
      .filter((transaction) => transaction.userId === userId)
      .reduce((sum, transaction) => sum + (transaction.direction === "credit" ? transaction.amount : -transaction.amount), 0);
  }

  private debitTokens(
    userId: string,
    amount: number,
    reason: TokenTransaction["reason"],
    referenceId: string,
  ) {
    const existing = this.store.tokenTransactions.find(
      (transaction) =>
        transaction.userId === userId &&
        transaction.direction === "debit" &&
        transaction.reason === reason &&
        transaction.referenceId === referenceId,
    );
    if (existing) {
      return existing;
    }
    const wallet = this.store.getWallet(userId);
    wallet.withdrawableBalance = Math.max(0, wallet.withdrawableBalance - amount);
    wallet.updatedAt = now();
    return this.store.addTokenTransaction(userId, amount, "debit", reason, referenceId, wallet.withdrawableBalance);
  }

  private mustMilestone(milestoneId: string) {
    const milestone = this.store.rewardMilestones.get(milestoneId);
    if (!milestone) {
      throw new AppError("milestone_not_found", "Milestone not found", 404);
    }
    return milestone;
  }

  private mustDepositBonusRule(ruleId: string) {
    const rule = this.store.depositBonusRules.get(ruleId);
    if (!rule) {
      throw new AppError("deposit_bonus_rule_not_found", "Deposit bonus rule not found", 404);
    }
    return rule;
  }

  private mustReferralCommissionRule(ruleId: string) {
    const rule = this.store.referralCommissionRules.get(ruleId);
    if (!rule) {
      throw new AppError("referral_commission_rule_not_found", "Referral commission rule not found", 404);
    }
    return rule;
  }

  private mustRedemption(redemptionId: string) {
    const request = this.store.redemptionRequests.get(redemptionId);
    if (!request) {
      throw new AppError("redemption_not_found", "Redemption request not found", 404);
    }
    return request;
  }

  private async ensureTaskPassFromDeposit(deposit: DepositOrder) {
    if (!deposit.taskPassPlanId) {
      throw new AppError("task_pass_plan_required", "Task Pass plan is required for activation.", 400);
    }
    const plan = this.mustTaskPassPlan(deposit.taskPassPlanId);
    const existing = Array.from(this.store.userTaskPasses.values()).find(
      (taskPass) =>
        taskPass.userId === deposit.userId &&
        taskPass.planId === plan.id &&
        taskPass.paymentReference === deposit.id,
    );
    if (existing) {
      if (existing.status !== "active") {
        return this.activateTaskPassRecord(existing);
      }
      return existing;
    }

    const requested = await this.requestTaskPassActivation(deposit.userId, plan.id, deposit.id);
    return this.activateTaskPassRecord(requested);
  }

  private async ensureTaskPassDepositSideEffects(deposit: DepositOrder) {
    if (deposit.taskPassPlanId) {
      const taskPass = await this.ensureTaskPassFromDeposit(deposit);
      if (!this.store.hasDepositProviderEvent(deposit.id, "deposit.lifecycle.task_pass_activated")) {
        this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.lifecycle.task_pass_activated", {
          taskPassId: taskPass.id,
          planId: deposit.taskPassPlanId,
        });
      }
    }

    if (!this.store.hasDepositProviderEvent(deposit.id, "deposit.lifecycle.deposit_bonus_locked")) {
      const bonus = this.maybeCreateDepositBonus(deposit);
      if (bonus) {
        this.store.addDepositProviderEvent(deposit.id, (deposit.provider as PaymentProvider) ?? "mock", "deposit.lifecycle.deposit_bonus_locked", {
          bonusId: bonus.id,
          bonusTokens: bonus.bonusTokens,
        });
      }
    }

    await this.maybeUnlockDepositBonusesForUser(deposit.userId);
  }

  private maybeCreateDepositBonus(deposit: DepositOrder) {
    const existing = Array.from(this.store.depositBonuses.values()).find((bonus) => bonus.depositId === deposit.id);
    if (existing) {
      return existing;
    }
    const rule = Array.from(this.store.depositBonusRules.values())
      .filter((candidate) => candidate.active && deposit.amount >= candidate.minDepositAmount)
      .sort((a, b) => b.minDepositAmount - a.minDepositAmount)[0];
    if (!rule) {
      return null;
    }
    const computedBonus = Math.min(rule.maxBonusTokens, (deposit.amount * rule.bonusPercent) / 100);
    if (computedBonus <= 0) {
      return null;
    }
    const bonus: DepositBonus = {
      id: id("deposit_bonus"),
      userId: deposit.userId,
      depositId: deposit.id,
      ruleId: rule.id,
      depositAmount: deposit.amount,
      bonusTokens: Number(computedBonus.toFixed(2)),
      unlockRequiredApprovedTasks: rule.unlockRequiredApprovedTasks,
      status: "locked",
      createdAt: now(),
    };
    this.store.depositBonuses.set(bonus.id, bonus);
    return bonus;
  }

  private async maybeUnlockDepositBonusesForUser(userId: string) {
    const approvedTasks = Array.from(this.store.userDailyTaskAssignments.values()).filter(
      (assignment) => assignment.userId === userId && (assignment.status === "approved" || assignment.status === "claimed"),
    ).length;

    for (const bonus of this.store.depositBonuses.values()) {
      if (bonus.userId !== userId || bonus.status !== "locked") {
        continue;
      }
      if (approvedTasks < bonus.unlockRequiredApprovedTasks) {
        continue;
      }
      const nextBonus: DepositBonus = {
        ...bonus,
        status: "credited",
        unlockedAt: bonus.unlockedAt ?? now(),
        creditedAt: bonus.creditedAt ?? now(),
      };
      this.store.depositBonuses.set(bonus.id, nextBonus);
      this.creditTokens(userId, bonus.bonusTokens, "deposit_bonus", bonus.id);
    }
  }

  private maybeTriggerReferralCommissionsForTask(userId: string, taskId: string, referenceId: string) {
    const user = this.mustUser(userId, "user");
    const referrerId = user.referredByUserId;
    if (!referrerId) {
      return;
    }
    const referrer = this.mustUser(referrerId, "user");
    if (referrer.blocked || user.blocked) {
      return;
    }
    for (const rule of this.store.referralCommissionRules.values()) {
      if (!rule.active || rule.trigger !== "referred_task_completed" || rule.requiredTaskId !== taskId) {
        continue;
      }
      this.ensureReferralCommission(rule, referrer.id, user.id, referenceId);
    }
  }

  private maybeTriggerReferralCommissionsForMilestone(userId: string, milestoneId: string) {
    const user = this.mustUser(userId, "user");
    const referrerId = user.referredByUserId;
    if (!referrerId) {
      return;
    }
    const referrer = this.mustUser(referrerId, "user");
    if (referrer.blocked || user.blocked) {
      return;
    }
    for (const rule of this.store.referralCommissionRules.values()) {
      if (!rule.active || rule.trigger !== "referred_milestone_completed") {
        continue;
      }
      if (rule.requiredMilestoneId && rule.requiredMilestoneId !== milestoneId) {
        continue;
      }
      this.ensureReferralCommission(rule, referrer.id, user.id, milestoneId);
    }
  }

  private ensureReferralCommission(
    rule: ReferralCommissionRule,
    referrerUserId: string,
    referredUserId: string,
    triggerReferenceId: string,
  ) {
    const existing = Array.from(this.store.referralCommissions.values()).find(
      (commission) => commission.ruleId === rule.id && commission.triggerReferenceId === triggerReferenceId,
    );
    if (existing) {
      return existing;
    }
    const computedReward = Math.min(rule.maxRewardTokens ?? rule.rewardValue, rule.rewardValue);
    const commission: ReferralCommission = {
      id: id("referral_commission"),
      referrerUserId,
      referredUserId,
      ruleId: rule.id,
      triggerType: rule.trigger,
      triggerReferenceId,
      rewardTokens: computedReward,
      status: "credited",
      creditedAt: now(),
      createdAt: now(),
    };
    this.store.referralCommissions.set(commission.id, commission);
    this.creditTokens(referrerUserId, commission.rewardTokens, "referral_commission", commission.id);
    return commission;
  }

  private buildMoneyTimeline(userId: string): MoneyTimelineStep[] {
    const deposits: MoneyTimelineStep[] = this.listUserDeposits(userId).map((deposit) => ({
      id: `deposit:${deposit.id}`,
      type: "deposit_paid" as const,
      title: "Deposit paid",
      description: `Deposit ${deposit.status === "listed" ? "completed and moved into your wallet flow." : `is ${deposit.status.replaceAll("_", " ")}.`}`,
      state:
        deposit.status === "failed"
          ? "failed"
          : deposit.status === "cancelled"
            ? "failed"
            : deposit.status === "listed"
              ? "completed"
              : "active",
      amount: deposit.amount,
      createdAt: deposit.updatedAt || deposit.createdAt,
      depositId: deposit.id,
    }));

    const rewardCredits: MoneyTimelineStep[] = this.getWalletTransactions(userId)
      .filter((transaction) => transaction.type === "reward_credit")
      .map((transaction) => ({
        id: `reward:${transaction.id}`,
        type: "reward_credited" as const,
        title: "Reward credited",
        description: "Reward balance increased after a verified reward event.",
        state: "completed" as const,
        amount: transaction.amount,
        createdAt: transaction.createdAt,
        depositId: typeof transaction.metadata.depositId === "string" ? transaction.metadata.depositId : undefined,
      }));

    const listings: MoneyTimelineStep[] = this.getWalletTransactions(userId)
      .filter((transaction) => transaction.type === "chunk_listed")
      .map((transaction) => ({
        id: `listed:${transaction.id}`,
        type: "amount_listed" as const,
        title: "Amount listed",
        description: "Deposit amount was split and listed into the market flow.",
        state: "completed" as const,
        amount: Math.abs(transaction.amount),
        createdAt: transaction.createdAt,
        depositId: this.resolveDepositIdFromSellOrder(transaction.metadata.sellOrderId as string | undefined),
      }));

    const matches: MoneyTimelineStep[] = this.getWalletTransactions(userId)
      .filter((transaction) => transaction.type === "chunk_match")
      .map((transaction) => ({
        id: `matched:${transaction.id}`,
        type: "amount_matched" as const,
        title: "Matched / sold",
        description: "Listed balance matched against demand and became withdrawable.",
        state: "completed" as const,
        amount: transaction.amount,
        createdAt: transaction.createdAt,
      }));

    const withdrawals: MoneyTimelineStep[] = this.listWithdrawals(userId).flatMap((withdrawal) => [
      {
        id: `withdraw-request:${withdrawal.id}`,
        type: "withdrawal_requested" as const,
        title: "Withdrawal requested",
        description: "Withdrawable balance moved into review.",
        state:
          withdrawal.status === "rejected" || withdrawal.status === "reversed"
            ? "failed"
            : withdrawal.status === "paid"
              ? "completed"
              : "active",
        amount: withdrawal.amount,
        createdAt: withdrawal.createdAt,
        withdrawalId: withdrawal.id,
      },
      ...(withdrawal.status === "paid"
        ? [
            {
              id: `withdraw-paid:${withdrawal.id}`,
              type: "withdrawal_paid" as const,
              title: "Withdrawal paid",
              description: "Provider confirmed the payout.",
              state: "completed" as const,
              amount: withdrawal.amount,
              createdAt: withdrawal.updatedAt,
              withdrawalId: withdrawal.id,
            },
          ]
        : []),
      ...(withdrawal.status === "rejected" || withdrawal.status === "reversed"
        ? [
            {
              id: `withdraw-reversed:${withdrawal.id}`,
              type: "withdrawal_reversed" as const,
              title: "Withdrawal reversed",
              description: "The request did not complete and funds were returned.",
              state: "failed" as const,
              amount: withdrawal.amount,
              createdAt: withdrawal.updatedAt,
              withdrawalId: withdrawal.id,
            },
          ]
        : []),
    ]);

    return [...deposits, ...rewardCredits, ...listings, ...matches, ...withdrawals].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  private resolveDepositIdFromSellOrder(sellOrderId?: string) {
    if (!sellOrderId) {
      return undefined;
    }
    return this.store.sellOrders.get(sellOrderId)?.depositOrderId;
  }

  private getWebhookIdempotencyKey(provider: PaymentProvider, payload: Record<string, unknown>, providerOrderId?: string) {
    const paymentId =
      (payload.cf_payment_id as string | undefined) ??
      ((payload.data as { payment?: { cf_payment_id?: string } } | undefined)?.payment?.cf_payment_id);
    const type = (payload.type as string | undefined) ?? (payload.payment_status as string | undefined) ?? "unknown";
    return `${provider}:${providerOrderId ?? "unknown"}:${paymentId ?? "unknown"}:${type}`;
  }

  private validateRewardRules(rules: RewardRule[]) {
    const activeRules = rules
      .map((rule) => ({ ...rule }))
      .sort((a, b) => a.minDepositAmount - b.minDepositAmount || a.maxDepositAmount - b.maxDepositAmount);

    for (const rule of activeRules) {
      if (rule.minDepositAmount < 0 || rule.maxDepositAmount < 0 || rule.rewardPercent < 0) {
        throw new AppError("invalid_reward_rule", "Reward rules cannot contain negative values.", 400);
      }
      if (rule.rewardPercent > 100) {
        throw new AppError("invalid_reward_rule", "Reward percentage cannot exceed 100.", 400);
      }
      if (rule.maxDepositAmount < rule.minDepositAmount) {
        throw new AppError("invalid_reward_rule", `Reward rule ${rule.id} has an invalid min/max range.`, 400);
      }
    }

    for (let index = 1; index < activeRules.length; index += 1) {
      const previous = activeRules[index - 1];
      const current = activeRules[index];
      if (previous.active && current.active && current.minDepositAmount <= previous.maxDepositAmount) {
        throw new AppError(
          "overlapping_reward_rules",
          `Active reward rules ${previous.id} and ${current.id} have overlapping ranges.`,
          400,
        );
      }
    }
  }

  private buildUserRiskIndicator(userId: string): RiskIndicator {
    const user = this.store.users.get(userId);
    const deposits = this.listUserDepositsUnsafe(userId);
    const withdrawals = this.listWithdrawalsUnsafe(userId);
    const reasons: string[] = [];

    if (user?.blocked) {
      reasons.push("User is currently blocked.");
    }

    const failedDeposits = deposits.filter((deposit) => deposit.status === "failed" || deposit.status === "cancelled").length;
    if (failedDeposits >= 2) {
      reasons.push(`${failedDeposits} recent deposits failed or were cancelled.`);
    }

    const pendingWithdrawals = withdrawals.filter((withdrawal) =>
      ["queued_for_review", "approved", "provider_processing"].includes(withdrawal.status),
    ).length;
    if (pendingWithdrawals >= 2) {
      reasons.push(`${pendingWithdrawals} withdrawals are still pending review or provider action.`);
    }

    const recentDeposit = deposits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const recentWithdrawal = withdrawals.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (recentDeposit && recentWithdrawal) {
      const depositTime = new Date(recentDeposit.updatedAt).getTime();
      const withdrawalTime = new Date(recentWithdrawal.createdAt).getTime();
      if (withdrawalTime - depositTime >= 0 && withdrawalTime - depositTime < 2 * 60 * 60 * 1000) {
        reasons.push("Withdrawal was requested shortly after a deposit.");
      }
    }

    const rewardCredits = this.getWalletTransactionsUnsafe(userId)
      .filter((transaction) => transaction.type === "reward_credit")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const soldAmount = this.store.getWallet(userId).soldBalance;
    if (rewardCredits > 0 && soldAmount > 0 && rewardCredits / Math.max(soldAmount, 1) > 0.5) {
      reasons.push("Reward usage is high compared with available cash wallet balance.");
    }

    return {
      level: this.resolveRiskLevel(reasons.length),
      reasons,
    };
  }

  private buildDepositRiskIndicator(deposit: DepositOrder): RiskIndicator {
    const reasons: string[] = [];
    const userRisk = this.buildUserRiskIndicator(deposit.userId);
    if (userRisk.level !== "low") {
      reasons.push(...userRisk.reasons.slice(0, 2));
    }
    const failedAttempts = this.store.findDepositProviderEvents(deposit.id, "deposit.status_sync").filter((event) => event.payload.terminal === true && event.payload.verified !== true).length;
    if (failedAttempts >= 2) {
      reasons.push("Multiple failed payment confirmations were recorded.");
    }
    if (deposit.status !== "listed" && this.store.hasDepositProviderEvent(deposit.id, "deposit.webhook")) {
      reasons.push("Provider webhook exists but deposit is not fully listed yet.");
    }

    return {
      level: this.resolveRiskLevel(reasons.length),
      reasons,
    };
  }

  private buildWithdrawalRiskIndicator(withdrawal: WithdrawRequest): RiskIndicator {
    const reasons: string[] = [];
    const userRisk = this.buildUserRiskIndicator(withdrawal.userId);
    if (userRisk.level !== "low") {
      reasons.push(...userRisk.reasons.slice(0, 2));
    }
    if (["queued_for_review", "approved", "provider_processing"].includes(withdrawal.status)) {
      reasons.push("Withdrawal is still waiting for operator or provider completion.");
    }
    return {
      level: this.resolveRiskLevel(reasons.length),
      reasons,
    };
  }

  private resolveRiskLevel(reasonCount: number): RiskIndicator["level"] {
    if (reasonCount >= 3) {
      return "high";
    }
    if (reasonCount >= 1) {
      return "medium";
    }
    return "low";
  }

  private listUserDepositsUnsafe(userId: string) {
    return this.listDeposits().filter((deposit) => deposit.userId === userId);
  }

  private listWithdrawalsUnsafe(userId: string) {
    return Array.from(this.store.withdrawRequests.values()).filter((item) => item.userId === userId);
  }

  private getWalletTransactionsUnsafe(userId: string) {
    return this.store.walletTransactions.filter((transaction) => transaction.userId === userId);
  }

  private buildAuthSession(user: User) {
    return {
      accessToken: this.issueAccessToken(user, "user"),
      user,
      walletSummary: this.getWalletSummary(user.id),
    };
  }

  private issueAccessToken(user: User, kind: "user" | "admin") {
    return signToken(
      {
        sub: user.id,
        role: user.role,
        phone: user.phone,
        kind,
      },
      {
        secret: this.config.JWT_SECRET,
        ttlSeconds: this.config.JWT_TTL_SECONDS,
      },
    );
  }

  private resolvePayoutAdapter(): PayoutProviderAdapter {
    return this.payoutAdapters.cashfree ?? this.payoutAdapters.mock;
  }

  private generateOtpCode() {
    if (this.config.NODE_ENV === "test") {
      return "123456";
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private findOrCreateEndUser(phone: string, name?: string, referralCode?: string) {
    let user = this.store.findUserByPhone(phone);
    if (user && user.role !== "user") {
      throw new AppError("invalid_user_role", "This phone is reserved for admin access", 403);
    }

    if (!user) {
      const referrer = referralCode ? this.store.findUserByReferralCode(referralCode) : undefined;
      user = {
        id: createSevenDigitUserId(new Set(this.store.users.keys())),
        phone,
        name: name || `User ${phone.slice(-4)}`,
        referralCode: `REF${phone.slice(-6)}`,
        referredByUserId: referrer?.id,
        role: "user",
        blocked: false,
        createdAt: now(),
      };
      this.store.users.set(user.id, user);
      this.store.createWallet(user.id);
      if (referrer) {
        const referrerWallet = this.store.getWallet(referrer.id);
        referrerWallet.rewardBalance += 25;
        referrerWallet.withdrawableBalance += 25;
        referrerWallet.updatedAt = now();
        this.store.addWalletTransaction(referrer.id, "reward_credit", 25, {
          reason: "referral",
          referredUserId: user.id,
        });
      }
    }

    return user;
  }

  private applyReward(deposit: DepositOrder): number {
    const rule = this.listRewardRules().find(
      (item) => item.active && deposit.amount >= item.minDepositAmount && deposit.amount <= item.maxDepositAmount,
    );
    if (!rule) {
      return 0;
    }
    const reward = Math.floor((deposit.amount * rule.rewardPercent) / 100);
    const wallet = this.store.getWallet(deposit.userId);
    wallet.rewardBalance += reward;
    wallet.withdrawableBalance += reward;
    wallet.updatedAt = now();
    this.store.addWalletTransaction(deposit.userId, "reward_credit", reward, {
      depositId: deposit.id,
      rewardRuleId: rule.id,
    });
    return reward;
  }

  private createSellOrder(deposit: DepositOrder, availablePrincipal: number): SellOrder {
    if (availablePrincipal < deposit.amount) {
      throw new AppError("principal_too_low", "Principal balance is lower than deposit amount", 400);
    }
    const sellOrder: SellOrder = {
      id: id("sell"),
      userId: deposit.userId,
      depositOrderId: deposit.id,
      totalAmount: deposit.amount,
      soldAmount: 0,
      status: "open",
      createdAt: now(),
    };
    this.store.sellOrders.set(sellOrder.id, sellOrder);

    const chunks = this.generateChunks(deposit.amount);
    for (const chunkSpec of chunks) {
      const chunk: SellOrderChunk = {
        id: id("chunk"),
        sellOrderId: sellOrder.id,
        userId: deposit.userId,
        bucketId: chunkSpec.bucketId,
        amount: chunkSpec.amount,
        remainingAmount: chunkSpec.amount,
        listedAt: now(),
      };
      this.store.sellOrderChunks.set(chunk.id, chunk);
    }

    return sellOrder;
  }

  private listChunks(sellOrder: SellOrder) {
    const chunks = Array.from(this.store.sellOrderChunks.values()).filter((chunk) => chunk.sellOrderId === sellOrder.id);
    const totalListed = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
    this.store.addWalletTransaction(sellOrder.userId, "chunk_listed", -totalListed, {
      sellOrderId: sellOrder.id,
      chunkCount: chunks.length,
    });
  }

  private generateChunks(amount: number): Array<{ bucketId: string; amount: number }> {
    const demandPriority = new Map(
      this.listDemandPools()
        .filter((pool) => pool.active)
        .map((pool) => [pool.bucketId, pool.remainingAmount > 0 ? pool.remainingAmount : pool.requestedAmount]),
    );
    const buckets = this.listChunkBuckets()
      .filter((bucket) => bucket.active)
      .sort((a, b) => {
        const demandDiff = (demandPriority.get(b.id) ?? 0) - (demandPriority.get(a.id) ?? 0);
        if (demandDiff !== 0) {
          return demandDiff;
        }
        return b.targetAmount - a.targetAmount;
      });

    const result: Array<{ bucketId: string; amount: number }> = [];
    let remaining = amount;
    let cycleBucketIds = new Set<string>();
    const smallestMin = Math.min(...buckets.map((bucket) => bucket.minAmount));

    while (remaining > 0) {
      let eligible = buckets.filter((candidate) => candidate.minAmount <= remaining && !cycleBucketIds.has(candidate.id));
      if (!eligible.length) {
        cycleBucketIds = new Set<string>();
        eligible = buckets.filter((candidate) => candidate.minAmount <= remaining);
      }

      const bucket = eligible[0];
      if (!bucket) {
        const last = result[result.length - 1];
        if (!last) {
          throw new AppError("chunk_generation_failed", "Unable to chunk deposit amount", 500);
        }
        last.amount += remaining;
        remaining = 0;
        break;
      }

      let nextAmount = Math.min(bucket.targetAmount, bucket.maxAmount, remaining);
      const tail = remaining - nextAmount;
      if (tail > 0 && tail < smallestMin) {
        nextAmount = remaining;
      }
      if (nextAmount < bucket.minAmount && result.length > 0) {
        result[result.length - 1].amount += remaining;
        remaining = 0;
        break;
      }

      result.push({ bucketId: bucket.id, amount: nextAmount });
      remaining -= nextAmount;
      cycleBucketIds.add(bucket.id);
    }

    return result;
  }

  private resolveFailedDepositStatus(providerStatus?: string): DepositOrder["status"] {
    const normalized = String(providerStatus ?? "").toUpperCase();
    if (normalized.includes("CANCEL") || normalized.includes("DROP")) {
      return "cancelled";
    }
    return "failed";
  }

  private audit(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    this.store.adminAuditLogs.unshift({
      id: id("audit"),
      adminUserId,
      action,
      entityType,
      entityId,
      payload,
      createdAt: now(),
    });
  }

  private mustDeposit(depositId: string) {
    const deposit = this.store.depositOrders.get(depositId);
    if (!deposit) {
      throw new AppError("deposit_not_found", "Deposit not found", 404);
    }
    return deposit;
  }

  private mustWithdrawal(withdrawalId: string) {
    const withdrawal = this.store.withdrawRequests.get(withdrawalId);
    if (!withdrawal) {
      throw new AppError("withdrawal_not_found", "Withdrawal not found", 404);
    }
    return withdrawal;
  }

  private mustUser(userId: string, role: "user" | "admin") {
    const user = this.store.users.get(userId);
    if (!user) {
      throw new AppError("user_not_found", "User not found", 404);
    }
    if (role === "user" && user.role !== "user") {
      throw new AppError("invalid_role", "Expected user account", 403);
    }
    if (role === "admin" && user.role !== "superadmin" && user.role !== "operator") {
      throw new AppError("invalid_role", "Expected admin account", 403);
    }
    return user;
  }

  private assertActiveUser(userId: string) {
    const user = this.mustUser(userId, "user");
    if (user.blocked) {
      throw new AppError("user_blocked", "User is blocked", 403);
    }
  }
}
