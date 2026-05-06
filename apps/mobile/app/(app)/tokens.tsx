import { SectionCard } from "@/components/section-card";
import { ScreenShell } from "@/components/screen-shell";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Divider, Text } from "@/ui/paper";

const reasonLabels: Record<string, string> = {
  daily_checkin: "Daily Check-in",
  daily_task: "Daily Task",
  milestone_reward: "Milestone Reward",
  referral_commission: "Referral Commission",
  deposit_bonus: "Deposit Bonus",
  admin_adjustment: "Admin Adjustment",
  redemption: "Redemption",
};

export default function TokenWalletScreen() {
  const { tokenBalance, tokenLedger } = useMobileStore();

  return (
    <ScreenShell quietDecor>
      <SectionCard
        eyebrow="Balance Activity"
        title={`${tokenBalance?.balance ?? 0} balance`}
        subtitle="Task rewards, check-ins, deposits, and deductions appear here."
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 9 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.greenSoft }}>
                <Text selectable style={{ ...typography.badge, color: colors.green }}>+T</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                  Earned today
                </Text>
              </View>
              <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
                {tokenBalance?.todayEarned ?? 0}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 9 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.gold + "22" }}>
                <Text selectable style={{ ...typography.badge, color: colors.goldDeep }}>CAP</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                  Daily cap
                </Text>
              </View>
              <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
                {tokenBalance?.todayCap ?? 0}
              </Text>
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard eyebrow="Activity" title="Balance history" subtitle="Every credit and debit is recorded here.">
        <View style={{ gap: 0 }}>
          {tokenLedger.length ? (
            tokenLedger.map((entry) => (
              <View key={entry.id}>
                <View style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: entry.direction === "credit" ? colors.greenSoft : colors.coralSoft,
                    }}
                  >
                    <Text selectable style={{ ...typography.badge, color: entry.direction === "credit" ? colors.green : colors.coral }}>
                      {entry.direction === "credit" ? "+" : "-"}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                      {reasonLabels[entry.reason] ?? entry.reason.replaceAll("_", " ")}
                    </Text>
                    <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 1 }}>
                    <Text selectable style={{ ...typography.metricValue, color: entry.direction === "credit" ? colors.green : colors.coral }}>
                      {entry.direction === "credit" ? "+" : "-"}{entry.amount}
                    </Text>
                    <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                      Bal {entry.balanceAfter}
                    </Text>
                  </View>
                </View>
                <Divider />
              </View>
            ))
          ) : (
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              No balance activity yet.
            </Text>
          )}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
