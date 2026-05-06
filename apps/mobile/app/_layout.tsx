import { ThemeProvider, DefaultTheme } from "@react-navigation/native";
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { AppLaunchScreen } from "@/components/app-launch-screen";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { paperTheme } from "@/theme/paper-theme";
import { fontFamily } from "@/theme/typography";
import { View } from "@/ui/native";
import { ActivityIndicator, PaperProvider, Text } from "@/ui/paper";

export default function RootLayout() {
  const { hydrate, isHydrating } = useMobileStore();
  const [fontsLoaded] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [launchReady, setLaunchReady] = useState(false);

  useEffect(() => {
    hydrate().catch(() => undefined);
  }, [hydrate]);

  useEffect(() => {
    const timer = setTimeout(() => setLaunchReady(true), 1650);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded || isHydrating || !launchReady) {
    return (
      <ThemeProvider value={DefaultTheme}>
        <PaperProvider theme={paperTheme}>
          {fontsLoaded ? (
            <AppLaunchScreen />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.page, padding: 24, gap: 16 }}>
              <ActivityIndicator size="large" color={colors.blue} />
              <Text selectable variant="headlineSmall" style={{ color: colors.ink, fontFamily: fontFamily.heavy }}>
                Preparing your wallet...
              </Text>
            </View>
          )}
        </PaperProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <PaperProvider theme={paperTheme}>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: "#ffffff" },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 17 },
          }}
        >
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Login", headerLargeTitle: false }} />
        </Stack>
      </PaperProvider>
    </ThemeProvider>
  );
}
