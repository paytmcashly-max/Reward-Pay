import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useMemo } from "react";
import { BalanceActivityList } from "@/components/balance-activity-list";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Button, Text } from "@/ui/paper";
import { buildBalanceActivity } from "@/utils/balance-activity";
import { formatMoney } from "@/utils/money";

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
  const { wallet, tokenBalance, tokenLedger, currentTaskPass, deposits, withdrawals, transactions } = useMobileStore();
  const totalBalance = wallet.withdrawableBalance;
  const tokenToday = tokenBalance?.todayEarned ?? 0;
  const tokenCap = tokenBalance?.todayCap ?? currentTaskPass?.plan?.dailyTokenCap ?? 0;
  const hasDailyRewardCap = tokenCap > 0;
  const activityItems = useMemo(
    () => buildBalanceActivity({ deposits, withdrawals, transactions, tokenLedger }),
    [deposits, tokenLedger, transactions, withdrawals],
  );

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

          {hasDailyRewardCap ? (
            <MiniMetric label="Today added" value={`${tokenToday}/${tokenCap}`} helper="Rewards added from tasks and check-ins" icon="star-circle-outline" tone={colors.green} />
          ) : (
            <MiniMetric label="Task Pass" value="Not active" helper="Buy a pass to start daily rewards" icon="shield-star-outline" tone={colors.goldDeep} />
          )}

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
        <BalanceActivityList items={activityItems} limit={6} />
      </SectionCard>
    </ScreenShell>
  );
}
