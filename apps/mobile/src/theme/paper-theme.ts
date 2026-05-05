import { configureFonts, MD3LightTheme } from "react-native-paper";
import { colors } from "@/theme/colors";
import { fontFamily } from "@/theme/typography";

const paperFonts = configureFonts({
  config: {
    displayLarge: { ...MD3LightTheme.fonts.displayLarge, fontFamily: fontFamily.heavy, fontSize: 40, lineHeight: 46 },
    displayMedium: { ...MD3LightTheme.fonts.displayMedium, fontFamily: fontFamily.heavy, fontSize: 33, lineHeight: 39 },
    displaySmall: { ...MD3LightTheme.fonts.displaySmall, fontFamily: fontFamily.heavy, fontSize: 27, lineHeight: 31 },
    headlineLarge: { ...MD3LightTheme.fonts.headlineLarge, fontFamily: fontFamily.heavy, fontSize: 22, lineHeight: 27 },
    headlineMedium: { ...MD3LightTheme.fonts.headlineMedium, fontFamily: fontFamily.heavy, fontSize: 20, lineHeight: 24 },
    headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 22 },
    titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 20 },
    titleMedium: { ...MD3LightTheme.fonts.titleMedium, fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 18 },
    titleSmall: { ...MD3LightTheme.fonts.titleSmall, fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16 },
    bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 19 },
    bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
    bodySmall: { ...MD3LightTheme.fonts.bodySmall, fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15 },
    labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16 },
    labelMedium: { ...MD3LightTheme.fonts.labelMedium, fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
    labelSmall: { ...MD3LightTheme.fonts.labelSmall, fontFamily: fontFamily.bold, fontSize: 9, lineHeight: 12 },
  },
});

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 5,
  fonts: paperFonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.blue,
    onPrimary: "#ffffff",
    primaryContainer: "#dfe8ff",
    onPrimaryContainer: colors.ink,
    secondary: colors.goldDeep,
    onSecondary: "#ffffff",
    secondaryContainer: "#fde7be",
    onSecondaryContainer: colors.ink,
    tertiary: colors.green,
    onTertiary: "#ffffff",
    tertiaryContainer: colors.greenSoft,
    onTertiaryContainer: colors.ink,
    error: colors.coral,
    onError: "#ffffff",
    errorContainer: colors.coralSoft,
    onErrorContainer: colors.ink,
    background: "#f6f3ee",
    onBackground: colors.ink,
    surface: "#ffffff",
    onSurface: colors.ink,
    surfaceVariant: "#efe8dc",
    onSurfaceVariant: colors.muted,
    outline: "#d4c7b3",
    outlineVariant: "#eadfce",
    shadow: "#000000",
    scrim: "#000000",
  },
};
