import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import BubbleChartRoundedIcon from "@mui/icons-material/BubbleChartRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import type {
  AdminDailyAssignment,
  AdminAuditLog,
  AdminRiskReport,
  ChunkBucket,
  DailyTask,
  DemandPool,
  DepositBonus,
  DepositBonusRule,
  DepositOrder,
  Paginated,
  RedemptionRequest,
  ReconciliationReport,
  ReferralCommission,
  ReferralCommissionRule,
  RewardMilestone,
  RiskLevel,
  RewardRule,
  TaskPassPlan,
  TokenTransaction,
  User,
  UserTaskPass,
  WithdrawRequest,
} from "@reward-wallet/shared";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4000";
const SESSION_KEY = "reward-wallet-admin-token";
const SIDEBAR_WIDTH = 288;
const SHOW_DEV_CREDENTIALS = import.meta.env.DEV || import.meta.env.VITE_SHOW_SEEDED_CREDENTIALS === "true";

type AdminSession = {
  accessToken: string;
  user: User;
};

type ProviderStatus = {
  cashfree: {
    paymentsLive: boolean;
    payoutsLive: boolean;
    baseUrl: string;
  };
  fallbackMode: boolean;
  storageMode?: "postgres" | "file" | "memory";
  otpMode?: "redis" | "file" | "memory";
  otpProvider?: "mock" | "msg91";
  memoryInfrastructure: boolean;
  databaseConfigured: boolean;
  redisConfigured: boolean;
};

type NavSection =
  | "taskPassPlans"
  | "userPasses"
  | "dailyTasks"
  | "assignments"
  | "submissions"
  | "milestones"
  | "referralRules"
  | "depositBonuses"
  | "tokenLedger"
  | "redemptions"
  | "overview"
  | "users"
  | "tasks"
  | "money"
  | "config"
  | "audit";

type TaskPassPlanDraft = Omit<TaskPassPlan, "id" | "createdAt" | "updatedAt">;
type DailyTaskDraft = Omit<DailyTask, "id" | "createdAt" | "updatedAt">;

const createTaskPassPlanDraft = (): TaskPassPlanDraft => ({
  name: "New Pass",
  durationDays: 7,
  dailyTaskMin: 2,
  dailyTaskMax: 3,
  dailyTokenCap: 60,
  targetTokens: 300,
  priceAmount: 0,
  currency: "INR",
  active: true,
});

const createDailyTaskDraft = (): DailyTaskDraft => ({
  title: "New Daily Task",
  description: "Describe the task for users.",
  type: "manual",
  rewardTokens: 20,
  requiresApproval: false,
  active: true,
});

const dashboardTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#22c55e", dark: "#16a34a", light: "#86efac" },
    secondary: { main: "#facc15", dark: "#ca8a04", light: "#fde68a" },
    success: { main: "#22c55e" },
    warning: { main: "#facc15" },
    error: { main: "#ef4444" },
    background: { default: "#07111f", paper: "#101827" },
    text: { primary: "#f8fafc", secondary: "#94a3b8" },
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Segoe UI", "Inter", sans-serif',
    h3: { fontWeight: 800, letterSpacing: -0.8 },
    h4: { fontWeight: 800, letterSpacing: -0.4 },
    h5: { fontWeight: 800 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
          backgroundColor: "#101827",
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 14, paddingInline: 16 } },
    },
    MuiTextField: { defaultProps: { size: "small" } },
  },
});

const request = async <T,>(path: string, options: RequestInit & { token?: string } = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data ? String((data as { message: string }).message) : "Request failed";
    throw new Error(message);
  }

  return data as T;
};

