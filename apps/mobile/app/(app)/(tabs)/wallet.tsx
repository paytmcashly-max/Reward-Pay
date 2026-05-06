import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Button, Divider, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

const reasonLabels: Record<string, string> = {
  daily_checkin: "Daily Check-in",
  daily_task: "Daily Task",
  milestone_reward: "Milestone Reward",
  referral_commission: "Referral Commission",
  deposit_bonus: "Deposit Bonus",
  admin_adjustment: "Admin Adjustment",
  redemption: "Redemption",
};

function MiniMetric({ label, value, helper, icon, tone }: { label: string; value: string; helper: string; icon: string; tone: string }) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 9, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tone}18` }}>
          <MaterialCommunityIcons name={icon as never} size={15} color={tone} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
            {label}
          </Text>
          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
            {helper}
          </Text>
        </View>
        <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const { wallet, tokenBalance, tokenLedger, currentTaskPass } = useMobileStore();
  const totalBalance = wallet.withdrawableBalance;
  const tokenToday = tokenBalance?.todayEarned ?? 0;
  const tokenCap = tokenBalance?.todayCap ?? currentTaskPass?.plan?.dailyTokenCap ?? 0;

  return (
    <ScreenShell quietDecor>
      <SectionCard
        eyebrow="Wallet"
        title="Balance"
        subtitle="Add money, buy a Task Pass, and grow one usable balance."
      >
        <View style={{ borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: colors.outline, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.blue }}>
                AVAILABLE BALANCE
              </Text>
              <Text selectable style={{ ...typography.heroValue, color: colors.ink, fontSize: 28, lineHeight: 32 }}>
                {formatMoney(totalBalance)}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                Use this balance to purchase your next Task Pass.
              </Text>
            </View>
            <View style={{ width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}>
              <MaterialCommunityIcons name="wallet-plus-outline" size={22} color={colors.blue} />
            </View>
          </View>

          <MiniMetric label="Today added" value={`${tokenToday}/${tokenCap}`} helper="Rewards added from tasks and check-ins" icon="star-circle-outline" tone={colors.green} />

          <View style={{ flexDirection: "row", gap: 7 }}>
            <Link href="/deposit" asChild>
              <Button mode="contained" style={{ flex: 1, borderRadius: 14 }} contentStyle={{ minHeight: 40 }}>
                Add money
              </Button>
            </Link>
            <Link href="/task-pass" asChild>
              <Button mode="contained-tonal" style={{ flex: 1, borderRadius: 14 }} contentStyle={{ minHeight: 40 }}>
                Buy Task Pass
              </Button>
            </Link>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        eyebrow="Task Pass flow"
        title={currentTaskPass?.plan ? `${currentTaskPass.plan.name} active` : "No active Task Pass"}
        subtitle={
          currentTaskPass?.plan
            ? "Keep completing daily tasks to grow your balance."
            : "Add money or choose a pass directly to unlock daily tasks and check-ins."
        }
      >
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 11, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.greenSoft }}>
              <MaterialCommunityIcons name="lightning-bolt-outline" size={18} color={colors.green} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                Simple purchase flow
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                Add money or buy a pass directly. Payment activates your pass, then daily rewards start adding to your balance.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <View style={{ borderRadius: 999, backgroundColor: colors.blueSoft, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text selectable style={{ ...typography.cardMeta, color: colors.blue, fontFamily: typography.cardTitle.fontFamily }}>
                1. Add money
              </Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: "#ffe8bf", paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text selectable style={{ ...typography.cardMeta, color: colors.goldDeep, fontFamily: typography.cardTitle.fontFamily }}>
                2. Buy pass
              </Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: colors.greenSoft, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text selectable style={{ ...typography.cardMeta, color: colors.green, fontFamily: typography.cardTitle.fontFamily }}>
                3. Earn rewards
              </Text>
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard eyebrow="Recent activity" title="Latest balance updates" subtitle="Top-ups, purchases, and reward activity appear here in one compact list.">
        <View style={{ gap: 0 }}>
          {tokenLedger.slice(0, 5).map((entry) => (
            <View key={entry.id}>
              <View style={{ paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: entry.direction === "credit" ? colors.greenSoft : colors.coralSoft,
                  }}
                >
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
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted, paddingVertical: 4 }}>
              Activity will appear after money is added, passes are purchased, or rewards are credited.
            </Text>
          ) : null}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
