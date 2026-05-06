import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { DepositOrder } from "@reward-wallet/shared";
import { ActionResultSheet } from "@/components/action-result-sheet";
import { ScreenShell } from "@/components/screen-shell";
import { StatusBadge } from "@/components/status-badge";
import { isCashfreeNativeAvailable, startCashfreePayment } from "@/payments/cashfree-mobile";
import { allowTestPayments } from "@/config/runtime";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { Alert, View } from "@/ui/native";
import { Banner, Button, Card, Chip, HelperText, Surface, Text, TextInput } from "@/ui/paper";
import { canRepayDeposit, getDepositStatusHint, getDepositStatusLabel, getDepositStatusTone, isSuccessfulDeposit } from "@/utils/deposit-status";
import { formatMoney, formatTimeLabel, getRewardPreview } from "@/utils/money";

const amountPresets = [500, 1000, 2000, 5000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PaymentSheetState = {
  visible: boolean;
  tone: "success" | "failed" | "warning" | "info";
  title: string;
  message: string;
  details: string[];
  actions?: Array<{
    label: string;
    onPress: () => void;
    tone?: "primary" | "neutral" | "danger";
    disabled?: boolean;
  }>;
};

export default function DepositScreen() {
  const router = useRouter();
  const { wallet, rewardRules, deposits, createDeposit, syncDeposit, cancelDeposit, isSubmitting, errorMessage, providerStatus } = useMobileStore();
  const [amount, setAmount] = useState("1000");
  const [resultSheet, setResultSheet] = useState<PaymentSheetState>({
    visible: false,
    tone: "info",
    title: "",
    message: "",
    details: [],
    actions: [],
  });
  const numericAmount = Number(amount || 0);
  const preview = useMemo(() => getRewardPreview(numericAmount, rewardRules), [numericAmount, rewardRules]);
  const paymentReady = numericAmount >= 100;
  const realPaymentsReady = providerStatus?.cashfree.paymentsLive ?? false;
  const nativeCheckoutReady = isCashfreeNativeAvailable();
  const providerEnvironment = providerStatus?.cashfree.baseUrl?.includes("sandbox") ? "sandbox" : "production";

  const settleDepositStatus = async (depositId: string) => {
    const delays = [0, 1200, 2500, 4500];
    let latest: DepositOrder | null = null;
    for (const delay of delays) {
      if (delay) await wait(delay);
      latest = await syncDeposit(depositId);
      if (!latest) break;
      if (isSuccessfulDeposit(latest.status) || latest.status === "failed" || latest.status === "cancelled") return latest;
    }
    return latest;
  };

  const openReceipt = (depositId: string) =>
    router.push({ pathname: "/transaction-details", params: { source: "deposit", sourceId: depositId } });

  const showDepositOutcome = (deposit: DepositOrder) => {
    if (isSuccessfulDeposit(deposit.status)) {
      setResultSheet({
        visible: true,
        tone: "success",
        title: "Payment successful",
        message: "Money was verified and added to your balance.",
        details: [
          `Amount ${formatMoney(deposit.amount)}`,
          "You can now buy a Task Pass or keep the balance for later.",
        ],
        actions: [
          { label: "View receipt", tone: "primary", onPress: () => openReceipt(deposit.id) },
          { label: "Close", onPress: () => setResultSheet((state) => ({ ...state, visible: false })) },
        ],
      });
      return;
    }
    if (deposit.status === "cancelled") {
      setResultSheet({
        visible: true,
        tone: "warning",
        title: "Checkout closed",
        message: "Payment was cancelled before completion.",
        details: [getDepositStatusHint(deposit.status)],
        actions: [
          { label: "View receipt", onPress: () => openReceipt(deposit.id) },
          { label: "Close", tone: "primary", onPress: () => setResultSheet((state) => ({ ...state, visible: false })) },
        ],
      });
      return;
    }
    if (deposit.status === "failed") {
      setResultSheet({
        visible: true,
        tone: "failed",
        title: "Payment failed",
        message: "Cashfree could not confirm this payment.",
        details: [getDepositStatusHint(deposit.status)],
        actions: [
          { label: "View receipt", onPress: () => openReceipt(deposit.id) },
          { label: "Retry pay", tone: "primary", onPress: () => void launchCashfreePayment(deposit) },
        ],
      });
      return;
    }
    setResultSheet({
      visible: true,
      tone: "info",
      title: "Payment pending",
      message: "The provider is still confirming this order.",
      details: [
        getDepositStatusHint(deposit.status),
        "You can sync now or cancel if the payment was not completed.",
      ],
      actions: [
        { label: "View receipt", onPress: () => openReceipt(deposit.id) },
        { label: "Sync now", tone: "primary", onPress: () => void syncDeposit(deposit.id).then((synced) => synced && showDepositOutcome(synced)) },
      ],
    });
  };

  const launchCashfreePayment = async (deposit: DepositOrder) => {
    if (!deposit.checkoutSession?.paymentSessionId || !deposit.providerOrderId) {
      Alert.alert("Payment session missing", "This order is missing its Cashfree session.");
      return;
    }
    if (!nativeCheckoutReady) {
      Alert.alert("Install dev build", "In-app Cashfree checkout needs a development build. Expo Go cannot open the native payment flow.");
      return;
    }
    try {
      const outcome = await startCashfreePayment({
        paymentSessionId: deposit.checkoutSession.paymentSessionId,
        orderId: deposit.providerOrderId,
        environment: providerEnvironment,
      });
      if (outcome.kind === "failed") {
        setResultSheet({
          visible: true,
          tone: "failed",
          title: "Payment failed",
          message: "Cashfree could not complete this payment.",
          details: [outcome.message],
          actions: [
            { label: "View receipt", onPress: () => openReceipt(deposit.id) },
            { label: "Retry pay", tone: "primary", onPress: () => void launchCashfreePayment(deposit) },
          ],
        });
        return;
      }
      if (outcome.kind === "cancelled" || outcome.kind === "dropped") {
        setResultSheet({
          visible: true,
          tone: "warning",
          title: "Checkout closed",
          message: "Cashfree checkout was closed before confirmation.",
          details: [outcome.message],
          actions: [
            { label: "View receipt", onPress: () => openReceipt(deposit.id) },
            { label: "Cancel", tone: "danger", onPress: () => void cancelDeposit(deposit.id).then((cancelled) => cancelled && showDepositOutcome(cancelled)) },
            { label: "Retry pay", tone: "primary", onPress: () => void launchCashfreePayment(deposit) },
          ],
        });
        return;
      }
      if (outcome.kind === "submitted") {
        const synced = await settleDepositStatus(deposit.id);
        if (synced) return showDepositOutcome(synced);
        setResultSheet({
          visible: true,
          tone: "info",
          title: "Payment submitted",
          message: "Cashfree received your payment attempt.",
          details: ["Sync once the provider confirms it.", outcome.message],
          actions: [
            { label: "View receipt", onPress: () => openReceipt(deposit.id) },
            { label: "Sync now", tone: "primary", onPress: () => void syncDeposit(deposit.id).then((synced) => synced && showDepositOutcome(synced)) },
          ],
        });
        return;
      }
      if (outcome.kind === "pending") {
        const synced = await settleDepositStatus(deposit.id);
        if (synced && (isSuccessfulDeposit(synced.status) || synced.status === "failed" || synced.status === "cancelled")) {
          return showDepositOutcome(synced);
        }
        setResultSheet({
          visible: true,
          tone: "info",
          title: "Payment pending",
          message: "Cashfree is still confirming this payment.",
          details: [outcome.message],
          actions: [
            { label: "View receipt", onPress: () => openReceipt(deposit.id) },
            { label: "Sync now", tone: "primary", onPress: () => void syncDeposit(deposit.id).then((synced) => synced && showDepositOutcome(synced)) },
            { label: "Cancel", tone: "danger", onPress: () => void cancelDeposit(deposit.id).then((cancelled) => cancelled && showDepositOutcome(cancelled)) },
          ],
        });
        return;
      }
    } catch (error) {
      setResultSheet({
        visible: true,
        tone: "failed",
        title: "Checkout unavailable",
        message: "Unable to start Cashfree checkout right now.",
        details: [error instanceof Error ? error.message : "Unknown Cashfree launch error."],
        actions: [{ label: "Close", tone: "primary", onPress: () => setResultSheet((state) => ({ ...state, visible: false })) }],
      });
    }
  };

  const createAndPay = async () => {
    if (!paymentReady) return Alert.alert("Minimum deposit", "Please enter at least Rs 100.");
    const deposit = await createDeposit(numericAmount);
    if (!deposit) return;
    await launchCashfreePayment(deposit);
  };

  return (
    <ScreenShell quietDecor>
      <ActionResultSheet
        visible={resultSheet.visible}
        onDismiss={() => setResultSheet((state) => ({ ...state, visible: false }))}
        tone={resultSheet.tone}
        title={resultSheet.title}
        message={resultSheet.message}
        details={resultSheet.details}
        actions={resultSheet.actions}
      />
      <Card mode="elevated" style={{ borderRadius: 22, backgroundColor: "#ffffff" }}>
        <Card.Content style={{ padding: 11, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Deposit</Text>
              <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>Add money to your balance and use it inside the app.</Text>
            </View>
            <StatusBadge label={realPaymentsReady ? "Ready" : "Limited"} tone={realPaymentsReady ? "success" : "warning"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Surface elevation={0} style={{ flex: 1, borderRadius: 17, backgroundColor: "#f7f8fb", paddingHorizontal: 10, paddingVertical: 9, gap: 2 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>AVAILABLE BALANCE</Text>
              <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>{formatMoney(wallet.withdrawableBalance)}</Text>
            </Surface>
            <Surface elevation={0} style={{ flex: 1, borderRadius: 17, backgroundColor: "#f7f8fb", paddingHorizontal: 10, paddingVertical: 9, gap: 2 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>EST. EXTRA</Text>
              <Text selectable style={{ ...typography.metricValue, color: colors.green }}>{formatMoney(preview.reward)}</Text>
            </Surface>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>ADD MONEY</Text>
              <Text selectable style={{ ...typography.amountValue, color: colors.ink }}>{formatMoney(Number.isFinite(numericAmount) ? numericAmount : 0)}</Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>Minimum top-up is Rs 100.</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4, maxWidth: 112 }}>
              <MaterialCommunityIcons name="shield-lock-outline" size={18} color={colors.blue} />
              <Text selectable numberOfLines={2} style={{ ...typography.cardMeta, color: colors.muted, textAlign: "right" }}>
                {nativeCheckoutReady ? "Secure in-app checkout" : "Dev build needed"}
              </Text>
            </View>
          </View>
          <TextInput mode="outlined" label="Amount" value={amount} onChangeText={(value: string) => setAmount(value)} keyboardType="numeric" style={{ backgroundColor: "#ffffff" }} />
          <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>QUICK AMOUNTS</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {amountPresets.map((preset) => (
              <Chip key={preset} compact selected={numericAmount === preset} onPress={() => setAmount(String(preset))} style={{ backgroundColor: numericAmount === preset ? colors.blueSoft : "#f7f8fb", borderRadius: 14, minHeight: 34 }} textStyle={{ fontFamily: fontFamily.bold, fontSize: 11, color: numericAmount === preset ? colors.blue : colors.ink }}>
                Rs {preset}
              </Chip>
            ))}
          </View>
          <Banner visible icon={nativeCheckoutReady ? "check-decagram-outline" : "cellphone-cog"} style={{ backgroundColor: nativeCheckoutReady ? "#e7f4eb" : "#fff4e5", borderRadius: 15 }}>
            {nativeCheckoutReady
              ? realPaymentsReady
                ? "In-app checkout is ready."
                : "Live checkout is limited right now. Please try again after provider access is enabled."
              : "Install the development build to use the native in-app checkout."}
          </Banner>
          <Button mode="contained" buttonColor={colors.blue} textColor="#ffffff" onPress={createAndPay} loading={isSubmitting} disabled={isSubmitting || !paymentReady || !realPaymentsReady} contentStyle={{ minHeight: 40 }} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 12 }}>
            Add money
          </Button>
          {!realPaymentsReady && allowTestPayments ? (
            <Button mode="contained-tonal" buttonColor="#f7edc8" textColor={colors.ink} onPress={async () => {
              if (!paymentReady) return Alert.alert("Minimum deposit", "Please enter at least Rs 100.");
              const deposit = await createDeposit(numericAmount, "mock");
              if (deposit) Alert.alert("Top-up completed", "Test money was added to your balance.");
            }} loading={isSubmitting} disabled={isSubmitting || !paymentReady} contentStyle={{ minHeight: 38 }} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 12 }}>
              Run test top-up
            </Button>
          ) : null}
          {errorMessage ? <HelperText type="error" visible>{errorMessage}</HelperText> : null}
        </Card.Content>
      </Card>

      <Card mode="elevated" style={{ borderRadius: 22, backgroundColor: "#ffffff" }}>
        <Card.Content style={{ padding: 11, gap: 9 }}>
          <View style={{ gap: 2 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Recent top-ups</Text>
            <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>Open any payment to review its full receipt and confirmation state.</Text>
          </View>
          {deposits.length ? (
            deposits.slice(0, 5).map((deposit) => {
              const canPay = deposit.provider === "cashfree" && canRepayDeposit(deposit.status);
              const showRetry = deposit.status === "failed";
              const showSync = deposit.status === "payment_pending" || deposit.status === "created" || deposit.status === "paid" || deposit.status === "verified";
              return (
                <Card key={deposit.id} mode="outlined" onPress={() => router.push({ pathname: "/transaction-details", params: { source: "deposit", sourceId: deposit.id } })} style={{ borderRadius: 18, backgroundColor: "#f8fafc", borderColor: "#edf1f6" }}>
                  <Card.Content style={{ paddingHorizontal: 10, paddingVertical: 9, gap: 7 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#edf3ff" }}>
                          <MaterialCommunityIcons name="bank-transfer-in" size={17} color={colors.blue} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>{formatMoney(deposit.amount)}</Text>
                          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>{formatTimeLabel(deposit.createdAt)}</Text>
                          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>{getDepositStatusHint(deposit.status)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <StatusBadge label={getDepositStatusLabel(deposit.status)} tone={getDepositStatusTone(deposit.status)} />
                      </View>
                    </View>
                    {showRetry || showSync ? (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {showRetry ? (
                          <Button mode="outlined" style={{ flex: 1, borderColor: "#d9dee8" }} contentStyle={{ minHeight: 36 }} disabled={!canPay || isSubmitting} onPress={() => void launchCashfreePayment(deposit)} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 11 }}>
                            Retry pay
                          </Button>
                        ) : null}
                        {showSync ? (
                          <Button mode="contained" buttonColor={colors.blue} style={{ flex: 1 }} contentStyle={{ minHeight: 36 }} onPress={async () => {
                            const synced = await syncDeposit(deposit.id);
                            if (synced) showDepositOutcome(synced);
                          }} disabled={isSubmitting} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 11 }}>
                            Sync
                          </Button>
                        ) : null}
                      </View>
                    ) : null}
                  </Card.Content>
                </Card>
              );
            })
          ) : (
            <Banner visible icon="history">No deposit orders yet.</Banner>
          )}
        </Card.Content>
      </Card>
    </ScreenShell>
  );
}
