import { Redirect } from "expo-router";
import { useState } from "react";
import { ScreenShell } from "@/components/screen-shell";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Button, HelperText, Surface, Text, TextInput } from "@/ui/paper";

export default function LoginScreen() {
  const { isAuthenticated, demoMode, errorMessage, isSubmitting, inviteLogin, sendOtp, verifyOtp, providerStatus, lastActionMessage, clearError } = useMobileStore();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);

  const authMode = providerStatus?.authMode === "otp" ? "otp" : "invite";

  if (isAuthenticated || demoMode) {
    return <Redirect href="/" />;
  }

  return (
    <ScreenShell>
      <Surface
        elevation={3}
        style={{
          borderRadius: 24,
          backgroundColor: "#ffffff",
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text selectable style={{ ...typography.eyebrow, color: colors.blue }}>
            {authMode === "invite" ? "CLOSED BETA ACCESS" : "SECURE SIGN IN"}
          </Text>
          <Text selectable style={{ ...typography.heroValue, color: colors.ink }}>
            {authMode === "invite" ? "Sign in with your invite" : "Sign in with OTP"}
          </Text>
          <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>
            {authMode === "invite"
              ? "Enter your phone number and invite code to open your Task Pass dashboard."
              : "Enter your phone number to receive an OTP and access your Task Pass rewards."}
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
          dense
        />

        <TextInput
          mode="outlined"
          label="Full name"
          value={name}
          onChangeText={(value: string) => {
            clearError();
            setName(value);
          }}
          dense
        />

        {authMode === "invite" ? (
          <TextInput
            mode="outlined"
            label="Invite code"
            value={inviteCode}
            onChangeText={(value: string) => {
              clearError();
              setInviteCode(value);
            }}
            autoCapitalize="characters"
            dense
          />
        ) : null}

        {authMode === "otp" ? (
          <TextInput
            mode="outlined"
            label="OTP code"
            value={otpCode}
            onChangeText={(value: string) => {
              clearError();
              setOtpCode(value);
            }}
            keyboardType="number-pad"
            dense
          />
        ) : null}

        <TextInput
          mode="outlined"
          label="Referral code"
          value={referralCode}
          onChangeText={(value: string) => setReferralCode(value)}
          placeholder="Optional"
          dense
        />

        {authMode === "invite" ? (
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
            contentStyle={{ minHeight: 42 }}
          >
            Sign in
          </Button>
        ) : (
          <View style={{ gap: 10 }}>
            <Button
              mode="outlined"
              onPress={async () => {
                await sendOtp(phone);
                setOtpRequested(true);
              }}
              loading={isSubmitting}
              disabled={isSubmitting}
              contentStyle={{ minHeight: 42 }}
            >
              {otpRequested ? "Resend OTP" : "Send OTP"}
            </Button>
            <Button
              mode="contained"
              onPress={() =>
                verifyOtp({
                  phone,
                  code: otpCode,
                  name,
                  referralCode: referralCode || undefined,
                })
              }
              loading={isSubmitting}
              disabled={isSubmitting || !otpCode.trim()}
              contentStyle={{ minHeight: 42 }}
            >
              Verify OTP
            </Button>
          </View>
        )}

        {lastActionMessage ? (
          <HelperText type="info" visible style={{ fontSize: 13, color: colors.muted }}>
            {lastActionMessage}
          </HelperText>
        ) : null}

        {errorMessage ? (
          <HelperText type="error" visible style={{ fontSize: 14 }}>
            {errorMessage}
          </HelperText>
        ) : null}
      </Surface>
    </ScreenShell>
  );
}
