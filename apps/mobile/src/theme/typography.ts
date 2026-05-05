export const fontFamily = {
  regular: "Manrope_500Medium",
  medium: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  heavy: "Manrope_800ExtraBold",
} as const;

export const typography = {
  eyebrow: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontFamily: fontFamily.heavy,
    fontSize: 17,
    lineHeight: 21,
  },
  sectionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  metricLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  metricValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ["tabular-nums"] as const,
  },
  heroLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  heroValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 24,
    lineHeight: 28,
    fontVariant: ["tabular-nums"] as const,
  },
  amountValue: {
    fontFamily: fontFamily.heavy,
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ["tabular-nums"] as const,
  },
  badge: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
} as const;
