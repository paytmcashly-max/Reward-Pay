import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BalanceActivityItem } from "@/utils/balance-activity";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { Pressable, View } from "@/ui/native";
import { Divider, Text } from "@/ui/paper";
import { formatMoney, formatTimeLabel } from "@/utils/money";

type BalanceActivityListProps = {
  items: BalanceActivityItem[];
  limit?: number;
  emptyMessage?: string;
};

const toneColor: Record<BalanceActivityItem["tone"], string> = {
  success: colors.green,
  failed: colors.coral,
  warning: colors.goldDeep,
  neutral: colors.muted,
  info: colors.blue,
};

const toneIcon: Record<BalanceActivityItem["source"], keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: "wallet-plus-outline",
  withdrawal: "bank-transfer-out",
  transaction: "swap-horizontal",
  token: "star-four-points-outline",
};

export function BalanceActivityList({ items, limit = 5, emptyMessage }: BalanceActivityListProps) {
  const router = useRouter();
  const visibleItems = items.slice(0, limit);

  if (!visibleItems.length) {
    return (
      <Text selectable style={{ ...typography.cardMeta, color: colors.muted, paddingVertical: 4 }}>
        {emptyMessage ?? "Activity will appear after money is added, passes are purchased, or rewards are credited."}
      </Text>
    );
  }

  return (
    <View style={{ gap: 0 }}>
      {visibleItems.map((item, index) => {
        const accent = toneColor[item.tone];
        const amountColor = item.direction === "credit" ? colors.green : item.direction === "debit" ? colors.coral : colors.ink;
        const amountPrefix = item.direction === "credit" ? "+" : item.direction === "debit" ? "-" : "";
        const canOpenDetail = item.source !== "token";

        return (
          <View key={item.id}>
            <Pressable
              disabled={!canOpenDetail}
              onPress={() => {
                if (!canOpenDetail) return;
                router.push({ pathname: "/transaction-details", params: { source: item.source, sourceId: item.sourceId } });
              }}
              style={{
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                opacity: canOpenDetail ? 1 : 0.98,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${accent}18`,
                }}
              >
                <MaterialCommunityIcons name={toneIcon[item.source]} size={15} color={accent} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text selectable numberOfLines={1} style={{ ...typography.cardTitle, color: colors.ink }}>
                  {item.title}
                </Text>
                <Text selectable numberOfLines={1} style={{ ...typography.cardMeta, color: colors.muted }}>
                  {item.subtitle} | {formatTimeLabel(item.createdAt)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text
                  selectable
                  style={{
                    fontFamily: fontFamily.bold,
                    fontSize: 13,
                    lineHeight: 17,
                    color: amountColor,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {amountPrefix}
                  {formatMoney(item.amount)}
                </Text>
                {item.badge ? (
                  <Text selectable numberOfLines={1} style={{ ...typography.badge, color: accent }}>
                    {item.badge}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {index < visibleItems.length - 1 ? <Divider /> : null}
          </View>
        );
      })}
    </View>
  );
}
