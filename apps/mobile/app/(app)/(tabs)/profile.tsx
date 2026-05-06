import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Alert, Pressable, View } from "@/ui/native";
import { Button, Text } from "@/ui/paper";
import { formatMoney, formatTimeLabel } from "@/utils/money";

type ActionRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  meta: string;
  accent: string;
  onPress?: () => void;
  href?: "/transactions" | "/referrals" | "/withdraw" | "/task-pass";
  destructive?: boolean;
};

function SummaryMetric({ label, value, icon, tone }: { label: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tone}18` }}>
          <MaterialCommunityIcons name={icon} size={14} color={tone} />
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

function ActionRow({ icon, label, meta, accent, onPress, href, destructive = false }: ActionRowProps) {
  const row = (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 11,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "#ece6db",
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${accent}18`,
        }}
      >
        <MaterialCommunityIcons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text selectable style={{ ...typography.cardTitle, color: destructive ? colors.coral : colors.ink }}>
          {label}
        </Text>
        <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
          {meta}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color="#98a2b3" />
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        {row}
      </Link>
    );
  }
  return row;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { wallet, user, beneficiaries, withdrawals, referral, currentTaskPass, signOut } = useMobileStore();
  const primaryBeneficiary = beneficiaries[0];
  const latestWithdrawal = withdrawals[0];

  return (
    <ScreenShell quietDecor>
      <SectionCard eyebrow="Profile" title={user?.name ?? "RewardPay user"} subtitle="Manage balance, payouts, and account settings.">
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}>
              <Text selectable style={{ ...typography.sectionTitle, color: colors.blue }}>
                {(user?.name || "R").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                {user?.phone ?? "No phone linked"}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                ID: {user?.id ?? "Not available"}
              </Text>
            </View>
            <StatusBadge label="Active" tone="success" />
          </View>

          <View style={{ flexDirection: "row", gap: 7 }}>
            <SummaryMetric label="Balance" value={formatMoney(wallet.withdrawableBalance)} icon="wallet-outline" tone={colors.blue} />
            <SummaryMetric label="Locked" value={formatMoney(wallet.lockedBalance)} icon="lock-outline" tone={colors.green} />
          </View>

          <View style={{ flexDirection: "row", gap: 7 }}>
            <SummaryMetric label="Pass" value={currentTaskPass?.plan ? "Active" : "None"} icon="shield-star-outline" tone={colors.goldDeep} />
            <SummaryMetric label="Referrals" value={`${referral.totalReferredUsers}`} icon="account-multiple-outline" tone={colors.plum} />
          </View>
        </View>
      </SectionCard>

      <SectionCard
        eyebrow="Payouts"
        title={primaryBeneficiary ? primaryBeneficiary.label : "Payout setup needed"}
        subtitle={primaryBeneficiary ? "Your saved payout method is ready for requests." : "Add a UPI or bank account before requesting a payout."}
      >
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 11, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}>
              <MaterialCommunityIcons name={primaryBeneficiary ? "bank-outline" : "bank-plus"} size={18} color={colors.blue} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                {primaryBeneficiary ? primaryBeneficiary.accountName : "No payout method added"}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                {primaryBeneficiary ? primaryBeneficiary.upiId ?? primaryBeneficiary.bankAccountNumber ?? "Saved payout method" : "Open withdraw setup to add your payout details."}
              </Text>
            </View>
            <StatusBadge label={primaryBeneficiary ? "Ready" : "Missing"} tone={primaryBeneficiary ? "success" : "warning"} />
          </View>

          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#eef2f8", backgroundColor: "#fbfcff", paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                  LATEST WITHDRAWAL
                </Text>
                <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                  {latestWithdrawal ? formatMoney(latestWithdrawal.amount) : "No request yet"}
                </Text>
                <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                  {latestWithdrawal ? formatTimeLabel(latestWithdrawal.createdAt) : "Your next payout request will appear here."}
                </Text>
              </View>
              <StatusBadge
                label={latestWithdrawal ? latestWithdrawal.status.replaceAll("_", " ") : "Ready"}
                tone={latestWithdrawal?.status === "paid" ? "success" : latestWithdrawal?.status === "rejected" || latestWithdrawal?.status === "reversed" ? "failed" : "warning"}
              />
            </View>
          </View>

          {latestWithdrawal ? (
            <View style={{ flexDirection: "row", gap: 7 }}>
              <Link href="/withdraw" asChild>
                <Button mode="contained-tonal" style={{ flex: 1, borderRadius: 14 }} contentStyle={{ minHeight: 36 }}>
                  Withdraw setup
                </Button>
              </Link>
              <Button
                mode="outlined"
                style={{ flex: 1, borderRadius: 14 }}
                contentStyle={{ minHeight: 36 }}
                onPress={() => router.push({ pathname: "/transaction-details", params: { source: "withdrawal", sourceId: latestWithdrawal.id } })}
              >
                View payout
              </Button>
            </View>
          ) : (
            <Link href="/withdraw" asChild>
              <Button mode="contained-tonal" style={{ borderRadius: 14 }} contentStyle={{ minHeight: 36 }}>
                Open withdraw setup
              </Button>
            </Link>
          )}
        </View>
      </SectionCard>

      <SectionCard eyebrow="Shortcuts" title="App shortcuts" subtitle="Open the most used screens from here.">
        <View style={{ gap: 9 }}>
          <ActionRow icon="gift-outline" label="Invite & earn" meta={`${referral.totalReferredUsers} joins | ${formatMoney(referral.totalCommissionTokens ?? 0)} added`} accent={colors.plum} href="/referrals" />
          <ActionRow icon="shield-star-outline" label="Task Pass" meta={currentTaskPass?.plan ? `${currentTaskPass.plan.name} active` : "Choose a plan to unlock daily tasks"} accent={colors.green} href="/task-pass" />
          <ActionRow icon="history" label="Activity history" meta="Balance activity and payout timeline" accent={colors.blue} href="/transactions" />
        </View>
      </SectionCard>

      <SectionCard eyebrow="Support" title="Help and account" subtitle="Support, legal, and session actions stay here.">
        <View style={{ gap: 9 }}>
          <ActionRow icon="headset" label="Help & support" meta="Reach support when you need account help" accent={colors.goldDeep} onPress={() => Alert.alert("Support", "Support center screen can be connected here next.")} />
          <ActionRow icon="shield-lock-outline" label="Legal & safety" meta="Terms, privacy, and account settings" accent={colors.plum} onPress={() => Alert.alert("Legal", "Terms, privacy, and safety links can be added here.")} />
          <ActionRow icon="logout" label="Sign out" meta="End this session on this device" accent={colors.coral} destructive onPress={() => signOut()} />
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