const toCurrency = (amount: number) => `Rs ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const toDateTime = (value: string) => new Date(value).toLocaleString("en-IN");
const toInitials = (value: string) =>
  value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const sectionMeta: Array<{ id: NavSection; label: string; caption: string; icon: ReactElement }> = [
  { id: "taskPassPlans", label: "Task Pass Plans", caption: "Plan pricing and caps", icon: <BubbleChartRoundedIcon /> },
  { id: "userPasses", label: "User Passes", caption: "Activation and expiry", icon: <PeopleRoundedIcon /> },
  { id: "dailyTasks", label: "Daily Tasks", caption: "Task templates", icon: <TuneRoundedIcon /> },
  { id: "assignments", label: "Assignments", caption: "Daily user work", icon: <ReceiptLongRoundedIcon /> },
  { id: "submissions", label: "Submissions", caption: "Proof review", icon: <ShieldRoundedIcon /> },
  { id: "milestones", label: "Milestones", caption: "Progress rewards", icon: <InsightsRoundedIcon /> },
  { id: "referralRules", label: "Referral Rules", caption: "Triggered commissions", icon: <AutorenewRoundedIcon /> },
  { id: "depositBonuses", label: "Deposit Bonuses", caption: "Locked token bonuses", icon: <SavingsRoundedIcon /> },
  { id: "tokenLedger", label: "Token Ledger", caption: "Per-user token trail", icon: <ReceiptLongRoundedIcon /> },
  { id: "redemptions", label: "Redemptions", caption: "Cash payout requests", icon: <GavelRoundedIcon /> },
];

function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [phone, setPhone] = useState(import.meta.env.DEV ? "9999999999" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "admin1234" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>("taskPassPlans");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [users, setUsers] = useState<Paginated<User> | null>(null);
  const [deposits, setDeposits] = useState<Paginated<DepositOrder> | null>(null);
  const [withdrawals, setWithdrawals] = useState<Paginated<WithdrawRequest> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Paginated<AdminAuditLog> | null>(null);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [chunkBuckets, setChunkBuckets] = useState<ChunkBucket[]>([]);
  const [demandPools, setDemandPools] = useState<DemandPool[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [riskReport, setRiskReport] = useState<AdminRiskReport | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [matchingPaused, setMatchingPaused] = useState(false);
  const [taskPassPlans, setTaskPassPlans] = useState<TaskPassPlan[]>([]);
  const [taskPasses, setTaskPasses] = useState<UserTaskPass[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [dailyAssignments, setDailyAssignments] = useState<AdminDailyAssignment[]>([]);
  const [tokenLedger, setTokenLedger] = useState<TokenTransaction[]>([]);
  const [milestones, setMilestones] = useState<RewardMilestone[]>([]);
  const [referralRules, setReferralRules] = useState<ReferralCommissionRule[]>([]);
  const [referralCommissions, setReferralCommissions] = useState<ReferralCommission[]>([]);
  const [depositBonusRules, setDepositBonusRules] = useState<DepositBonusRule[]>([]);
  const [depositBonuses, setDepositBonuses] = useState<DepositBonus[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRequest[]>([]);
  const [newTaskPassPlan, setNewTaskPassPlan] = useState<TaskPassPlanDraft>(createTaskPassPlanDraft);
  const [newDailyTask, setNewDailyTask] = useState<DailyTaskDraft>(createDailyTaskDraft);

  const loadDashboard = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, depositsData, withdrawalsData, rewardRulesData, auditLogsData, providerStatusData, riskReportData, reconciliationData, taskPassPlansData, taskPassesData, dailyTasksData, dailyAssignmentsData, tokenLedgerData, milestonesData, referralRulesData, referralCommissionsData, depositBonusRulesData, depositBonusesData, redemptionsData] =
        await Promise.all([
          request<Paginated<User>>("/admin/users?page=1&pageSize=50", { token }),
          request<Paginated<DepositOrder>>("/admin/deposits?page=1&pageSize=50", { token }),
          request<Paginated<WithdrawRequest>>("/admin/withdrawals?page=1&pageSize=50", { token }),
          request<RewardRule[]>("/admin/reward-rules", { token }),
          request<Paginated<AdminAuditLog>>("/admin/audit-logs?page=1&pageSize=20", { token }),
          request<ProviderStatus>("/health/providers"),
          request<AdminRiskReport>("/admin/risk-report", { token }).catch(() => ({ users: {}, deposits: {}, withdrawals: {} })),
          request<ReconciliationReport>("/admin/reconciliation", { token }).catch(() => ({ entries: [] })),
          request<TaskPassPlan[]>("/admin/task-pass-plans", { token }).catch(() => []),
          request<UserTaskPass[]>("/admin/task-passes", { token }).catch(() => []),
          request<DailyTask[]>("/admin/tasks", { token }).catch(() => []),
          request<AdminDailyAssignment[]>("/admin/daily-assignments", { token }).catch(() => []),
          request<TokenTransaction[]>("/admin/token-ledger", { token }).catch(() => []),
          request<RewardMilestone[]>("/admin/milestones", { token }).catch(() => []),
          request<ReferralCommissionRule[]>("/admin/referral-commission-rules", { token }).catch(() => []),
          request<ReferralCommission[]>("/admin/referral-commissions", { token }).catch(() => []),
          request<DepositBonusRule[]>("/admin/deposit-bonus-rules", { token }).catch(() => []),
          request<DepositBonus[]>("/admin/deposit-bonuses", { token }).catch(() => []),
          request<RedemptionRequest[]>("/admin/redemptions", { token }).catch(() => []),
        ]);

      setUsers(usersData);
      setDeposits(depositsData);
      setWithdrawals(withdrawalsData);
      setRewardRules(rewardRulesData);
      setChunkBuckets([]);
      setDemandPools([]);
      setAuditLogs(auditLogsData);
      setProviderStatus(providerStatusData);
      setRiskReport(riskReportData);
      setReconciliation(reconciliationData);
      setTaskPassPlans(taskPassPlansData);
      setTaskPasses(taskPassesData);
      setDailyTasks(dailyTasksData);
      setDailyAssignments(dailyAssignmentsData);
      setTokenLedger(tokenLedgerData);
      setMilestones(milestonesData);
      setReferralRules(referralRulesData);
      setReferralCommissions(referralCommissionsData);
      setDepositBonusRules(depositBonusRulesData);
      setDepositBonuses(depositBonusesData);
      setRedemptions(redemptionsData);
      setMatchingPaused(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem(SESSION_KEY);
    const storedUser = localStorage.getItem(`${SESSION_KEY}:user`);
    if (!storedToken || !storedUser) {
      return;
    }

    const parsedUser = JSON.parse(storedUser) as User;
    setSession({ accessToken: storedToken, user: parsedUser });
    loadDashboard(storedToken).catch(() => undefined);
  }, []);

  const metrics = useMemo(() => {
    const activePasses = taskPasses.filter((taskPass) => taskPass.status === "active").length;
    const pendingSubmissions = dailyAssignments.filter((item) => ["checking", "submitted"].includes(item.assignment.status)).length;
    const pendingRedemptions = redemptions.filter((item) => item.status === "pending").length;
    const creditedTokens = tokenLedger.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + entry.amount, 0);

    return [
      { title: "Active Passes", value: `${activePasses}`, subtitle: "Users currently earning tokens", icon: <PeopleRoundedIcon color="primary" /> },
      { title: "Submissions", value: `${pendingSubmissions}`, subtitle: "Proof reviews waiting", icon: <ShieldRoundedIcon color="warning" /> },
      { title: "Redemptions", value: `${pendingRedemptions}`, subtitle: "Token payout requests", icon: <GavelRoundedIcon color="error" /> },
      { title: "Tokens Credited", value: `${creditedTokens.toLocaleString("en-IN")}`, subtitle: "Lifetime reward ledger", icon: <InsightsRoundedIcon color="success" /> },
    ];
  }, [dailyAssignments, redemptions, taskPasses, tokenLedger]);

  const onAction = async (key: string, task: () => Promise<void>, success: string) => {
    setActionKey(key);
    setError(null);
    try {
      await task();
      setSuccessMessage(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setActionKey(null);
    }
  };

  const riskColor = (level: RiskLevel): "success" | "warning" | "error" =>
    level === "high" ? "error" : level === "medium" ? "warning" : "success";

  const statusColor = (status: string): "success" | "warning" | "error" | "info" | "default" => {
    if (["active", "approved", "claimed", "credited", "paid"].includes(status)) {
      return "success";
    }
    if (["pending", "checking", "submitted", "payment_pending", "locked"].includes(status)) {
      return "warning";
    }
    if (["rejected", "cancelled", "failed", "expired"].includes(status)) {
      return "error";
    }
    return "info";
  };

  const matchesFilters = (input: { status?: string; userId?: string; planId?: string; date?: string }) =>
    (statusFilter === "all" || input.status === statusFilter) &&
    (!userFilter || (input.userId ?? "").toLowerCase().includes(userFilter.toLowerCase())) &&
    (planFilter === "all" || input.planId === planFilter) &&
    (!dateFilter || input.date === dateFilter);

  const filteredTaskPasses = taskPasses.filter((taskPass) =>
    matchesFilters({ status: taskPass.status, userId: taskPass.userId, planId: taskPass.planId }),
  );
  const filteredAssignments = dailyAssignments.filter((item) =>
    matchesFilters({
      status: item.assignment.status,
      userId: item.assignment.userId,
      planId: item.taskPass?.planId,
      date: item.assignment.date,
    }),
  );
  const filteredSubmissions = filteredAssignments.filter((item) => ["checking", "submitted", "rejected", "approved"].includes(item.assignment.status));
  const filteredTokenLedger = tokenLedger.filter((entry) => matchesFilters({ status: entry.reason, userId: entry.userId }));
  const filteredRedemptions = redemptions.filter((item) => matchesFilters({ status: item.status, userId: item.userId }));

  const planName = (planId?: string) => taskPassPlans.find((plan) => plan.id === planId)?.name ?? planId ?? "No plan";
  const userName = (userId?: string) => users?.items.find((user) => user.id === userId)?.name ?? userId ?? "Unknown user";

  const sectionTitle = sectionMeta.find((section) => section.id === activeSection);

  const filterBar = (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, mb: 2, bgcolor: "rgba(255,255,255,0.03)" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField
          label="Status"
          placeholder="all, active, pending..."
          value={statusFilter}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setStatusFilter(event.target.value.trim() || "all")}
        />
        <TextField
          label="User ID"
          placeholder="Filter by user"
          value={userFilter}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setUserFilter(event.target.value)}
        />
        <TextField
          label="Plan ID"
          placeholder="all or plan id"
          value={planFilter}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setPlanFilter(event.target.value.trim() || "all")}
        />
        <TextField
          label="Date"
          placeholder="YYYY-MM-DD"
          value={dateFilter}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDateFilter(event.target.value)}
        />
        <Button
          variant="outlined"
          onClick={() => {
            setStatusFilter("all");
            setUserFilter("");
            setPlanFilter("all");
            setDateFilter("");
          }}
        >
          Clear filters
        </Button>
      </Stack>
    </Paper>
  );

  const renderRewardOpsSection = () => {
    if (!sectionTitle) {
      return null;
    }
    const activeSession = session;
    if (!activeSession) {
      return null;
    }

    if (activeSection === "taskPassPlans") {
      return (
        <Stack spacing={3}>
          <PanelCard
            title="Task Pass Plans"
            subtitle="Plan pricing, daily task ranges, caps, and Earn up to token targets."
            action={
              <Button
                variant="contained"
                onClick={() =>
                  onAction(
                    "save-task-pass-plans",
                    async () => {
                      await Promise.all(
                        taskPassPlans.map((plan) =>
                          request(`/admin/task-pass-plans/${plan.id}`, {
                            method: "PATCH",
                            token: session.accessToken,
                            body: JSON.stringify(plan),
                          }),
                        ),
                      );
                      await loadDashboard(session.accessToken);
                    },
                    "Task Pass plans saved.",
                  )
                }
              >
                Save plans
              </Button>
            }
          >
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Plan</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Daily tasks</TableCell>
                    <TableCell>Daily cap</TableCell>
                    <TableCell>Earn up to</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {taskPassPlans.map((plan, index) => (
                    <TableRow key={plan.id} hover>
                      <TableCell>
                        <TextField
                          value={plan.name}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <NumberField
                          value={plan.durationDays}
                          onChange={(value) =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, durationDays: value } : item)),
                            )
                          }
                          endAdornment="days"
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <NumberField
                            value={plan.dailyTaskMin}
                            onChange={(value) =>
                              setTaskPassPlans((current) =>
                                current.map((item, itemIndex) => (itemIndex === index ? { ...item, dailyTaskMin: value } : item)),
                              )
                            }
                          />
                          <NumberField
                            value={plan.dailyTaskMax}
                            onChange={(value) =>
                              setTaskPassPlans((current) =>
                                current.map((item, itemIndex) => (itemIndex === index ? { ...item, dailyTaskMax: value } : item)),
                              )
                            }
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <NumberField
                          value={plan.dailyTokenCap}
                          onChange={(value) =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, dailyTokenCap: value } : item)),
                            )
                          }
                          endAdornment="tokens"
                        />
                      </TableCell>
                      <TableCell>
                        <NumberField
                          value={plan.targetTokens}
                          onChange={(value) =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, targetTokens: value } : item)),
                            )
                          }
                          endAdornment="tokens"
                        />
                      </TableCell>
                      <TableCell>
                        <NumberField
                          value={plan.priceAmount}
                          onChange={(value) =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, priceAmount: value } : item)),
                            )
                          }
                          endAdornment={plan.currency}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={plan.active ? "contained" : "outlined"}
                          color={plan.active ? "success" : "warning"}
                          onClick={() =>
                            setTaskPassPlans((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? { ...item, active: !item.active } : item)),
                            )
                          }
                        >
                          {plan.active ? "Active" : "Paused"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>

          <PanelCard
            title="Create Task Pass Plan"
            subtitle="Create touch-friendly user plans. Use Earn up to X tokens and Complete tasks to earn tokens copy."
            action={
              <Button
                variant="contained"
                onClick={() =>
                  onAction(
                    "create-task-pass-plan",
                    async () => {
                      await request("/admin/task-pass-plans", {
                        method: "POST",
                        token: session.accessToken,
                        body: JSON.stringify(newTaskPassPlan),
                      });
                      setNewTaskPassPlan(createTaskPassPlanDraft());
                      await loadDashboard(session.accessToken);
                    },
                    "Task Pass plan created.",
                  )
                }
              >
                Create plan
              </Button>
            }
          >
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap flexWrap="wrap">
              <TextField label="Plan name" value={newTaskPassPlan.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewTaskPassPlan((current) => ({ ...current, name: event.target.value }))} />
              <TextField label="Currency" value={newTaskPassPlan.currency} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewTaskPassPlan((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
              <NumberField value={newTaskPassPlan.durationDays} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, durationDays: value }))} endAdornment="days" />
              <NumberField value={newTaskPassPlan.dailyTaskMin} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTaskMin: value }))} />
              <NumberField value={newTaskPassPlan.dailyTaskMax} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTaskMax: value }))} />
              <NumberField value={newTaskPassPlan.dailyTokenCap} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTokenCap: value }))} endAdornment="tokens" />
              <NumberField value={newTaskPassPlan.targetTokens} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, targetTokens: value }))} endAdornment="tokens" />
              <NumberField value={newTaskPassPlan.priceAmount} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, priceAmount: value }))} endAdornment="INR" />
            </Stack>
          </PanelCard>
        </Stack>
      );
    }

    if (activeSection === "userPasses") {
      return (
        <PanelCard title="User Passes" subtitle="Activate or cancel Task Pass access with an audit-friendly operator trail.">
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Window</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTaskPasses.map((taskPass) => (
                  <TableRow key={taskPass.id} hover>
                    <TableCell>{userName(taskPass.userId)}</TableCell>
                    <TableCell>{planName(taskPass.planId)}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(taskPass.status)} label={taskPass.status} /></TableCell>
                    <TableCell>{taskPass.startsAt ? `${toDateTime(taskPass.startsAt)} -> ${taskPass.endsAt ? toDateTime(taskPass.endsAt) : "open"}` : "Not started"}</TableCell>
                    <TableCell>{taskPass.paymentReference ?? "Manual/admin"}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="contained"
                          size="small"
                          disabled={taskPass.status === "active"}
                          onClick={() =>
                            onAction(
                              `task-pass-activate-${taskPass.id}`,
                              async () => {
                                await request(`/admin/task-passes/${taskPass.id}/activate`, { method: "POST", token: session.accessToken });
                                await loadDashboard(session.accessToken);
                              },
                              "Task Pass activated.",
                            )
                          }
                        >
                          Activate
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          disabled={taskPass.status === "cancelled"}
                          onClick={() =>
                            onAction(
                              `task-pass-cancel-${taskPass.id}`,
                              async () => {
                                await request(`/admin/task-passes/${taskPass.id}/cancel`, { method: "POST", token: session.accessToken });
                                await loadDashboard(session.accessToken);
                              },
                              "Task Pass cancelled.",
                            )
                          }
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "dailyTasks") {
      return (
        <PanelCard title="Daily Tasks" subtitle="Configure daily task templates. Rewards depend on task completion and approval.">
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Task</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Reward</TableCell>
                  <TableCell>Approval</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dailyTasks.map((task, index) => (
                  <TableRow key={task.id} hover>
                    <TableCell>
                      <Stack spacing={1}>
                        <TextField value={task.title} onChange={(event: ChangeEvent<HTMLInputElement>) => setDailyTasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))} />
                        <TextField multiline minRows={2} value={task.description} onChange={(event: ChangeEvent<HTMLInputElement>) => setDailyTasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)))} />
                      </Stack>
                    </TableCell>
                    <TableCell>{task.type}</TableCell>
                    <TableCell>
                      <NumberField value={task.rewardTokens} onChange={(value) => setDailyTasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, rewardTokens: value } : item)))} endAdornment="tokens" />
                    </TableCell>
                    <TableCell><Chip size="small" color={task.requiresApproval ? "warning" : "success"} label={task.requiresApproval ? "Manual review" : "Auto approve"} /></TableCell>
                    <TableCell><Chip size="small" color={task.active ? "success" : "default"} label={task.active ? "Active" : "Disabled"} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            onAction(
                              `task-save-${task.id}`,
                              async () => {
                                await request(`/admin/tasks/${task.id}`, {
                                  method: "PATCH",
                                  token: session.accessToken,
                                  body: JSON.stringify(task),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Daily task saved.",
                            )
                          }
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() =>
                            onAction(
                              `task-toggle-${task.id}`,
                              async () => {
                                await request(`/admin/tasks/${task.id}`, {
                                  method: "PATCH",
                                  token: session.accessToken,
                                  body: JSON.stringify({ active: !task.active }),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Daily task status updated.",
                            )
                          }
                        >
                          {task.active ? "Disable" : "Enable"}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "assignments") {
      return (
        <PanelCard
          title="Assignments"
          subtitle="Assign and monitor daily task work for active Task Pass users."
          action={
            <Button
              variant="contained"
              onClick={() =>
                onAction(
                  "assign-all-daily",
                  async () => {
                    await request("/admin/daily/assign-all", { method: "POST", token: session.accessToken });
                    await loadDashboard(session.accessToken);
                  },
                  "Daily tasks assigned to all active users.",
                )
              }
            >
              Assign all active users
            </Button>
          }
        >
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Task</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Reward</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAssignments.map((item) => (
                  <TableRow key={item.assignment.id} hover>
                    <TableCell>{item.user?.name ?? item.assignment.userId}</TableCell>
                    <TableCell>{item.plan?.name ?? planName(item.taskPass?.planId)}</TableCell>
                    <TableCell>{item.task?.title ?? item.assignment.taskId}</TableCell>
                    <TableCell>{item.assignment.date}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(item.assignment.status)} label={item.assignment.status} /></TableCell>
                    <TableCell>{item.assignment.rewardTokens} tokens</TableCell>
                    <TableCell align="right">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() =>
                          onAction(
                            `assign-user-${item.assignment.userId}`,
                            async () => {
                              await request(`/admin/users/${item.assignment.userId}/assign-daily-tasks`, { method: "POST", token: session.accessToken });
                              await loadDashboard(session.accessToken);
                            },
                            "Daily tasks assigned.",
                          )
                        }
                      >
                        Assign today
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "submissions") {
      return (
        <PanelCard title="Submissions" subtitle="Approve or reject proof submissions without changing reward math.">
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Task</TableCell>
                  <TableCell>Proof</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSubmissions.map((item) => (
                  <TableRow key={item.assignment.id} hover>
                    <TableCell>{item.user?.name ?? item.assignment.userId}</TableCell>
                    <TableCell>{item.task?.title ?? item.assignment.taskId}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>{item.assignment.proof ?? "No proof text"}</TableCell>
                    <TableCell>{item.assignment.submittedAt ? toDateTime(item.assignment.submittedAt) : "-"}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(item.assignment.status)} label={item.assignment.status} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            onAction(
                              `submission-approve-${item.assignment.id}`,
                              async () => {
                                await request(`/admin/task-submissions/${item.assignment.id}/approve`, { method: "POST", token: session.accessToken });
                                await loadDashboard(session.accessToken);
                              },
                              "Task submission approved.",
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() =>
                            onAction(
                              `submission-reject-${item.assignment.id}`,
                              async () => {
                                await request(`/admin/task-submissions/${item.assignment.id}/reject`, {
                                  method: "POST",
                                  token: session.accessToken,
                                  body: JSON.stringify({ reason: "Rejected by admin review." }),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Task submission rejected.",
                            )
                          }
                        >
                          Reject
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "milestones") {
      return (
        <PanelCard title="Milestones" subtitle="Configure required day, completed tasks, and milestone reward tokens.">
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Milestone</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Required day</TableCell>
                  <TableCell>Required tasks</TableCell>
                  <TableCell>Reward</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {milestones.filter((item) => matchesFilters({ status: item.active ? "active" : "disabled", planId: item.planId })).map((milestone) => (
                  <TableRow key={milestone.id} hover>
                    <TableCell>{milestone.name}</TableCell>
                    <TableCell>{planName(milestone.planId)}</TableCell>
                    <TableCell>Day {milestone.requiredDay}</TableCell>
                    <TableCell>{milestone.requiredCompletedTasks}</TableCell>
                    <TableCell>{milestone.rewardTokens} tokens</TableCell>
                    <TableCell><Chip size="small" color={milestone.active ? "success" : "default"} label={milestone.active ? "Active" : "Disabled"} /></TableCell>
                    <TableCell align="right">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() =>
                          onAction(
                            `milestone-toggle-${milestone.id}`,
                            async () => {
                              await request(`/admin/milestones/${milestone.id}`, {
                                method: "PATCH",
                                token: session.accessToken,
                                body: JSON.stringify({ active: !milestone.active }),
                              });
                              await loadDashboard(session.accessToken);
                            },
                            "Milestone status updated.",
                          )
                        }
                      >
                        {milestone.active ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "referralRules") {
      return (
        <Stack spacing={3}>
          <PanelCard title="Referral Rules" subtitle="Commission is credited only after configured task, milestone, or deposit triggers.">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Reward type</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell>Cap</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {referralRules.map((rule) => (
                    <TableRow key={rule.id} hover>
                      <TableCell>{rule.trigger}</TableCell>
                      <TableCell>{rule.rewardType}</TableCell>
                      <TableCell>{rule.rewardValue}</TableCell>
                      <TableCell>{rule.maxRewardTokens ?? "-"}</TableCell>
                      <TableCell><Chip size="small" color={rule.active ? "success" : "default"} label={rule.active ? "Active" : "Disabled"} /></TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() =>
                            onAction(
                              `referral-rule-toggle-${rule.id}`,
                              async () => {
                                await request(`/admin/referral-commission-rules/${rule.id}`, {
                                  method: "PATCH",
                                  token: session.accessToken,
                                  body: JSON.stringify({ active: !rule.active }),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Referral rule updated.",
                            )
                          }
                        >
                          {rule.active ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
          <PanelCard title="Referral Commissions" subtitle="Audit trail for pending and credited referral token commissions.">
            {filterBar}
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Referrer</TableCell>
                    <TableCell>Referred</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Tokens</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {referralCommissions.filter((item) => matchesFilters({ status: item.status, userId: item.referrerUserId })).map((commission) => (
                    <TableRow key={commission.id} hover>
                      <TableCell>{userName(commission.referrerUserId)}</TableCell>
                      <TableCell>{userName(commission.referredUserId)}</TableCell>
                      <TableCell>{commission.triggerType}</TableCell>
                      <TableCell>{commission.rewardTokens}</TableCell>
                      <TableCell><Chip size="small" color={statusColor(commission.status)} label={commission.status} /></TableCell>
                      <TableCell>{toDateTime(commission.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
        </Stack>
      );
    }

    if (activeSection === "depositBonuses") {
      return (
        <Stack spacing={3}>
          <PanelCard title="Deposit Bonus Rules" subtitle="Locked bonus tokens from qualifying payments. They never become cash wallet balance.">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Min deposit</TableCell>
                    <TableCell>Bonus</TableCell>
                    <TableCell>Cap</TableCell>
                    <TableCell>Unlock tasks</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depositBonusRules.map((rule) => (
                    <TableRow key={rule.id} hover>
                      <TableCell>{toCurrency(rule.minDepositAmount)}</TableCell>
                      <TableCell>{rule.bonusPercent}%</TableCell>
                      <TableCell>{rule.maxBonusTokens} tokens</TableCell>
                      <TableCell>{rule.unlockRequiredApprovedTasks}</TableCell>
                      <TableCell><Chip size="small" color={rule.active ? "success" : "default"} label={rule.active ? "Active" : "Disabled"} /></TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() =>
                            onAction(
                              `bonus-rule-toggle-${rule.id}`,
                              async () => {
                                await request(`/admin/deposit-bonus-rules/${rule.id}`, {
                                  method: "PATCH",
                                  token: session.accessToken,
                                  body: JSON.stringify({ active: !rule.active }),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Deposit bonus rule updated.",
                            )
                          }
                        >
                          {rule.active ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
          <PanelCard title="Deposit Bonuses" subtitle="Monitor locked, unlocked, credited, and rejected bonus token records.">
            {filterBar}
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Deposit</TableCell>
                    <TableCell>Deposit amount</TableCell>
                    <TableCell>Bonus tokens</TableCell>
                    <TableCell>Unlock tasks</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depositBonuses.filter((item) => matchesFilters({ status: item.status, userId: item.userId })).map((bonus) => (
                    <TableRow key={bonus.id} hover>
                      <TableCell>{userName(bonus.userId)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>{bonus.depositId}</TableCell>
                      <TableCell>{toCurrency(bonus.depositAmount)}</TableCell>
                      <TableCell>{bonus.bonusTokens}</TableCell>
                      <TableCell>{bonus.unlockRequiredApprovedTasks}</TableCell>
                      <TableCell><Chip size="small" color={statusColor(bonus.status)} label={bonus.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
        </Stack>
      );
    }

    if (activeSection === "tokenLedger") {
      return (
        <PanelCard title="Token Ledger" subtitle="Server-authoritative credit/debit entries per user.">
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Balance after</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTokenLedger.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{userName(entry.userId)}</TableCell>
                    <TableCell><Chip size="small" color="info" label={entry.reason} /></TableCell>
                    <TableCell><Chip size="small" color={entry.direction === "credit" ? "success" : "warning"} label={entry.direction} /></TableCell>
                    <TableCell>{entry.direction === "credit" ? "+" : "-"}{entry.amount} tokens</TableCell>
                    <TableCell>{entry.balanceAfter}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{entry.referenceId}</TableCell>
                    <TableCell>{toDateTime(entry.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    if (activeSection === "redemptions") {
      return (
        <PanelCard title="Redemptions" subtitle="Approve, reject, or mark token payout requests as paid.">
          {filterBar}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Tokens</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Payout</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRedemptions.map((redemption) => (
                  <TableRow key={redemption.id} hover>
                    <TableCell>{userName(redemption.userId)}</TableCell>
                    <TableCell>{redemption.tokens}</TableCell>
                    <TableCell>{toCurrency(redemption.valueAmount)}</TableCell>
                    <TableCell>{redemption.payoutMethod}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(redemption.status)} label={redemption.status} /></TableCell>
                    <TableCell>{toDateTime(redemption.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="contained"
                          disabled={redemption.status !== "pending"}
                          onClick={() =>
                            onAction(
                              `redemption-approve-${redemption.id}`,
                              async () => {
                                await request(`/admin/redemptions/${redemption.id}/approve`, { method: "POST", token: session.accessToken });
                                await loadDashboard(session.accessToken);
                              },
                              "Redemption approved.",
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={redemption.status !== "pending"}
                          onClick={() =>
                            onAction(
                              `redemption-reject-${redemption.id}`,
                              async () => {
                                await request(`/admin/redemptions/${redemption.id}/reject`, {
                                  method: "POST",
                                  token: session.accessToken,
                                  body: JSON.stringify({ reason: "Rejected by admin review." }),
                                });
                                await loadDashboard(session.accessToken);
                              },
                              "Redemption rejected and tokens restored.",
                            )
                          }
                        >
                          Reject
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={redemption.status !== "approved"}
                          onClick={() =>
                            onAction(
                              `redemption-paid-${redemption.id}`,
                              async () => {
                                await request(`/admin/redemptions/${redemption.id}/mark-paid`, { method: "POST", token: session.accessToken });
                                await loadDashboard(session.accessToken);
                              },
                              "Redemption marked paid.",
                            )
                          }
                        >
                          Mark paid
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PanelCard>
      );
    }

    return (
      <PanelCard title={sectionTitle.label} subtitle={sectionTitle.caption}>
        <Typography color="text.secondary">This section is reserved for reward operations.</Typography>
      </PanelCard>
    );
  };

  const sidebar = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(180deg, rgba(17,35,67,1) 0%, rgba(24,50,95,1) 44%, rgba(32,77,144,1) 100%)",
        color: "#f7fbff",
      }}
    >
      <Box sx={{ px: 3, py: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar sx={{ bgcolor: "secondary.main", width: 42, height: 42 }}>
            <ShieldRoundedIcon />
          </Avatar>
          <Box>
            <Typography variant="h6">Reward Wallet</Typography>
            <Typography variant="body2" sx={{ opacity: 0.75 }}>
              Operator command center
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

      <List sx={{ px: 2, py: 2, flex: 1 }}>
        {sectionMeta.map((section) => (
          <ListItemButton
            key={section.id}
            selected={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
            sx={{
              mb: 1,
              borderRadius: 3,
              alignItems: "flex-start",
              "&.Mui-selected": {
                bgcolor: "rgba(255,255,255,0.14)",
                color: "#ffffff",
              },
              "&.Mui-selected:hover": {
                bgcolor: "rgba(255,255,255,0.18)",
              },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>{section.icon}</ListItemIcon>
            <ListItemText
              primary={section.label}
              secondary={section.caption}
              secondaryTypographyProps={{ sx: { color: "rgba(255,255,255,0.62)" } }}
            />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ px: 3, py: 2.5, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <Typography variant="body2" sx={{ opacity: 0.72 }}>
          Money ops, rule tuning, and audit review in one place.
        </Typography>
      </Box>
    </Box>
  );

  if (!session) {
    return (
      <ThemeProvider theme={dashboardTheme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background:
              "radial-gradient(circle at top, rgba(205,228,255,0.9) 0%, rgba(243,246,251,1) 38%, rgba(233,239,248,1) 100%)",
            p: 3,
          }}
        >
          <Card sx={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
            <Box
              sx={{
                px: 3,
                py: 4,
                color: "#ffffff",
                background: "linear-gradient(135deg, #112343 0%, #1f5fbf 100%)",
              }}
            >
              <Chip
                label="Admin Login"
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.14)", color: "#ffffff", mb: 2 }}
              />
              <Typography variant="h4" gutterBottom>
                Reward Wallet Console
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.84 }}>
                Sign in to manage Task Passes, daily tasks, token rewards, approvals, and payout operations.
              </Typography>
            </Box>

            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <TextField
                  label="Phone number"
                  value={phone}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Password"
                  value={password}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                  type="password"
                  fullWidth
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const nextSession = await request<AdminSession>("/admin/auth/login", {
                        method: "POST",
                        body: JSON.stringify({ phone, password }),
                      });
                      localStorage.setItem(SESSION_KEY, nextSession.accessToken);
                      localStorage.setItem(`${SESSION_KEY}:user`, JSON.stringify(nextSession.user));
                      setSession(nextSession);
                      await loadDashboard(nextSession.accessToken);
                    } catch (loginError) {
                      setError(loginError instanceof Error ? loginError.message : "Unable to log in");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ShieldRoundedIcon />}
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                {SHOW_DEV_CREDENTIALS ? (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(31,95,191,0.04)" }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Seeded credentials
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Super admin: `9999999999` / `admin1234`
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Operator: `8888888888` / `operator1234`
                    </Typography>
                  </Paper>
                ) : null}
                {error ? <Alert severity="error">{error}</Alert> : null}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            bgcolor: "rgba(7,17,31,0.86)",
            backdropFilter: "blur(16px)",
            width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
            ml: { md: `${SIDEBAR_WIDTH}px` },
          }}
        >
          <Toolbar sx={{ minHeight: 78 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" sx={{ color: "secondary.dark", fontWeight: 700, letterSpacing: "0.18em" }}>
                Operator Console
              </Typography>
              <Typography variant="h5">Reward Wallet Admin</Typography>
            </Box>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={16} /> : <AutorenewRoundedIcon />}
                onClick={() => loadDashboard(session.accessToken)}
                disabled={loading}
              >
                Refresh
              </Button>
              <Chip
                color={providerStatus?.cashfree.paymentsLive ? "success" : "warning"}
                label={providerStatus?.cashfree.paymentsLive ? "Payments Live" : "Payments Mock"}
                variant="filled"
              />
              <Avatar sx={{ bgcolor: "primary.main" }}>{toInitials(session.user.name)}</Avatar>
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
                <Typography variant="subtitle2">{session.user.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {session.user.role}
                </Typography>
              </Box>
              <IconButton
                color="error"
                onClick={() => {
                  localStorage.removeItem(SESSION_KEY);
                  localStorage.removeItem(`${SESSION_KEY}:user`);
                  setSession(null);
                }}
              >
                <LogoutRoundedIcon />
              </IconButton>
            </Stack>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: SIDEBAR_WIDTH,
              boxSizing: "border-box",
              borderRight: "none",
            },
          }}
          open
        >
          {sidebar}
        </Drawer>

        <Box component="main" sx={{ ml: { md: `${SIDEBAR_WIDTH}px` }, px: { xs: 2, md: 4 }, py: { xs: 12, md: 14 } }}>
          <Stack spacing={3}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 5,
                color: "#ffffff",
                background: "linear-gradient(135deg, rgba(17,35,67,1) 0%, rgba(31,95,191,1) 52%, rgba(81,141,224,1) 100%)",
              }}
            >
              <Stack direction={{ xs: "column", lg: "row" }} spacing={3} justifyContent="space-between">
                <Box>
                  <Typography variant="overline" sx={{ letterSpacing: "0.18em", opacity: 0.72 }}>
                    Live operations view
                  </Typography>
                <Typography variant="h3" sx={{ mt: 0.5, mb: 1.5 }}>
                    Task Pass rewards command center
                  </Typography>
                  <Typography variant="body1" sx={{ maxWidth: 720, opacity: 0.84 }}>
                    Manage plans, daily tasks, milestones, referral commissions, token ledger entries, and redemption
                    requests without exposing the old listing marketplace in primary operations.
                  </Typography>
                </Box>
                <Stack spacing={1.25} minWidth={{ lg: 280 }}>
                  <StatusRow
                    label="Cashfree payouts"
                    value={providerStatus?.cashfree.payoutsLive ? "Live" : "Mock hold"}
                    tone={providerStatus?.cashfree.payoutsLive ? "success" : "warning"}
                  />
                  <StatusRow
                    label="Storage mode"
                    value={providerStatus?.storageMode ?? "memory"}
                    tone={
                      providerStatus?.storageMode === "postgres"
                        ? "success"
                        : providerStatus?.storageMode === "file"
                          ? "info"
                          : "warning"
                    }
                  />
                  <StatusRow
                    label="OTP mode"
                    value={providerStatus?.otpMode ?? "memory"}
                    tone={
                      providerStatus?.otpMode === "redis" ? "success" : providerStatus?.otpMode === "file" ? "info" : "warning"
                    }
                  />
                </Stack>
              </Stack>
            </Paper>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" },
                gap: 2,
              }}
            >
              {metrics.map((card) => (
                <Card key={card.title} sx={{ borderRadius: 5 }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                      <Box>
                        <Typography color="text.secondary" variant="body2">
                          {card.title}
                        </Typography>
                        <Typography variant="h4" sx={{ mt: 1, mb: 0.5 }}>
                          {card.value}
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                          {card.subtitle}
                        </Typography>
                      </Box>
                      <Avatar sx={{ bgcolor: "rgba(31,95,191,0.08)", color: "primary.main", width: 52, height: 52 }}>
                        {card.icon}
                      </Avatar>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {providerStatus ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
                  gap: 2,
                }}
              >
                <StatusCard
                  title="Cashfree Payments"
                  value={providerStatus.cashfree.paymentsLive ? "Live" : "Mock"}
                  subtitle={providerStatus.cashfree.baseUrl}
                  color={providerStatus.cashfree.paymentsLive ? "success" : "warning"}
                />
                <StatusCard
                  title="Cashfree Payouts"
                  value={providerStatus.cashfree.payoutsLive ? "Live" : "Mock hold"}
                  subtitle="Manual-safe until payout auth is enabled"
                  color={providerStatus.cashfree.payoutsLive ? "success" : "warning"}
                />
                <StatusCard
                  title="Persistence"
                  value={
                    providerStatus.databaseConfigured
                      ? "Postgres"
                      : providerStatus.storageMode === "file"
                        ? "FileStore"
                        : "Memory"
                  }
                  subtitle="Runtime balance and order state"
                  color={
                    providerStatus.databaseConfigured
                      ? "success"
                      : providerStatus.storageMode === "file"
                        ? "info"
                        : "warning"
                  }
                />
                <StatusCard
                  title="OTP Cache"
                  value={providerStatus.redisConfigured ? "Redis" : providerStatus.otpMode === "file" ? "File OTP" : "Memory"}
                  subtitle="OTP and rate-limit storage"
                  color={providerStatus.redisConfigured ? "success" : providerStatus.otpMode === "file" ? "info" : "warning"}
                />
              </Box>
            ) : null}

            {sectionMeta.some((section) => section.id === activeSection) ? renderRewardOpsSection() : null}

            {activeSection === "overview" ? (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.3fr 1fr" }, gap: 3 }}>
                <PanelCard
                  title="High priority queue"
                  subtitle="Fast actions for the work most likely to block user money flow."
                  action={
                    <Button
                      variant="contained"
                      startIcon={actionKey === "runMatching" ? <CircularProgress size={16} color="inherit" /> : <BubbleChartRoundedIcon />}
                      disabled={actionKey === "runMatching"}
                      onClick={() =>
                        onAction(
                          "runMatching",
                          async () => {
                            await request("/admin/matching/run", { method: "POST", token: session.accessToken });
                            await loadDashboard(session.accessToken);
                          },
                          "Matching cycle executed.",
                        )
                      }
                    >
                      Run matching
                    </Button>
                  }
                >
                  <Stack spacing={1.25}>
                    {(withdrawals?.items ?? []).slice(0, 4).map((withdrawal) => (
                      <QueueRow
                        key={withdrawal.id}
                        title={withdrawal.id}
                        subtitle={`Withdrawal review • ${withdrawal.status}`}
                        amount={toCurrency(withdrawal.amount)}
                        chipColor={withdrawal.status === "queued_for_review" ? "warning" : "info"}
                      />
                    ))}
                    {(deposits?.items ?? []).slice(0, 4).map((deposit) => (
                      <QueueRow
                        key={deposit.id}
                        title={deposit.id}
                        subtitle={`Deposit state • ${deposit.status}`}
                        amount={toCurrency(deposit.amount)}
                        chipColor={deposit.status === "listed" ? "success" : "warning"}
                      />
                    ))}
                  </Stack>
                </PanelCard>

                <PanelCard title="Live controls" subtitle="Operator toggles and mode awareness.">
                  <Stack spacing={2}>
                    <Button
                      variant={matchingPaused ? "contained" : "outlined"}
                      color={matchingPaused ? "warning" : "primary"}
                      startIcon={actionKey === "toggleMatching" ? <CircularProgress size={16} color="inherit" /> : <AutorenewRoundedIcon />}
                      disabled={actionKey === "toggleMatching"}
                      onClick={() =>
                        onAction(
                          "toggleMatching",
                          async () => {
                            const paused = !matchingPaused;
                            await request("/admin/matching/pause", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify({ paused }),
                            });
                            setMatchingPaused(paused);
                          },
                          matchingPaused ? "Matching resumed." : "Matching paused.",
                        )
                      }
                    >
                      {matchingPaused ? "Resume matching" : "Pause matching"}
                    </Button>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={providerStatus?.fallbackMode ? "Fallback active" : "Fully live"} color={providerStatus?.fallbackMode ? "warning" : "success"} />
                      <Chip
                        label={providerStatus?.storageMode === "file" ? "Restart-safe local mode" : "External database"}
                        color={providerStatus?.storageMode === "file" ? "info" : "success"}
                      />
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      Payments can run live through Cashfree now. Payouts remain held in mock-safe mode until payout API
                      access is enabled for your account.
                    </Typography>
                  </Stack>
                </PanelCard>
              </Box>
            ) : null}

            {activeSection === "users" ? (
              <PanelCard
                title="User roster"
                subtitle="Block or unblock accounts directly from the control desk."
                action={<Chip label={`${users?.total ?? 0} users`} color="primary" variant="outlined" />}
              >
                <TableContainer>
                  <Table>
                    <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Phone</TableCell>
                          <TableCell>Role</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Risk</TableCell>
                          <TableCell align="right">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                      {users?.items.map((user) => (
                        <TableRow key={user.id} hover>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar sx={{ width: 34, height: 34, bgcolor: user.blocked ? "error.light" : "primary.light" }}>
                                {toInitials(user.name)}
                              </Avatar>
                              <Box>
                                <Typography fontWeight={700}>{user.name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {user.referralCode}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>{user.phone}</TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell>
                            <Chip size="small" color={user.blocked ? "error" : "success"} label={user.blocked ? "Blocked" : "Active"} />
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Chip
                                size="small"
                                label={(riskReport?.users[user.id]?.level ?? "low").toUpperCase()}
                                color={riskColor(riskReport?.users[user.id]?.level ?? "low")}
                              />
                              {(riskReport?.users[user.id]?.reasons ?? []).slice(0, 1).map((reason) => (
                                <Typography key={reason} variant="caption" color="text.secondary">
                                  {reason}
                                </Typography>
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              variant={user.blocked ? "contained" : "outlined"}
                              color={user.blocked ? "success" : "error"}
                              disabled={actionKey === `user-${user.id}`}
                              onClick={() =>
                                onAction(
                                  `user-${user.id}`,
                                  async () => {
                                    await request(`/admin/users/${user.id}/block`, {
                                      method: "POST",
                                      token: session.accessToken,
                                      body: JSON.stringify({ blocked: !user.blocked }),
                                    });
                                    await loadDashboard(session.accessToken);
                                  },
                                  user.blocked ? `${user.name} unblocked.` : `${user.name} blocked.`,
                                )
                              }
                            >
                              {user.blocked ? "Unblock" : "Block"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </PanelCard>
              ) : null}

            {activeSection === "tasks" ? (
              <Stack spacing={3}>
                <PanelCard
                  title="Task Pass plans"
                  subtitle="Manage daily task ranges, caps, and pass duration."
                  action={
                    <Button
                      variant="contained"
                      onClick={() =>
                        onAction(
                          "save-task-pass-plans",
                          async () => {
                            await Promise.all(
                              taskPassPlans.map((plan) =>
                                request(`/admin/task-pass-plans/${plan.id}`, {
                                  method: "PATCH",
                                  token: session.accessToken,
                                  body: JSON.stringify({
                                    name: plan.name,
                                    durationDays: plan.durationDays,
                                    dailyTaskMin: plan.dailyTaskMin,
                                    dailyTaskMax: plan.dailyTaskMax,
                                    dailyTokenCap: plan.dailyTokenCap,
                                    targetTokens: plan.targetTokens,
                                    priceAmount: plan.priceAmount,
                                    currency: plan.currency,
                                    active: plan.active,
                                  }),
                                }),
                              ),
                            );
                            await loadDashboard(session.accessToken);
                          },
                          "Task Pass plans saved.",
                        )
                      }
                    >
                      Save plans
                    </Button>
                  }
                >
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Plan</TableCell>
                          <TableCell>Days</TableCell>
                          <TableCell>Task range</TableCell>
                          <TableCell>Daily cap</TableCell>
                          <TableCell>Target</TableCell>
                          <TableCell>Price</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {taskPassPlans.map((plan, index) => (
                          <TableRow key={plan.id} hover>
                            <TableCell>
                              <Stack spacing={1}>
                                <TextField
                                  value={plan.name}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    setTaskPassPlans((current) =>
                                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
                                    )
                                  }
                                />
                                <TextField
                                  value={plan.currency}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    setTaskPassPlans((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, currency: event.target.value.toUpperCase() } : item,
                                      ),
                                    )
                                  }
                                />
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={plan.durationDays}
                                onChange={(value) =>
                                  setTaskPassPlans((current) =>
                                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, durationDays: value } : item)),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={1}>
                                <NumberField
                                  value={plan.dailyTaskMin}
                                  onChange={(value) =>
                                    setTaskPassPlans((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, dailyTaskMin: value } : item,
                                      ),
                                    )
                                  }
                                />
                                <NumberField
                                  value={plan.dailyTaskMax}
                                  onChange={(value) =>
                                    setTaskPassPlans((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, dailyTaskMax: value } : item,
                                      ),
                                    )
                                  }
                                />
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={plan.dailyTokenCap}
                                onChange={(value) =>
                                  setTaskPassPlans((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, dailyTokenCap: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={plan.targetTokens}
                                onChange={(value) =>
                                  setTaskPassPlans((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, targetTokens: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={plan.priceAmount}
                                onChange={(value) =>
                                  setTaskPassPlans((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, priceAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant={plan.active ? "contained" : "outlined"}
                                color={plan.active ? "success" : "warning"}
                                onClick={() =>
                                  setTaskPassPlans((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, active: !item.active } : item,
                                    ),
                                  )
                                }
                              >
                                {plan.active ? "Active" : "Paused"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard
                  title="Create Task Pass plan"
                  subtitle="Add a new plan for admin-activated users."
                  action={
                    <Button
                      variant="contained"
                      onClick={() =>
                        onAction(
                          "create-task-pass-plan",
                          async () => {
                            await request("/admin/task-pass-plans", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify(newTaskPassPlan),
                            });
                            setNewTaskPassPlan(createTaskPassPlanDraft());
                            await loadDashboard(session.accessToken);
                          },
                          "Task Pass plan created.",
                        )
                      }
                    >
                      Create plan
                    </Button>
                  }
                >
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap flexWrap="wrap">
                    <TextField label="Plan name" value={newTaskPassPlan.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewTaskPassPlan((current) => ({ ...current, name: event.target.value }))} />
                    <TextField label="Currency" value={newTaskPassPlan.currency} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewTaskPassPlan((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                    <NumberField value={newTaskPassPlan.durationDays} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, durationDays: value }))} />
                    <NumberField value={newTaskPassPlan.dailyTaskMin} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTaskMin: value }))} />
                    <NumberField value={newTaskPassPlan.dailyTaskMax} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTaskMax: value }))} />
                    <NumberField value={newTaskPassPlan.dailyTokenCap} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, dailyTokenCap: value }))} />
                    <NumberField value={newTaskPassPlan.targetTokens} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, targetTokens: value }))} />
                    <NumberField value={newTaskPassPlan.priceAmount} onChange={(value) => setNewTaskPassPlan((current) => ({ ...current, priceAmount: value }))} />
                  </Stack>
                </PanelCard>

                <PanelCard title="User Task Passes" subtitle="Pending requests can be activated manually by admin.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Plan</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Dates</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {taskPasses.map((taskPass) => (
                          <TableRow key={taskPass.id} hover>
                            <TableCell>{taskPass.userId}</TableCell>
                            <TableCell>{taskPassPlans.find((plan) => plan.id === taskPass.planId)?.name ?? taskPass.planId}</TableCell>
                            <TableCell>
                              <Chip size="small" color={taskPass.status === "active" ? "success" : taskPass.status === "pending" ? "warning" : "default"} label={taskPass.status} />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {taskPass.startsAt ? toDateTime(taskPass.startsAt) : "Not started"}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  variant="contained"
                                  size="small"
                                  disabled={taskPass.status !== "pending"}
                                  onClick={() =>
                                    onAction(
                                      `task-pass-activate-${taskPass.id}`,
                                      async () => {
                                        await request(`/admin/task-passes/${taskPass.id}/activate`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Task Pass ${taskPass.id} activated.`,
                                    )
                                  }
                                >
                                  Activate
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  disabled={taskPass.status === "cancelled"}
                                  onClick={() =>
                                    onAction(
                                      `task-pass-cancel-${taskPass.id}`,
                                      async () => {
                                        await request(`/admin/task-passes/${taskPass.id}/cancel`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Task Pass ${taskPass.id} cancelled.`,
                                    )
                                  }
                                >
                                  Cancel
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Daily Tasks" subtitle="Configure which tasks can be assigned to active pass users.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Task</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Reward</TableCell>
                          <TableCell>Approval</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dailyTasks.map((task, index) => (
                          <TableRow key={task.id} hover>
                            <TableCell>
                              <Stack spacing={1}>
                                <TextField
                                  value={task.title}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    setDailyTasks((current) =>
                                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)),
                                    )
                                  }
                                />
                                <TextField
                                  multiline
                                  minRows={2}
                                  value={task.description}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    setDailyTasks((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, description: event.target.value } : item,
                                      ),
                                    )
                                  }
                                />
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <TextField
                                value={task.type}
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  setDailyTasks((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, type: event.target.value as DailyTask["type"] } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={task.rewardTokens}
                                onChange={(value) =>
                                  setDailyTasks((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, rewardTokens: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant={task.requiresApproval ? "contained" : "outlined"}
                                size="small"
                                onClick={() =>
                                  setDailyTasks((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, requiresApproval: !item.requiresApproval } : item,
                                    ),
                                  )
                                }
                              >
                                {task.requiresApproval ? "Required" : "Auto"}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Chip size="small" color={task.active ? "success" : "default"} label={task.active ? "Active" : "Paused"} />
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() =>
                                    onAction(
                                      `task-save-${task.id}`,
                                      async () => {
                                        await request(`/admin/tasks/${task.id}`, {
                                          method: "PATCH",
                                          token: session.accessToken,
                                          body: JSON.stringify({
                                            title: task.title,
                                            description: task.description,
                                            type: task.type,
                                            rewardTokens: task.rewardTokens,
                                            requiresApproval: task.requiresApproval,
                                            active: task.active,
                                          }),
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `${task.title} saved.`,
                                    )
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() =>
                                    onAction(
                                      `task-toggle-${task.id}`,
                                      async () => {
                                        await request(`/admin/tasks/${task.id}`, {
                                          method: "PATCH",
                                          token: session.accessToken,
                                          body: JSON.stringify({ active: !task.active }),
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `${task.title} updated.`,
                                    )
                                  }
                                >
                                  {task.active ? "Pause" : "Enable"}
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Assignment actions" subtitle="Assign today’s task set for active pass users.">
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <Button
                      variant="contained"
                      onClick={() =>
                        onAction(
                          "assign-all-daily",
                          async () => {
                            await request("/admin/daily/assign-all", {
                              method: "POST",
                              token: session.accessToken,
                            });
                            await loadDashboard(session.accessToken);
                          },
                          "Daily tasks assigned to active pass users.",
                        )
                      }
                    >
                      Assign daily tasks to all active users
                    </Button>
                  </Stack>
                  <TableContainer sx={{ mt: 2 }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Active pass</TableCell>
                          <TableCell align="right">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {users?.items.map((user) => {
                          const activePass = taskPasses.find((taskPass) => taskPass.userId === user.id && taskPass.status === "active");
                          return (
                            <TableRow key={`assign-${user.id}`} hover>
                              <TableCell>{user.name}</TableCell>
                              <TableCell>{activePass ? taskPassPlans.find((plan) => plan.id === activePass.planId)?.name ?? activePass.planId : "No active pass"}</TableCell>
                              <TableCell align="right">
                                <Button
                                  variant="outlined"
                                  size="small"
                                  disabled={!activePass}
                                  onClick={() =>
                                    onAction(
                                      `assign-user-${user.id}`,
                                      async () => {
                                        await request(`/admin/users/${user.id}/assign-daily-tasks`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `${user.name} received daily tasks.`,
                                    )
                                  }
                                >
                                  Assign today
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard
                  title="Create Daily Task"
                  subtitle="Add a new task to the active assignment pool."
                  action={
                    <Button
                      variant="contained"
                      onClick={() =>
                        onAction(
                          "create-daily-task",
                          async () => {
                            await request("/admin/tasks", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify(newDailyTask),
                            });
                            setNewDailyTask(createDailyTaskDraft());
                            await loadDashboard(session.accessToken);
                          },
                          "Daily task created.",
                        )
                      }
                    >
                      Create task
                    </Button>
                  }
                >
                  <Stack spacing={2}>
                    <TextField label="Title" value={newDailyTask.title} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewDailyTask((current) => ({ ...current, title: event.target.value }))} />
                    <TextField
                      label="Description"
                      multiline
                      minRows={3}
                      value={newDailyTask.description}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setNewDailyTask((current) => ({ ...current, description: event.target.value }))}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField label="Type" value={newDailyTask.type} onChange={(event: ChangeEvent<HTMLInputElement>) => setNewDailyTask((current) => ({ ...current, type: event.target.value as DailyTask["type"] }))} />
                      <NumberField value={newDailyTask.rewardTokens} onChange={(value) => setNewDailyTask((current) => ({ ...current, rewardTokens: value }))} />
                      <Button
                        variant={newDailyTask.requiresApproval ? "contained" : "outlined"}
                        onClick={() => setNewDailyTask((current) => ({ ...current, requiresApproval: !current.requiresApproval }))}
                      >
                        {newDailyTask.requiresApproval ? "Approval required" : "Auto approve"}
                      </Button>
                    </Stack>
                  </Stack>
                </PanelCard>

                <PanelCard title="Daily Assignments" subtitle="Inspect the latest assignment status, proof, and linked pass.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Task</TableCell>
                          <TableCell>Pass</TableCell>
                          <TableCell>Date</TableCell>
                          <TableCell>Status</TableCell>
                            <TableCell>Proof</TableCell>
                            <TableCell align="right">Review</TableCell>
                          </TableRow>
                        </TableHead>
                      <TableBody>
                        {dailyAssignments.map((item) => (
                          <TableRow key={item.assignment.id} hover>
                            <TableCell>
                              <Typography fontWeight={700}>{item.user?.name ?? item.assignment.userId}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.user?.phone ?? item.assignment.userId}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography fontWeight={700}>{item.task?.title ?? item.assignment.taskId}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.assignment.rewardTokens} tokens
                              </Typography>
                            </TableCell>
                            <TableCell>{item.plan?.name ?? item.taskPass?.planId ?? "-"}</TableCell>
                            <TableCell>{item.assignment.date}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                color={
                                  item.assignment.status === "claimed"
                                    ? "success"
                                    : item.assignment.status === "rejected"
                                      ? "error"
                                      : item.assignment.status === "approved"
                                        ? "info"
                                        : "warning"
                                }
                                label={item.assignment.status}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {item.assignment.proof || "No proof submitted"}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  variant="outlined"
                                  size="small"
                                  disabled={item.assignment.status !== "submitted"}
                                  onClick={() =>
                                    onAction(
                                      `approve-submission-${item.assignment.id}`,
                                      async () => {
                                        await request(`/admin/task-submissions/${item.assignment.id}/approve`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      "Task submission approved.",
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  disabled={item.assignment.status !== "submitted"}
                                  onClick={() =>
                                    onAction(
                                      `reject-submission-${item.assignment.id}`,
                                      async () => {
                                        await request(`/admin/task-submissions/${item.assignment.id}/reject`, {
                                          method: "POST",
                                          token: session.accessToken,
                                          body: JSON.stringify({ reason: "Rejected by admin review." }),
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      "Task submission rejected.",
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Milestones" subtitle="Plan milestones unlock token rewards after required day and completed task progress.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Plan</TableCell>
                          <TableCell>Required day</TableCell>
                          <TableCell>Tasks</TableCell>
                          <TableCell>Reward</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {milestones.map((milestone) => (
                          <TableRow key={milestone.id} hover>
                            <TableCell>{milestone.name}</TableCell>
                            <TableCell>{taskPassPlans.find((plan) => plan.id === milestone.planId)?.name ?? milestone.planId}</TableCell>
                            <TableCell>{milestone.requiredDay}</TableCell>
                            <TableCell>{milestone.requiredCompletedTasks}</TableCell>
                            <TableCell>{milestone.rewardTokens} tokens</TableCell>
                            <TableCell>
                              <Chip size="small" color={milestone.active ? "success" : "default"} label={milestone.active ? "active" : "disabled"} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Token ledger" subtitle="Separate ledger for task and check-in rewards.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Reason</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Balance after</TableCell>
                          <TableCell>When</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tokenLedger.map((entry) => (
                          <TableRow key={entry.id} hover>
                            <TableCell>{entry.userId}</TableCell>
                            <TableCell>{entry.reason}</TableCell>
                            <TableCell>{entry.direction === "credit" ? `+${entry.amount}` : `-${entry.amount}`}</TableCell>
                            <TableCell>{entry.balanceAfter}</TableCell>
                            <TableCell>{toDateTime(entry.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>
              </Stack>
            ) : null}
  
            {activeSection === "money" ? (
              <Stack spacing={3}>
                <PanelCard title="Deposit review" subtitle="Verify or inspect incoming top-up orders.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Deposit ID</TableCell>
                          <TableCell>User</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Risk</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell align="right">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {deposits?.items.map((deposit) => (
                          <TableRow key={deposit.id} hover>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: 13 }}>{deposit.id}</TableCell>
                            <TableCell>{deposit.userId}</TableCell>
                            <TableCell>{toCurrency(deposit.amount)}</TableCell>
                            <TableCell>
                              <Chip size="small" label={deposit.status} color={deposit.status === "listed" ? "success" : "warning"} />
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <Chip
                                  size="small"
                                  label={(riskReport?.deposits[deposit.id]?.level ?? "low").toUpperCase()}
                                  color={riskColor(riskReport?.deposits[deposit.id]?.level ?? "low")}
                                />
                                {(riskReport?.deposits[deposit.id]?.reasons ?? []).slice(0, 1).map((reason) => (
                                  <Typography key={reason} variant="caption" color="text.secondary">
                                    {reason}
                                  </Typography>
                                ))}
                              </Stack>
                            </TableCell>
                            <TableCell>{toDateTime(deposit.createdAt)}</TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  variant="outlined"
                                  disabled={deposit.status === "listed" || actionKey === `deposit-sync-${deposit.id}`}
                                  onClick={() =>
                                    onAction(
                                      `deposit-sync-${deposit.id}`,
                                      async () => {
                                        await request(`/admin/deposits/${deposit.id}/sync`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Deposit ${deposit.id} resynced.`,
                                    )
                                  }
                                >
                                  Resync
                                </Button>
                                <Button
                                  variant="outlined"
                                  disabled={deposit.status === "listed" || actionKey === `deposit-${deposit.id}`}
                                  onClick={() =>
                                    onAction(
                                      `deposit-${deposit.id}`,
                                      async () => {
                                        await request(`/admin/deposits/${deposit.id}/verify`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Deposit ${deposit.id} verified.`,
                                    )
                                  }
                                >
                                  Verify
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Reconciliation" subtitle="Orders that need a closer look before money ops drift.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Kind</TableCell>
                          <TableCell>Deposit</TableCell>
                          <TableCell>User</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Note</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(reconciliation?.entries ?? []).map((entry) => (
                          <TableRow key={entry.id} hover>
                            <TableCell>
                              <Chip
                                size="small"
                                color={entry.kind === "provider_paid_app_pending" ? "warning" : "info"}
                                label={entry.kind === "provider_paid_app_pending" ? "Provider paid / app pending" : "Listed / provider missing"}
                              />
                            </TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: 13 }}>{entry.depositId}</TableCell>
                            <TableCell>{entry.userId}</TableCell>
                            <TableCell>{toCurrency(entry.amount)}</TableCell>
                            <TableCell>{entry.status}</TableCell>
                            <TableCell>{entry.note}</TableCell>
                          </TableRow>
                        ))}
                        {!reconciliation?.entries.length ? (
                          <TableRow>
                            <td colSpan={6} style={{ padding: "14px 16px" }}>
                              <Typography variant="body2" color="text.secondary">
                                No reconciliation gaps detected right now.
                              </Typography>
                            </td>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Deposit bonus tokens" subtitle="Locked token bonuses created from qualifying deposits.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Deposit</TableCell>
                          <TableCell>Bonus</TableCell>
                          <TableCell>Unlock rule</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {depositBonuses.map((bonus) => (
                          <TableRow key={bonus.id} hover>
                            <TableCell>{bonus.userId}</TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: 13 }}>{bonus.depositId}</TableCell>
                            <TableCell>{bonus.bonusTokens} tokens</TableCell>
                            <TableCell>{bonus.unlockRequiredApprovedTasks} approved tasks</TableCell>
                            <TableCell>
                              <Chip size="small" color={bonus.status === "credited" ? "success" : "warning"} label={bonus.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Token redemptions" subtitle="Cash payout requests created from token balance.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Tokens</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {redemptions.map((requestItem) => (
                          <TableRow key={requestItem.id} hover>
                            <TableCell>{requestItem.userId}</TableCell>
                            <TableCell>{requestItem.tokens}</TableCell>
                            <TableCell>{toCurrency(requestItem.valueAmount)}</TableCell>
                            <TableCell>
                              <Chip size="small" color={requestItem.status === "paid" ? "success" : requestItem.status === "rejected" ? "error" : "warning"} label={requestItem.status} />
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={requestItem.status !== "pending"}
                                  onClick={() =>
                                    onAction(
                                      `redemption-approve-${requestItem.id}`,
                                      async () => {
                                        await request(`/admin/redemptions/${requestItem.id}/approve`, { method: "POST", token: session.accessToken });
                                        await loadDashboard(session.accessToken);
                                      },
                                      "Redemption approved.",
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={requestItem.status !== "approved"}
                                  onClick={() =>
                                    onAction(
                                      `redemption-paid-${requestItem.id}`,
                                      async () => {
                                        await request(`/admin/redemptions/${requestItem.id}/mark-paid`, { method: "POST", token: session.accessToken });
                                        await loadDashboard(session.accessToken);
                                      },
                                      "Redemption marked paid.",
                                    )
                                  }
                                >
                                  Mark paid
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  disabled={requestItem.status !== "pending"}
                                  onClick={() =>
                                    onAction(
                                      `redemption-reject-${requestItem.id}`,
                                      async () => {
                                        await request(`/admin/redemptions/${requestItem.id}/reject`, {
                                          method: "POST",
                                          token: session.accessToken,
                                          body: JSON.stringify({ reason: "Rejected by admin review." }),
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      "Redemption rejected.",
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Withdrawal queue" subtitle="Approve or reject cash wallet payout requests.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Request ID</TableCell>
                          <TableCell>User</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Risk</TableCell>
                          <TableCell>Updated</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {withdrawals?.items.map((withdrawal) => (
                          <TableRow key={withdrawal.id} hover>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: 13 }}>{withdrawal.id}</TableCell>
                            <TableCell>{withdrawal.userId}</TableCell>
                            <TableCell>{toCurrency(withdrawal.amount)}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={withdrawal.status}
                                color={
                                  withdrawal.status === "paid"
                                    ? "success"
                                    : withdrawal.status === "queued_for_review"
                                      ? "warning"
                                      : withdrawal.status === "rejected"
                                        ? "error"
                                        : "info"
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <Chip
                                  size="small"
                                  label={(riskReport?.withdrawals[withdrawal.id]?.level ?? "low").toUpperCase()}
                                  color={riskColor(riskReport?.withdrawals[withdrawal.id]?.level ?? "low")}
                                />
                                {(riskReport?.withdrawals[withdrawal.id]?.reasons ?? []).slice(0, 1).map((reason) => (
                                  <Typography key={reason} variant="caption" color="text.secondary">
                                    {reason}
                                  </Typography>
                                ))}
                              </Stack>
                            </TableCell>
                            <TableCell>{toDateTime(withdrawal.updatedAt)}</TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  variant="contained"
                                  color="success"
                                  disabled={withdrawal.status !== "queued_for_review" || actionKey === `approve-${withdrawal.id}`}
                                  onClick={() =>
                                    onAction(
                                      `approve-${withdrawal.id}`,
                                      async () => {
                                        await request(`/admin/withdrawals/${withdrawal.id}/approve`, {
                                          method: "POST",
                                          token: session.accessToken,
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Withdrawal ${withdrawal.id} approved.`,
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  disabled={withdrawal.status !== "queued_for_review" || actionKey === `reject-${withdrawal.id}`}
                                  onClick={() =>
                                    onAction(
                                      `reject-${withdrawal.id}`,
                                      async () => {
                                        await request(`/admin/withdrawals/${withdrawal.id}/reject`, {
                                          method: "POST",
                                          token: session.accessToken,
                                          body: JSON.stringify({ reason: "Rejected by operator" }),
                                        });
                                        await loadDashboard(session.accessToken);
                                      },
                                      `Withdrawal ${withdrawal.id} rejected.`,
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>
              </Stack>
            ) : null}

            {activeSection === "config" ? (
              <Stack spacing={3}>
                <PanelCard
                  title="Reward slabs"
                  subtitle="Tune deposit reward percentages with live save."
                  action={
                    <Button
                      variant="contained"
                      startIcon={actionKey === "save-rules" ? <CircularProgress size={16} color="inherit" /> : <SavingsRoundedIcon />}
                      disabled={actionKey === "save-rules"}
                      onClick={() =>
                        onAction(
                          "save-rules",
                          async () => {
                            await request("/admin/reward-rules", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify(rewardRules),
                            });
                            await loadDashboard(session.accessToken);
                          },
                          "Reward rules saved.",
                        )
                      }
                    >
                      Save rules
                    </Button>
                  }
                >
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Min deposit</TableCell>
                          <TableCell>Max deposit</TableCell>
                          <TableCell>Reward %</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rewardRules.map((rule, index) => (
                          <TableRow key={rule.id}>
                            <TableCell>
                              <NumberField
                                value={rule.minDepositAmount}
                                onChange={(value) =>
                                  setRewardRules((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, minDepositAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={rule.maxDepositAmount}
                                onChange={(value) =>
                                  setRewardRules((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, maxDepositAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={rule.rewardPercent}
                                onChange={(value) =>
                                  setRewardRules((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, rewardPercent: value } : item,
                                    ),
                                  )
                                }
                                endAdornment="%"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant={rule.active ? "contained" : "outlined"}
                                color={rule.active ? "success" : "warning"}
                                onClick={() =>
                                  setRewardRules((current) =>
                                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, active: !item.active } : item)),
                                  )
                                }
                              >
                                {rule.active ? "Active" : "Paused"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard
                  title="Chunk buckets"
                  subtitle="Control how verified deposits split into sellable units."
                  action={
                    <Button
                      variant="contained"
                      startIcon={actionKey === "save-buckets" ? <CircularProgress size={16} color="inherit" /> : <TuneRoundedIcon />}
                      disabled={actionKey === "save-buckets"}
                      onClick={() =>
                        onAction(
                          "save-buckets",
                          async () => {
                            await request("/admin/chunk-buckets", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify(chunkBuckets),
                            });
                            await loadDashboard(session.accessToken);
                          },
                          "Chunk buckets saved.",
                        )
                      }
                    >
                      Save buckets
                    </Button>
                  }
                >
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Bucket</TableCell>
                          <TableCell>Min</TableCell>
                          <TableCell>Max</TableCell>
                          <TableCell>Target</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {chunkBuckets.map((bucket, index) => (
                          <TableRow key={bucket.id}>
                            <TableCell>
                              <Typography fontWeight={700}>{bucket.label}</Typography>
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={bucket.minAmount}
                                onChange={(value) =>
                                  setChunkBuckets((current) =>
                                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, minAmount: value } : item)),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={bucket.maxAmount}
                                onChange={(value) =>
                                  setChunkBuckets((current) =>
                                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, maxAmount: value } : item)),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={bucket.targetAmount}
                                onChange={(value) =>
                                  setChunkBuckets((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, targetAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard
                  title="Demand pools"
                  subtitle="Tune requested and remaining pool depth by bucket."
                  action={
                    <Button
                      variant="contained"
                      startIcon={actionKey === "save-pools" ? <CircularProgress size={16} color="inherit" /> : <BubbleChartRoundedIcon />}
                      disabled={actionKey === "save-pools"}
                      onClick={() =>
                        onAction(
                          "save-pools",
                          async () => {
                            await request("/admin/demand-pools", {
                              method: "POST",
                              token: session.accessToken,
                              body: JSON.stringify(demandPools),
                            });
                            await loadDashboard(session.accessToken);
                          },
                          "Demand pools saved.",
                        )
                      }
                    >
                      Save pools
                    </Button>
                  }
                >
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Pool</TableCell>
                          <TableCell>Requested</TableCell>
                          <TableCell>Remaining</TableCell>
                          <TableCell>Priority</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {demandPools.map((pool, index) => (
                          <TableRow key={pool.id}>
                            <TableCell>
                              <Stack spacing={0.25}>
                                <Typography fontWeight={700}>{pool.label}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {pool.bucketId}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={pool.requestedAmount}
                                onChange={(value) =>
                                  setDemandPools((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, requestedAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <NumberField
                                value={pool.remainingAmount}
                                onChange={(value) =>
                                  setDemandPools((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, remainingAmount: value } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Chip size="small" color="primary" label={`P${pool.priority}`} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>
              </Stack>
            ) : null}

            {activeSection === "audit" ? (
              <PanelCard title="Operator audit trail" subtitle="Every sensitive action written by the admin backend.">
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Action</TableCell>
                        <TableCell>Entity</TableCell>
                        <TableCell>Admin</TableCell>
                        <TableCell>When</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {auditLogs?.items.map((log) => (
                        <TableRow key={log.id} hover>
                          <TableCell>
                            <Chip size="small" color="primary" variant="outlined" label={log.action} />
                          </TableCell>
                          <TableCell>
                            <Typography fontWeight={700}>{log.entityType}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                              {log.entityId}
                            </Typography>
                          </TableCell>
                          <TableCell>{log.adminUserId}</TableCell>
                          <TableCell>{toDateTime(log.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </PanelCard>
            ) : null}
          </Stack>
        </Box>

        <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
          <Alert severity="error" variant="filled" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>
        <Snackbar open={Boolean(successMessage)} autoHideDuration={3200} onClose={() => setSuccessMessage(null)}>
          <Alert severity="success" variant="filled" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

function PanelCard({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card sx={{ borderRadius: 5 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" sx={{ mb: 2.5 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          </Box>
          {action ? <Box>{action}</Box> : null}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function StatusCard({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: "success" | "warning" | "info" }) {
  return (
    <Card sx={{ borderRadius: 4 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" sx={{ mt: 1, mb: 0.75 }}>
          {value}
        </Typography>
        <Chip size="small" label={subtitle} color={color} variant="outlined" />
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "info" }) {
  return (
    <Paper
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: 3,
        bgcolor: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {label}
        </Typography>
        <Chip size="small" label={value} color={tone} />
      </Stack>
    </Paper>
  );
}

function QueueRow({ title, subtitle, amount, chipColor }: { title: string; subtitle: string; amount: string; chipColor: "warning" | "info" | "success" }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 3,
      }}
    >
      <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
        <Box>
          <Typography fontWeight={700}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        <Stack alignItems="flex-end" spacing={0.5}>
          <Typography fontWeight={800}>{amount}</Typography>
          <Chip size="small" color={chipColor} label={subtitle.split("•")[0].trim()} />
        </Stack>
      </Stack>
    </Paper>
  );
}

function NumberField({ value, onChange, endAdornment }: { value: number; onChange: (value: number) => void; endAdornment?: string }) {
  return (
    <TextField
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value || 0))}
      fullWidth
      InputProps={{
        endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : undefined,
      }}
    />
  );
}

export default App;
