import { Link, Stack } from "expo-router";
import { Pressable, Text, View } from "@/ui/native";
import { colors } from "@/theme/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.page, gap: 16 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 28, fontWeight: "900" }}>
          Screen not found
        </Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 20 }}>
          The route does not exist in this MVP shell yet.
        </Text>
        <Link href="/" asChild>
          <Pressable
            style={{
              alignSelf: "flex-start",
              borderRadius: 18,
              borderCurve: "continuous",
              backgroundColor: colors.ink,
              paddingHorizontal: 18,
              paddingVertical: 12,
            }}
          >
            <Text selectable style={{ color: "#ffffff", fontWeight: "800" }}>
              Go Home
            </Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
