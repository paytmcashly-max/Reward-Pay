import { Link, router } from "expo-router";
import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActionResultSheet } from "@/components/action-result-sheet";
import { ScreenShell } from "@/components/screen-shell";
import { StatusBadge } from "@/components/status-badge";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Banner, Button, Card, HelperText, Surface, Text, TextInput } from "@/ui/paper";
import { formatMoney, formatTimeLabel } from "@/utils/money";

export default function WithdrawScreen() {
  const { user, wallet, beneficiaries, withdrawals, submitWithdrawal, isSubmitting, errorMessage } = useMobileStore();
  const [amount, setAmount] = useState("200");
  const [upiId, setUpiId] = useState(beneficiaries[0]?.upiId ?? "");
  const [accountName, setAccountName] = useState(user?.name ?? "");
  const [resultOpen, setResultOpen] = useState(false);
  const [resultTone, setResultTone] = useState<"success" | "failed" | "warning" | "info">("info");
  const [resultTitle, setResultTitle] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [resultDetails, setResultDetails] = useState<string[]>([]);
  const [resultActions, setResultActions] = useState<
    { label: string; onPress: () => void; tone?: "primary" | "neutral" | "danger"; disabled?: boolean }[]
  >([]);
  const numericAmount = Number(amount || 0);
  const canRequest = useMemo(
    () => numericAmount > 0 && numericAmount <= wallet.withdrawableBalance && (beneficiaries.length > 0 || upiId.includes("@")),
    [beneficiaries.length, numericAmount, upiId, wallet.withdrawableBalance],
  );
  const hasBalance = wallet.withdrawableBalance > 0;

  const openResult = (
    tone: "success" | "failed" | "warning" | "info",
    title: string,
    message: string,
    details: string[] = [],
    actions: { label: string; onPress: () => void; tone?: "primary" | "neutral" | "danger"; disabled?: boolean }[] = [],
  ) => {
    setResultTone(tone);
    setResultTitle(title);
    setResultMessage(message);
    setResultDetails(details);
    setResultActions(actions);
    setResultOpen(true);
  };

  const handleSubmitWithdrawal = async () => {
    const request = await submitWithdrawal({
      amount: numericAmount,
      beneficiaryId: beneficiaries[0]?.id,
      accountName,
      label: "Primary UPI",
      upiId,
    });

    if (!request) {
      const latestError = useMobileStore.getState().errorMessage;
      openResult("failed", "Withdrawal failed", latestError ?? errorMessage ?? "We could not queue this withdrawal right now.", [
        `Amount ${formatMoney(numericAmount)}`,
      ]);
      return;
    }

    openResult(
      "success",
      "Withdrawal queued",
      "Your payout request was submitted for review.",
      [`Amount ${formatMoney(request.amount)}`, `Status ${request.status.replaceAll("_", " ")}`],
      [
        {
          label: "Close",
          onPress: () => setResultOpen(false),
          tone: "neutral",
        },
        {
          label: "View receipt",
          onPress: () => {
            setResultOpen(false);
            router.push({
              pathname: "/transaction-details",
              params: {
                source: "withdrawal",
                sourceId: request.id,
              },
            });
          },
          tone: "primary",
        },
      ],
    );
  };

  return (
    <ScreenShell quietDecor>
      <ActionResultSheet
        visible={resultOpen}
        onDismiss={() => setResultOpen(false)}
        tone={resultTone}
        title={resultTitle}
        message={resultMessage}
        details={resultDetails}
        actions={resultActions}
      />
      <Surface elevation={3} style={{ borderRadius: 24, backgroundColor: "#ffffff", padding: 11, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Withdraw</Text>
            <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>
              Request a cash payout from your withdrawable balance only.
            </Text>
          </View>
          <StatusBadge label={hasBalance ? "Ready" : "Empty"} tone={hasBalance ? "success" : "warning"} />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Surface elevation={0} style={{ flex: 1, borderRadius: 17, backgroundColor: "#f7f8fb", paddingHorizontal: 10, paddingVertical: 9, gap: 2 }}>
            <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>WITHDRAWABLE</Text>
            <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>{formatMoney(wallet.withdrawableBalance)}</Text>
          </Surface>
          <Surface elevation={0} style={{ flex: 1, borderRadius: 17, backgroundColor: "#f7f8fb", paddingHorizontal: 10, paddingVertical: 9, gap: 2 }}>
            <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>LOCKED</Text>
            <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>{formatMoney(wallet.lockedBalance)}</Text>
          </Surface>
        </View>

        {!hasBalance ? (
          <Banner visible icon="alert-circle-outline" style={{ backgroundColor: "#fff4e5", borderRadius: 16 }}>
            Use Add Money first, then return here when your balance is available for payout.
          </Banner>
        ) : null}

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>REQUEST AMOUNT</Text>
              <Text selectable style={{ ...typography.amountValue, color: colors.ink }}>{formatMoney(Number.isFinite(numericAmount) ? numericAmount : 0)}</Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>Enter an amount within your withdrawable balance.</Text>
            </View>
            <Surface elevation={0} style={{ borderRadius: 14, backgroundColor: "#f7f8fb", paddingHorizontal: 10, paddingVertical: 7, gap: 2 }}>
              <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>PAYOUT</Text>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>UPI</Text>
            </Surface>
          </View>
          <TextInput mode="outlined" label="Withdrawal amount" value={amount} onChangeText={(value: string) => setAmount(value)} keyboardType="numeric" />
        </View>

        {!beneficiaries.length ? (
          <View style={{ gap: 8 }}>
            <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>Add payout destination</Text>
            <TextInput mode="outlined" label="Account holder name" value={accountName} onChangeText={(value: string) => setAccountName(value)} />
            <TextInput mode="outlined" label="UPI ID" value={upiId} onChangeText={(value: string) => setUpiId(value)} autoCapitalize="none" />
          </View>
        ) : (
          <Card mode="outlined" style={{ borderRadius: 18, backgroundColor: "#f8fafc", borderColor: "#edf1f6" }}>
            <Card.Content style={{ paddingVertical: 10, gap: 4 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                Payout destination ready
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                {beneficiaries[0]?.accountName} | {beneficiaries[0]?.upiId ?? beneficiaries[0]?.bankAccountNumber}
              </Text>
            </Card.Content>
          </Card>
        )}

        <Button
          mode="contained"
          buttonColor={colors.coral}
          onPress={handleSubmitWithdrawal}
          loading={isSubmitting}
          disabled={isSubmitting || !canRequest}
          contentStyle={{ minHeight: 40 }}
          labelStyle={{ fontFamily: fontFamily.bold, fontSize: 12 }}
        >
          Request payout
        </Button>

        {!hasBalance ? (
          <Link href="/deposit" asChild>
            <Button mode="outlined" contentStyle={{ minHeight: 38 }} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 12 }}>Go to Add Money</Button>
          </Link>
        ) : null}

        {errorMessage ? (
          <HelperText type="error" visible>
            {errorMessage}
          </HelperText>
        ) : !canRequest ? (
          <HelperText type="info" visible>
            Enter a valid amount within your withdrawable balance and add a valid UPI ID if no payout account exists yet.
          </HelperText>
        ) : null}
      </Surface>

      <Card mode="elevated" style={{ borderRadius: 22, backgroundColor: "#ffffff" }}>
        <Card.Content style={{ padding: 11, gap: 9 }}>
          <View style={{ gap: 2 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Recent requests</Text>
            <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>
              Track your latest payout requests and review states.
            </Text>
          </View>
          {withdrawals.length ? (
            withdrawals.slice(0, 5).map((withdrawal) => (
              <Card
                key={withdrawal.id}
                mode="outlined"
                onPress={() =>
                  router.push({
                    pathname: "/transaction-details",
                    params: { source: "withdrawal", sourceId: withdrawal.id },
                  })
                }
                style={{ borderRadius: 18, backgroundColor: "#f8fafc", borderColor: "#edf1f6" }}
              >
                <Card.Content style={{ paddingHorizontal: 10, paddingVertical: 9, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#fff2ec" }}>
                        <MaterialCommunityIcons name="bank-transfer-out" size={17} color={colors.coral} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>{formatMoney(withdrawal.amount)}</Text>
                        <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>{formatTimeLabel(withdrawal.createdAt)}</Text>
                      </View>
                    </View>
                    <StatusBadge label={withdrawal.status.replaceAll("_", " ")} tone={withdrawal.status.includes("rejected") ? "failed" : withdrawal.status.includes("paid") ? "success" : "warning"} />
                  </View>
                </Card.Content>
              </Card>
            ))
          ) : (
            <Banner visible icon="history">No withdrawal requests yet.</Banner>
          )}
        </Card.Content>
      </Card>
    </ScreenShell>
  );
}
