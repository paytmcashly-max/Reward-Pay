import { colors } from "@/theme/colors";
import { Text, View } from "@/ui/native";

type MetricChipProps = {
  label: string;
  value: string;
  tone: "gold" | "green" | "blue" | "plum";
};

const toneMap = {
  gold: { bg: colors.surfaceAlt, border: "#f2c069", text: colors.goldDeep },
  green: { bg: colors.greenSoft, border: "#8fd0ad", text: colors.green },
  blue: { bg: colors.blueSoft, border: "#99b6ff", text: colors.blue },
  plum: { bg: colors.plumSoft, border: "#c9a6bf", text: colors.plum },
};

export function MetricChip({ label, value, tone }: MetricChipProps) {
  const palette = toneMap[tone];

  return (
    <View
      style={{
        flex: 1,
        minWidth: 110,
        gap: 6,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
        padding: 14,
      }}
    >
      <Text selectable style={{ color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.7 }}>
        {label.toUpperCase()}
      </Text>
      <Text selectable style={{ color: palette.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}
