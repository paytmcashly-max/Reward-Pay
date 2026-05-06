import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { LinearGradient } from "@/ui/gradient";
import { ScrollView, View } from "@/ui/native";

type ScreenShellProps = {
  children: ReactNode;
  quietDecor?: boolean;
};

export function ScreenShell({ children, quietDecor = false }: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const topPadding = process.env.EXPO_OS === "ios" ? Math.max(insets.top * 0.24, 5) : Math.max(insets.top + 2, 12);
  const bottomPadding = process.env.EXPO_OS === "ios" ? Math.max(insets.bottom + 86, 96) : Math.max(insets.bottom + 82, 92);

  return (
    <LinearGradient colors={["#f7f8fc", "#f2f4f8", "#ebe7df"]} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 6,
          paddingTop: topPadding,
          gap: 7,
          paddingBottom: bottomPadding,
        }}
      >
        {quietDecor ? null : (
          <>
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
          </>
        )}
        <View
          style={{
            gap: 7,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
