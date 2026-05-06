import { Redirect, Stack } from "expo-router";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { fontFamily } from "@/theme/typography";

export default function AppLayout() {
  const { isAuthenticated, demoMode } = useMobileStore();

  if (!isAuthenticated && !demoMode) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: colors.ink,
        headerBackTitle: "Back",
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 17 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="deposit" options={{ title: "Add Money" }} />
      <Stack.Screen name="task-pass" options={{ title: "Task Pass" }} />
      <Stack.Screen name="tokens" options={{ title: "Activity" }} />
      <Stack.Screen name="withdraw" options={{ title: "Withdraw" }} />
      <Stack.Screen name="referrals" options={{ title: "Referrals" }} />
      <Stack.Screen name="transaction-details" options={{ title: "Transaction Details" }} />
    </Stack>
  );
}
