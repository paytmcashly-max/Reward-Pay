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
  AdminAuditLog,
  ChunkBucket,
  DemandPool,
  DepositOrder,
  Paginated,
  RewardRule,
  User,
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

type NavSection = "overview" | "users" | "money" | "config" | "audit";

const dashboardTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1f5fbf", dark: "#163f81", light: "#6e97e2" },
    secondary: { main: "#c9812a", dark: "#9d6118", light: "#e8b061" },
    success: { main: "#227a5d" },
    warning: { main: "#c57a1e" },
    error: { main: "#c54e46" },
    background: { default: "#f3f6fb", paper: "#ffffff" },
    text: { primary: "#172033", secondary: "#607086" },
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
          border: "1px solid rgba(19, 32, 51, 0.08)",
          boxShadow: "0 18px 40px rgba(23, 32, 51, 0.08)",
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
  { id: "overview", label: "Overview", caption: "Ops health and live status", icon: <DashboardRoundedIcon /> },
  { id: "users", label: "Users", caption: "User control and status", icon: <PeopleRoundedIcon /> },
  { id: "money", label: "Money Ops", caption: "Deposits, payouts, reviews", icon: <AccountBalanceWalletRoundedIcon /> },
  { id: "config", label: "Config", caption: "Rules, buckets, demand", icon: <TuneRoundedIcon /> },
  { id: "audit", label: "Audit", caption: "Operator action trail", icon: <ReceiptLongRoundedIcon /> },
];

function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [phone, setPhone] = useState(import.meta.env.DEV ? "9999999999" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "admin1234" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [users, setUsers] = useState<Paginated<User> | null>(null);
  const [deposits, setDeposits] = useState<Paginated<DepositOrder> | null>(null);
  const [withdrawals, setWithdrawals] = useState<Paginated<WithdrawRequest> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Paginated<AdminAuditLog> | null>(null);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [chunkBuckets, setChunkBuckets] = useState<ChunkBucket[]>([]);
  const [demandPools, setDemandPools] = useState<DemandPool[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [matchingPaused, setMatchingPaused] = useState(false);

  const loadDashboard = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, depositsData, withdrawalsData, rewardRulesData, chunkBucketsData, demandPoolsData, auditLogsData, providerStatusData] =
        await Promise.all([
          request<Paginated<User>>("/admin/users?page=1&pageSize=50", { token }),
          request<Paginated<DepositOrder>>("/admin/deposits?page=1&pageSize=50", { token }),
          request<Paginated<WithdrawRequest>>("/admin/withdrawals?page=1&pageSize=50", { token }),
          request<RewardRule[]>("/admin/reward-rules", { token }),
          request<ChunkBucket[]>("/admin/chunk-buckets", { token }),
          request<DemandPool[]>("/admin/demand-pools", { token }),
          request<Paginated<AdminAuditLog>>("/admin/audit-logs?page=1&pageSize=20", { token }),
          request<ProviderStatus>("/health/providers"),
        ]);

      setUsers(usersData);
      setDeposits(depositsData);
      setWithdrawals(withdrawalsData);
      setRewardRules(rewardRulesData);
      setChunkBuckets(chunkBucketsData);
      setDemandPools(demandPoolsData);
      setAuditLogs(auditLogsData);
      setProviderStatus(providerStatusData);
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
    const listedInventory =
      deposits?.items.filter((deposit) => deposit.status === "listed").reduce((sum, deposit) => sum + deposit.amount, 0) ?? 0;
    const pendingDeposits = deposits?.items.filter((deposit) => deposit.status !== "listed").length ?? 0;
    const pendingWithdrawals =
      withdrawals?.items.filter((withdrawal) => withdrawal.status === "queued_for_review" || withdrawal.status === "provider_processing")
        .length ?? 0;
    const blockedUsers = users?.items.filter((user) => user.blocked).length ?? 0;

    return [
      { title: "Total Users", value: `${users?.total ?? 0}`, subtitle: `${blockedUsers} blocked for review`, icon: <PeopleRoundedIcon color="primary" /> },
      { title: "Pending Deposits", value: `${pendingDeposits}`, subtitle: "Orders awaiting verification", icon: <SavingsRoundedIcon color="warning" /> },
      { title: "Pending Withdrawals", value: `${pendingWithdrawals}`, subtitle: "Operator action or provider state", icon: <GavelRoundedIcon color="error" /> },
      { title: "Listed Inventory", value: toCurrency(listedInventory), subtitle: "Funds active in auto-sell engine", icon: <InsightsRoundedIcon color="success" /> },
    ];
  }, [deposits, users, withdrawals]);

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
                Sign in to manage rewards, approvals, liquidity buckets, and payout operations.
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
            borderBottom: "1px solid rgba(23,32,51,0.08)",
            bgcolor: "rgba(255,255,255,0.78)",
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
                    One place to control funds, rules, and user approvals
                  </Typography>
                  <Typography variant="body1" sx={{ maxWidth: 720, opacity: 0.84 }}>
                    Review deposits, approve withdrawals, tune rewards, and monitor storage and payout readiness without
                    bouncing between screens.
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
                            <TableCell>{toDateTime(deposit.createdAt)}</TableCell>
                            <TableCell align="right">
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
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </PanelCard>

                <PanelCard title="Withdrawal queue" subtitle="Approve or reject withdrawals from sold and unlocked balances only.">
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Request ID</TableCell>
                          <TableCell>User</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Status</TableCell>
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
