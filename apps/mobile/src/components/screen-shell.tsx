import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { LinearGradient } from "@/ui/gradient";
import { ScrollView, View } from "@/ui/native";

type ScreenShellProps = {
  children: ReactNode;
};

export function ScreenShell({ children }: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const topPadding = process.env.EXPO_OS === "ios" ? Math.max(insets.top * 0.28, 6) : Math.max(insets.top + 4, 14);
  const bottomPadding = process.env.EXPO_OS === "ios" ? Math.max(insets.bottom + 10, 16) : Math.max(insets.bottom + 12, 20);

  return (
    <LinearGradient colors={["#f7f8fc", "#f2f4f8", "#ebe7df"]} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 5,
          paddingTop: topPadding,
          gap: 8,
          paddingBottom: bottomPadding,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: -20,
            right: -30,
            width: 200,
            height: 200,
            borderRadius: 999,
            backgroundColor: "#d9e7ff99",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 260,
            left: -20,
            width: 150,
            height: 150,
            borderRadius: 999,
            backgroundColor: "#ffe0b299",
          }}
        />
        <View
          style={{
            gap: 8,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
