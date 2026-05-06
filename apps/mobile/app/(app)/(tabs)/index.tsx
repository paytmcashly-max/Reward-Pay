import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { SectionCard } from "@/components/section-card";
import { ScreenShell } from "@/components/screen-shell";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { LinearGradient } from "@/ui/gradient";
import { View } from "@/ui/native";
import { Button, Divider, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

const claimedStatuses = new Set(["claimed"]);
const reasonLabels: Record<string, string> = {
  daily_checkin: "Daily Check-in",
  daily_task: "Daily Task",
  milestone_reward: "Milestone Reward",
  referral_commission: "Referral Commission",
  deposit_bonus: "Deposit Bonus",
  admin_adjustment: "Admin Adjustment",
  redemption: "Redemption",
};

function ProgressBar({ value, color = colors.green }: { value: number; color?: string }) {
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: "#ffffff55", overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

function HeroMetric({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2d4ba" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tone}20` }}>
          <MaterialCommunityIcons name={icon as never} size={14} color={tone} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
            {label}
          </Text>
        </View>
        <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user, wallet, dailyOverview, dailyTasks, tokenBalance, tokenLedger, claimDailyCheckIn, currentTaskPass, isSubmitting } = useMobileStore();

  const activePlan = currentTaskPass?.plan ?? dailyOverview?.activePlan ?? null;
  const balance = dailyOverview?.tokenBalance ?? tokenBalance;
  const assignedCount = dailyOverview?.assignedCount ?? dailyTasks.length;
  const completedCount = dailyOverview?.completedCount ?? dailyTasks.filter((item) => claimedStatuses.has(item.assignment.status)).length;
  const pendingCount = Math.max(assignedCount - completedCount, 0);
  const todayCap = balance?.todayCap ?? activePlan?.dailyTokenCap ?? 0;
  const todayEarned = balance?.todayEarned ?? 0;
  const tokenTotal = wallet.withdrawableBalance ?? balance?.balance ?? 0;
  const tokenProgress = todayCap ? (todayEarned / todayCap) * 100 : 0;
  const checkedIn = Boolean(dailyOverview?.checkInClaimed);
  const primaryAction = !activePlan ? (
    <Link href="/task-pass" asChild>
      <Button mode="contained" buttonColor={colors.gold} textColor={colors.ink} style={{ flex: 1, borderRadius: 15 }} contentStyle={{ minHeight: 40 }}>
        Get Task Pass
      </Button>
    </Link>
  ) : !checkedIn ? (
    <Button
      mode="contained"
      buttonColor={colors.gold}
      textColor={colors.ink}
      style={{ flex: 1, borderRadius: 15 }}
      contentStyle={{ minHeight: 40 }}
      loading={isSubmitting}
      disabled={isSubmitting}
      onPress={() => void claimDailyCheckIn()}
    >
      Check in
    </Button>
  ) : pendingCount > 0 ? (
    <Link href="/tasks" asChild>
      <Button mode="contained" buttonColor={colors.gold} textColor={colors.ink} style={{ flex: 1, borderRadius: 15 }} contentStyle={{ minHeight: 40 }}>
        Continue Tasks
      </Button>
    </Link>
  ) : (
    <Link href="/wallet" asChild>
      <Button mode="contained" buttonColor={colors.gold} textColor={colors.ink} style={{ flex: 1, borderRadius: 15 }} contentStyle={{ minHeight: 40 }}>
        View Rewards
      </Button>
    </Link>
  );

  return (
    <ScreenShell quietDecor>
      <View style={{ paddingHorizontal: 10, paddingTop: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}>
          <Text selectable style={{ ...typography.cardTitle, color: colors.blue }}>
            {(user?.name || "R").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
            Hi, {user?.name || "RewardPay user"}
          </Text>
          <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>
            Complete tasks and grow your balance.
          </Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e3e8f0" }}>
          <MaterialCommunityIcons name="bell-outline" size={18} color={colors.ink} />
        </View>
      </View>

      <LinearGradient colors={["#3b36c9", "#2f5fd0", "#17304e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, overflow: "hidden" }}>
        <View style={{ padding: 13, gap: 10 }}>
          <View style={{ position: "absolute", right: -22, top: -24, width: 112, height: 112, borderRadius: 999, backgroundColor: "#ffffff22" }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ ...typography.heroLabel, color: "#e8edff" }}>
                TOTAL BALANCE
              </Text>
              <Text selectable style={{ ...typography.heroValue, color: "#ffffff", fontSize: 30, lineHeight: 34 }}>
                {formatMoney(tokenTotal)}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: "#e8edff" }}>
                Available to use for passes, tasks, and payouts.
              </Text>
            </View>
            <View style={{ width: 38, height: 38, borderRadius: 15, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name="shield-star" size={20} color={colors.gold} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
            <View style={{ borderRadius: 999, backgroundColor: "#ffffff22", paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text selectable style={{ ...typography.cardMeta, color: "#ffffff", fontFamily: typography.cardTitle.fontFamily }}>
                Today {formatMoney(todayEarned)} / {formatMoney(todayCap)}
              </Text>
            </View>
          </View>

          <View style={{ gap: 5 }}>
            <Text selectable style={{ ...typography.metricLabel, color: "#e8edff" }}>
              TODAY'S REWARD PROGRESS
            </Text>
            <ProgressBar value={tokenProgress} color={colors.gold} />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {primaryAction}
            <Link href="/tasks" asChild>
              <Button mode="outlined" textColor="#ffffff" style={{ flex: 1, borderRadius: 15, borderColor: "#ffffff88" }} contentStyle={{ minHeight: 38 }}>
                Tasks
              </Button>
            </Link>
          </View>
        </View>
      </LinearGradient>

      <View style={{ flexDirection: "row", gap: 7 }}>
        <HeroMetric label="Today added" value={formatMoney(todayEarned)} icon="trending-up" tone={colors.goldDeep} />
        <HeroMetric label="Pending tasks" value={`${pendingCount}`} icon="clipboard-text-outline" tone={colors.blue} />
      </View>
      <View style={{ flexDirection: "row", gap: 7 }}>
        <HeroMetric label="Completed" value={`${completedCount}/${assignedCount}`} icon="clipboard-check-outline" tone={colors.green} />
        <HeroMetric label="Today limit" value={formatMoney(todayCap)} icon="flag-checkered" tone={colors.goldDeep} />
      </View>

      <SectionCard eyebrow="Recent activity" title="Latest balance updates" subtitle="Recent top-ups, task rewards, and deductions.">
        <View style={{ gap: 0 }}>
          {tokenLedger.slice(0, 3).map((entry) => (
            <View key={entry.id}>
              <View style={{ paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: entry.direction === "credit" ? colors.greenSoft : colors.coralSoft }}>
                  <MaterialCommunityIcons name={entry.direction === "credit" ? "plus" : "minus"} size={14} color={entry.direction === "credit" ? colors.green : colors.coral} />
                </View>
                <View style={{ flex: 1, gap: 0 }}>
                  <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                    {reasonLabels[entry.reason] ?? entry.reason.replaceAll("_", " ")}
                  </Text>
                  <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                    {new Date(entry.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text selectable style={{ ...typography.metricValue, color: entry.direction === "credit" ? colors.green : colors.coral }}>
                  {entry.direction === "credit" ? "+" : "-"}{entry.amount}
                </Text>
              </View>
              <Divider />
            </View>
          ))}
          {!tokenLedger.length ? (
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              Balance activity will appear after deposits, check-ins, and task claims.
            </Text>
          ) : null}
          <Link href="/tokens" asChild>
            <Button mode="text" contentStyle={{ minHeight: 30 }}>
              Open activity
            </Button>
          </Link>
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
