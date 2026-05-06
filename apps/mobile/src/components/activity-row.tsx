import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActivityFeedItem } from "@/utils/activity-feed";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Card, Text } from "@/ui/paper";
import { formatMoney, formatTimeLabel } from "@/utils/money";
import { StatusBadge } from "@/components/status-badge";

type ActivityRowProps = {
  item: ActivityFeedItem;
  compact?: boolean;
  onPress?: () => void;
};

const toneIcon: Record<ActivityFeedItem["tone"], keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: "check-decagram-outline",
  failed: "close-octagon-outline",
  warning: "clock-outline",
  neutral: "history",
  info: "bank-transfer",
};

const toneColor = {
  success: colors.green,
  failed: colors.coral,
  warning: colors.goldDeep,
  neutral: colors.muted,
  info: colors.blue,
};

export function ActivityRow({ item, compact = false, onPress }: ActivityRowProps) {
  const iconTone = toneColor[item.tone];

  return (
    <Card
      mode="outlined"
      onPress={onPress}
      style={{
        borderRadius: compact ? 15 : 18,
        borderCurve: "continuous",
        backgroundColor: "#ffffff",
      }}
    >
      <Card.Content
        style={{
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 7 : 9,
          gap: compact ? 4 : 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: compact ? 8 : 10 }}>
            <View
              style={{
                width: compact ? 28 : 34,
                height: compact ? 28 : 34,
                borderRadius: compact ? 10 : 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${iconTone}18`,
              }}
            >
              <MaterialCommunityIcons name={toneIcon[item.tone]} size={compact ? 14 : 17} color={iconTone} />
            </View>

            <View style={{ flex: 1, gap: compact ? 1 : 2 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                {item.title}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                {item.subtitle} | {formatTimeLabel(item.createdAt)}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text
              selectable
              style={{
                fontFamily: fontFamily.bold,
                fontSize: compact ? 12.5 : 14,
                lineHeight: compact ? 16 : 18,
                color: colors.ink,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatMoney(item.amount)}
            </Text>
            <StatusBadge label={item.badge} tone={item.tone} />
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}
