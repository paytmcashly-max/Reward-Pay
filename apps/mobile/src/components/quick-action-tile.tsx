import { Link } from "expo-router";
import { colors } from "@/theme/colors";
import { Pressable, View } from "@/ui/native";
import { Surface, Text } from "@/ui/paper";

type QuickActionTileProps = {
  href: "/wallet" | "/transactions" | "/games" | "/referrals" | "/profile" | "/deposit" | "/withdraw";
  title: string;
  subtitle: string;
  accent: string;
};

export function QuickActionTile({ href, title, subtitle, accent }: QuickActionTileProps) {
  return (
    <Link href={href} asChild>
      <Pressable
        style={{ flex: 1 }}
      >
        <Surface
          elevation={2}
          style={{
            minHeight: 118,
            gap: 12,
            borderRadius: 20,
            backgroundColor: "#ffffff",
            padding: 14,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              backgroundColor: `${accent}22`,
              borderWidth: 1,
              borderColor: `${accent}55`,
            }}
          />
          <View style={{ gap: 4 }}>
            <Text selectable variant="titleMedium" style={{ color: colors.ink, fontWeight: "800" }}>
              {title}
            </Text>
            <Text selectable variant="bodyMedium" style={{ color: colors.muted, lineHeight: 19 }}>
              {subtitle}
            </Text>
          </View>
        </Surface>
      </Pressable>
    </Link>
  );
}
