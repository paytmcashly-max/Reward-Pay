import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Text } from "@/ui/paper";

type StatusTone = "success" | "failed" | "warning" | "neutral" | "info";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneStyles: Record<StatusTone, { backgroundColor: string; color: string }> = {
  success: { backgroundColor: "#dff4e7", color: colors.green },
  failed: { backgroundColor: "#ffe1da", color: colors.coral },
  warning: { backgroundColor: "#fff0cc", color: colors.goldDeep },
  neutral: { backgroundColor: "#eef1f5", color: colors.muted },
  info: { backgroundColor: "#dfe8ff", color: colors.blue },
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: toneStyle.backgroundColor,
      }}
    >
      <Text selectable style={{ ...typography.badge, color: toneStyle.color }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
