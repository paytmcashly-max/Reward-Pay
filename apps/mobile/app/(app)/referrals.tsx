import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Alert, View } from "@/ui/native";
import { Button, Divider, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

function StatPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 13, backgroundColor: "#ffe6b5", paddingHorizontal: 10, paddingVertical: 6 }}>
      <MaterialCommunityIcons name={icon as never} size={15} color={colors.blue} />
      <Text selectable style={{ ...typography.cardMeta, color: colors.ink, fontFamily: typography.cardTitle.fontFamily }}>
        {label}
      </Text>
    </View>
  );
}

function ProgressDot({
  icon,
  active,
  complete,
  label,
}: {
  icon: string;
  active?: boolean;
  complete?: boolean;
  label: string;
}) {
  const backgroundColor = complete ? colors.greenSoft : active ? colors.blueSoft : "#f1f4f8";
  const iconColor = complete ? colors.green : active ? colors.blue : colors.muted;

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          borderWidth: complete || active ? 0 : 1,
          borderColor: "#d9e0ea",
        }}
      >
        <MaterialCommunityIcons name={icon as never} size={14} color={iconColor} />
      </View>
      <Text selectable style={{ ...typography.badge, color: complete || active ? colors.ink : colors.muted }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function ProgressLine({ active }: { active?: boolean }) {
  return <View style={{ flex: 1, height: 2, borderRadius: 999, backgroundColor: active ? "#b9cbff" : "#e6ebf2", marginTop: 12 }} />;
}

function ReferralProgress({ status, rewardTokens }: { status: string; rewardTokens: number }) {
  const joinedComplete = true;
  const waitingActive = status !== "credited";
  const rewardComplete = status === "credited";

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <ProgressDot icon="check" complete={joinedComplete} label="Joined" />
        <ProgressLine active />
        <ProgressDot icon={rewardComplete ? "check" : "progress-clock"} active={waitingActive} complete={rewardComplete} label={rewardComplete ? "Done" : "Wait"} />
        <ProgressLine active={rewardComplete} />
        <View style={{ alignItems: "center", gap: 4 }}>
          <View
            style={{
              minWidth: 52,
              height: 26,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
              backgroundColor: rewardComplete ? colors.greenSoft : "#f1f4f8",
              borderWidth: rewardComplete ? 0 : 1,
              borderColor: "#d9e0ea",
            }}
          >
            <Text selectable style={{ ...typography.cardMeta, color: rewardComplete ? colors.green : colors.muted, fontFamily: typography.cardTitle.fontFamily }}>
              {rewardComplete ? `+${rewardTokens}` : "0"}
            </Text>
          </View>
          <Text selectable style={{ ...typography.badge, color: rewardComplete ? colors.ink : colors.muted }}>
            REWARD
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ReferralsScreen() {
  const { referral } = useMobileStore();
  const inviteMessage = `Join me on RewardPay with invite code ${referral.code}. Complete tasks and unlock rewards together.`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: inviteMessage,
      });
    } catch {
      Alert.alert("Unable to share", "Please try again.");
    }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(referral.code);
      Alert.alert("Code copied", `${referral.code} has been copied.`);
    } catch {
      Alert.alert("Unable to copy", "Please try again.");
    }
  };

  return (
    <ScreenShell quietDecor>
      <SectionCard
        eyebrow="Invite"
        title="Invite and earn"
        subtitle="Commission is added only after your referral completes the required task or milestone."
      >
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.blue }}>
                YOUR INVITE CODE
              </Text>
              <Text selectable style={{ ...typography.heroValue, color: colors.ink, fontSize: 24, lineHeight: 28 }}>
                {referral.code}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                Share this code with friends to unlock referral rewards later.
              </Text>
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.greenSoft }}>
              <MaterialCommunityIcons name="gift-outline" size={22} color={colors.green} />
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            <StatPill icon="account-multiple-outline" label={`Joined ${referral.totalReferredUsers}`} />
            <StatPill icon="check-decagram-outline" label={`Rewarded ${referral.rewardedReferrals}`} />
            <StatPill icon="star-four-points-outline" label={formatMoney(referral.totalCommissionTokens)} />
            <StatPill icon="clock-outline" label={`Pending ${formatMoney(referral.pendingCommissionTokens)}`} />
          </View>

          <View style={{ flexDirection: "row", gap: 7 }}>
            <Button mode="contained" style={{ flex: 1, borderRadius: 14 }} contentStyle={{ minHeight: 38 }} onPress={() => void handleShare()}>
              Share code
            </Button>
            <Button mode="outlined" style={{ flex: 1, borderRadius: 14 }} contentStyle={{ minHeight: 38 }} onPress={() => void handleCopy()}>
              Copy code
            </Button>
          </View>
        </View>
      </SectionCard>

      <SectionCard eyebrow="Invite progress" title="How each referral moves" subtitle={referral.commissionNote}>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 10, gap: 8 }}>
          <ReferralProgress status="credited" rewardTokens={50} />
          <Divider />
          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
            Progress format: joined {"->"} waiting for trigger {"->"} reward added.
          </Text>
        </View>
      </SectionCard>

      <SectionCard eyebrow="Referral status" title={`${referral.referrals.length} invited users`} subtitle="Track which referrals have qualified for commission.">
        <View style={{ gap: 8 }}>
          {referral.referrals.map((item) => (
            <View key={item.userId} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 10, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: item.status === "credited" ? colors.greenSoft : colors.blueSoft }}>
                  <MaterialCommunityIcons name={item.status === "credited" ? "check-decagram" : "account-clock-outline"} size={17} color={item.status === "credited" ? colors.green : colors.blue} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                    {item.name}
                  </Text>
                  <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                    Joined {new Date(item.joinedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </Text>
                </View>
                <StatusBadge label={item.status === "credited" ? "Rewarded" : "Waiting"} tone={item.status === "credited" ? "success" : "info"} />
              </View>

              <ReferralProgress status={item.status} rewardTokens={item.rewardTokens} />
            </View>
          ))}
          {!referral.referrals.length ? (
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              No invited users yet.
            </Text>
          ) : null}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
