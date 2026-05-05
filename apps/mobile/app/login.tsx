import { Redirect } from "expo-router";
import { useState } from "react";
import { ScreenShell } from "@/components/screen-shell";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { View } from "@/ui/native";
import { Button, HelperText, Surface, Text, TextInput } from "@/ui/paper";

export default function LoginScreen() {
  const { isAuthenticated, demoMode, errorMessage, isSubmitting, inviteLogin, clearError } = useMobileStore();
  const [phone, setPhone] = useState("9000000001");
  const [name, setName] = useState("Test User");
  const [inviteCode, setInviteCode] = useState("");
  const [referralCode, setReferralCode] = useState("");

  if (isAuthenticated || demoMode) {
    return <Redirect href="/" />;
  }

  return (
    <ScreenShell>
      <Surface
        elevation={3}
        style={{
          borderRadius: 32,
          backgroundColor: "#ffffff",
          padding: 20,
          gap: 16,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text selectable variant="labelLarge" style={{ color: colors.blue, fontWeight: "900", letterSpacing: 1 }}>
            CLOSED BETA ACCESS
          </Text>
          <Text selectable variant="headlineMedium" style={{ color: colors.ink, fontWeight: "800" }}>
            Sign in with your invite
          </Text>
          <Text selectable variant="bodyMedium" style={{ color: colors.muted, lineHeight: 20 }}>
            Enter your phone number and invite code to open your wallet and game balance.
          </Text>
        </View>

        <TextInput
          mode="outlined"
          label="Phone number"
          value={phone}
          onChangeText={(value: string) => {
            clearError();
            setPhone(value);
          }}
          keyboardType="phone-pad"
        />

        <TextInput
          mode="outlined"
          label="Full name"
          value={name}
          onChangeText={(value: string) => {
            clearError();
            setName(value);
          }}
        />

        <TextInput
          mode="outlined"
          label="Invite code"
          value={inviteCode}
          onChangeText={(value: string) => {
            clearError();
            setInviteCode(value);
          }}
          autoCapitalize="characters"
        />

        <TextInput
          mode="outlined"
          label="Referral code"
          value={referralCode}
          onChangeText={(value: string) => setReferralCode(value)}
          placeholder="Optional"
        />

        <Button
          mode="contained"
          onPress={() =>
            inviteLogin({
              phone,
              name,
              inviteCode,
              referralCode: referralCode || undefined,
            })
          }
          loading={isSubmitting}
          disabled={isSubmitting}
          contentStyle={{ paddingVertical: 8 }}
        >
          Enter wallet
        </Button>

        {errorMessage ? (
          <HelperText type="error" visible style={{ fontSize: 14 }}>
            {errorMessage}
          </HelperText>
        ) : null}
      </Surface>
    </ScreenShell>
  );
}
