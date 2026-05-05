import type React from "react";
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { LinearGradient } from "@/ui/gradient";
import { View } from "@/ui/native";
import { Text } from "@/ui/paper";

const AnimatedView = Animated.View as unknown as React.ComponentType<any>;

export function AppLaunchScreen() {
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.7)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, {
          toValue: 1.02,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 0.86,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(140),
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textTranslate, {
            toValue: 0,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      loop.start();
    });

    return () => {
      loop.stop();
    };
  }, [glowScale, logoOpacity, logoScale, textOpacity, textTranslate]);

  return (
    <LinearGradient colors={["#f6f7fb", "#eef3fb", "#ebe6dd"]} style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ alignItems: "center", justifyContent: "center", gap: 18 }}>
          <AnimatedView
            style={{
              position: "absolute",
              width: 200,
              height: 200,
              borderRadius: 999,
              backgroundColor: "#dfe8ff",
              opacity: 0.8,
              transform: [{ scale: glowScale }],
            }}
          />

          <AnimatedView
            style={{
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            }}
          >
            <LinearGradient
              colors={["#4127db", "#25518a", "#132742"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 96,
                height: 96,
                borderRadius: 32,
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 18px 40px rgba(19, 39, 66, 0.18)",
              }}
            >
              <View
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#ffffff12",
                  borderWidth: 1,
                  borderColor: "#ffffff22",
                }}
              >
                <MaterialCommunityIcons name="wallet-outline" size={40} color="#ffffff" />
              </View>
            </LinearGradient>
          </AnimatedView>

          <AnimatedView
            style={{
              alignItems: "center",
              gap: 6,
              opacity: textOpacity,
              transform: [{ translateY: textTranslate }],
            }}
          >
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink, fontSize: 20, lineHeight: 24, fontFamily: fontFamily.heavy }}>
              Wallet Play
            </Text>
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted, fontSize: 12, lineHeight: 16 }}>
              Secure wallet, smooth game flow
            </Text>
          </AnimatedView>
        </View>
      </View>
    </LinearGradient>
  );
}
