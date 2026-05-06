export const fontFamily = {
  regular: "Manrope_500Medium",
  medium: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  heavy: "Manrope_800ExtraBold",
} as const;

export const typography = {
  eyebrow: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  sectionTitle: {
    fontFamily: fontFamily.heavy,
    fontSize: 15,
    lineHeight: 19,
  },
  sectionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    lineHeight: 15,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 12.5,
    lineHeight: 16,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  metricLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ["tabular-nums"] as const,
  },
  heroLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  heroValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ["tabular-nums"] as const,
  },
  amountValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ["tabular-nums"] as const,
  },
  badge: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.45,
  },
} as const;
