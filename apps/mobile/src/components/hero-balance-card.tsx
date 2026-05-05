import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { WalletSummary } from "@reward-wallet/shared";
import { Link } from "expo-router";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { View, useWindowDimensions } from "@/ui/native";
import { LinearGradient } from "@/ui/gradient";
import { Button, Surface, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

type HeroBalanceCardProps = {
  wallet: WalletSummary;
};

export function HeroBalanceCard({ wallet }: HeroBalanceCardProps) {
  const { width } = useWindowDimensions();
  const isAndroid = process.env.EXPO_OS === "android";
  const compact = width < 380 || (isAndroid && width < 430);
  const ultraCompact = width < 350 || (isAndroid && width < 395);

  const metricCards = [
    { label: "Reward", value: wallet.rewardBalance, bg: "#f5c24f22", border: "#f5c24f40" },
    { label: "Sold", value: wallet.soldBalance, bg: "#34b27b1f", border: "#34b27b3b" },
    { label: "Listed", value: wallet.listedBalance, bg: "#7a9fff1f", border: "#7a9fff3b" },
    { label: "Locked", value: wallet.lockedBalance, bg: "#ffffff10", border: "#ffffff1e" },
  ];

  return (
    <Surface
      elevation={3}
      style={{
        overflow: "hidden",
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: "transparent",
      }}
    >
      <LinearGradient
        colors={["#3f27d7", "#24478b", "#132742"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: ultraCompact ? 10 : 12,
          paddingVertical: ultraCompact ? 9 : 11,
          gap: ultraCompact ? 5 : 6,
          borderRadius: 22,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: -48,
            right: -28,
            width: 154,
            height: 154,
            borderRadius: 999,
            backgroundColor: "#ffffff12",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: -68,
            left: -34,
            width: 110,
            height: 110,
            borderRadius: 999,
            backgroundColor: "#f5c46d12",
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: ultraCompact ? 8 : 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ gap: 2 }}>
              <Text selectable style={{ ...typography.heroLabel, color: "#d4dcf5" }}>
                WALLET BALANCE
              </Text>
              <Text
                selectable
                style={{
                  ...typography.heroValue,
                  color: "#ffffff",
                  fontSize: ultraCompact ? 19 : compact ? 20 : 21,
                  lineHeight: ultraCompact ? 22 : compact ? 23 : 24,
                }}
              >
                {formatMoney(wallet.withdrawableBalance)}
              </Text>
            </View>
          </View>
          <View
            style={{
              width: ultraCompact ? 38 : 42,
              height: ultraCompact ? 38 : 42,
              borderRadius: ultraCompact ? 12 : 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#ffffff14",
              borderWidth: 1,
              borderColor: "#ffffff22",
            }}
          >
            <MaterialCommunityIcons name="wallet-outline" size={ultraCompact ? 17 : 19} color="#ffffff" />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ultraCompact ? 6 : 7 }}>
          {metricCards.map((metric) => (
            <View
              key={metric.label}
              style={{
                flexBasis: "48.5%",
                flexGrow: 1,
                gap: 1,
                borderRadius: 11,
                borderCurve: "continuous",
                paddingHorizontal: ultraCompact ? 7 : 8,
                paddingVertical: ultraCompact ? 4 : 5,
                backgroundColor: metric.bg,
                borderWidth: 1,
                borderColor: metric.border,
              }}
            >
              <Text selectable style={{ ...typography.metricLabel, color: "#dce6f8" }}>
                {metric.label}
              </Text>
              <Text
                selectable
                style={{
                  ...typography.metricValue,
                  color: "#ffffff",
                  fontSize: ultraCompact ? 11.5 : 12.5,
                  lineHeight: ultraCompact ? 14 : 15,
                }}
              >
                {formatMoney(metric.value)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: ultraCompact ? 6 : 8 }}>
          <Link href="/deposit" asChild>
            <Button
              mode="contained-tonal"
              buttonColor={colors.gold}
              textColor={colors.ink}
              style={{ flex: 1, borderRadius: 16 }}
              labelStyle={{ fontFamily: fontFamily.bold, fontSize: ultraCompact ? 10 : compact ? 10.5 : 11 }}
              contentStyle={{ minHeight: ultraCompact ? 32 : compact ? 34 : 35 }}
            >
              Add Money
            </Button>
          </Link>
          <Link href="/withdraw" asChild>
            <Button
              mode="outlined"
              textColor="#ffffff"
              style={{ flex: 1, borderRadius: 16, borderColor: "#ffffff55" }}
              labelStyle={{ fontFamily: fontFamily.bold, fontSize: ultraCompact ? 10 : compact ? 10.5 : 11 }}
              contentStyle={{ minHeight: ultraCompact ? 32 : compact ? 34 : 35 }}
            >
              Withdraw
            </Button>
          </Link>
        </View>
      </LinearGradient>
    </Surface>
  );
}
