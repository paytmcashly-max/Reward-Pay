import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "@/ui/gradient";
import { View } from "@/ui/native";
import { Text } from "@/ui/paper";
import { fontFamily, typography } from "@/theme/typography";

type BrandMarkProps = {
  compact?: boolean;
  onDark?: boolean;
  showText?: boolean;
};

export function BrandMark({ compact = false, onDark = false, showText = true }: BrandMarkProps) {
  const size = compact ? 38 : 44;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 8 : 10 }}>
      <LinearGradient
        colors={["#1a3154", "#24518c", "#6e4eff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: compact ? 14 : 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons name="wallet-outline" size={compact ? 18 : 20} color="#ffffff" />
      </LinearGradient>

      {showText ? (
        <View style={{ gap: 1 }}>
          <Text selectable style={{ ...typography.cardTitle, color: onDark ? "#ffffff" : "#11233d" }}>
            Game Wallet
          </Text>
          <Text
            selectable
            style={{
              ...typography.cardMeta,
              color: onDark ? "#c8d7ec" : "#5f6f82",
              fontFamily: fontFamily.medium,
            }}
          >
            Smart wallet dashboard
          </Text>
        </View>
      ) : null}
    </View>
  );
}
