import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import type { DepositOrder } from "@reward-wallet/shared";
import { Share } from "react-native";
import { ActionResultSheet } from "@/components/action-result-sheet";
import { ScreenShell } from "@/components/screen-shell";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { LinearGradient } from "@/ui/gradient";
import { Alert, Pressable, View } from "@/ui/native";
import { Text } from "@/ui/paper";
import {
  buildDepositDetailRecord,
  buildTransactionDetailRecord,
  buildWithdrawalDetailRecord,
  canCancelDepositFromStatus,
  canRetryDepositFromStatus,
  canSyncDepositFromStatus,
  type TransactionDetailSource,
} from "@/utils/transaction-detail";
import { isCashfreeNativeAvailable, isCashfreeTrustedSourceError, startCashfreePayment } from "@/payments/cashfree-mobile";
import { isSuccessfulDeposit } from "@/utils/deposit-status";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tonePalette = {
  success: {
    gradient: ["#22a55a", "#1d8f4d", "#197744"],
    chipBackground: "#ffffff22",
    chipBorder: "#ffffff3a",
    chipText: "#f4fff8",
    iconShell: "#ffffff24",
  },
  failed: {
    gradient: ["#d8605a", "#c04843", "#973337"],
    chipBackground: "#ffffff1f",
    chipBorder: "#ffffff34",
    chipText: "#fff3f1",
    iconShell: "#ffffff22",
  },
  warning: {
    gradient: ["#d2a641", "#bb8d2d", "#976e1f"],
    chipBackground: "#ffffff24",
    chipBorder: "#ffffff38",
    chipText: "#fffdf5",
    iconShell: "#ffffff22",
  },
  info: {
    gradient: ["#365fdd", "#274ab6", "#1f398b"],
    chipBackground: "#ffffff20",
    chipBorder: "#ffffff34",
    chipText: "#f6f9ff",
    iconShell: "#ffffff22",
  },
  neutral: {
    gradient: ["#46556f", "#344258", "#253142"],
    chipBackground: "#ffffff20",
    chipBorder: "#ffffff34",
    chipText: "#f6f7f9",
    iconShell: "#ffffff22",
  },
} as const;

const statusIcon = {
  success: "check-decagram",
  failed: "close-octagon",
  warning: "clock-outline",
  info: "information-outline",
  neutral: "minus-circle-outline",
} as const;

const shortDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not available";

function parseLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return { label: "Detail", value: line };
  }
  return {
    label: line.slice(0, separatorIndex).trim(),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

type ActionTileProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  accent: string;
  shell: string;
  disabled?: boolean;
  onPress: () => void;
};

function ActionTile({ icon, label, accent, shell, disabled = false, onPress }: ActionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 7,
        opacity: disabled ? 0.48 : 1,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: shell,
          borderWidth: 1,
          borderColor: `${accent}55`,
        }}
      >
        <MaterialCommunityIcons name={icon} size={16} color={accent} />
      </View>
      <Text selectable style={{ ...typography.cardMeta, color: "#f4f5f7", fontFamily: fontFamily.medium }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TransactionDetailsScreen() {
  const { source, sourceId } = useLocalSearchParams<{ source?: TransactionDetailSource; sourceId?: string }>();
  const { user, deposits, withdrawals, transactions, beneficiaries, syncDeposit, cancelDeposit, isSubmitting, providerStatus } =
    useMobileStore();
  const [resultOpen, setResultOpen] = useState(false);
  const [resultTone, setResultTone] = useState<"success" | "failed" | "warning" | "info">("info");
  const [resultTitle, setResultTitle] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [resultDetails, setResultDetails] = useState<string[]>([]);

  const deposit = source === "deposit" ? deposits.find((item) => item.id === sourceId) ?? null : null;
  const withdrawal = source === "withdrawal" ? withdrawals.find((item) => item.id === sourceId) ?? null : null;
  const transaction = source === "transaction" ? transactions.find((item) => item.id === sourceId) ?? null : null;
  const beneficiary = withdrawal ? beneficiaries.find((item) => item.id === withdrawal.beneficiaryId) : undefined;
  const providerEnvironment = providerStatus?.cashfree.baseUrl?.includes("sandbox") ? "sandbox" : "production";
  const nativeCheckoutReady = isCashfreeNativeAvailable();

  const detail = useMemo(() => {
    if (deposit) {
      return buildDepositDetailRecord(deposit, user);
    }
    if (withdrawal) {
      return buildWithdrawalDetailRecord(withdrawal, beneficiary);
    }
    if (transaction) {
      return buildTransactionDetailRecord(transaction, { deposits, withdrawals, transactions });
    }
    return null;
  }, [beneficiary, deposit, deposits, transaction, transactions, user, withdrawal, withdrawals]);

  const rows = useMemo(() => (detail ? detail.lines.map(parseLine) : []), [detail]);
  const receiptText = useMemo(() => {
    if (!detail) {
      return "";
    }
    return [detail.title, detail.amount, detail.badgeLabel, ...detail.lines].join("\n");
  }, [detail]);
  const primaryId = useMemo(() => {
    if (deposit) {
      return deposit.providerOrderId ?? deposit.id;
    }
    if (withdrawal) {
      return withdrawal.id;
    }
    if (transaction) {
      return transaction.id;
    }
    return "";
  }, [deposit, transaction, withdrawal]);

  const primaryIdLabel = deposit ? "order ID" : withdrawal ? "transaction ID" : "activity ID";

  const openResult = (tone: "success" | "failed" | "warning" | "info", title: string, message: string, details: string[] = []) => {
    setResultTone(tone);
    setResultTitle(title);
    setResultMessage(message);
    setResultDetails(details);
    setResultOpen(true);
  };

  const settleDepositStatus = async (depositId: string) => {
    const delays = [0, 1200, 2500, 4500];
    let latest: DepositOrder | null = null;

    for (const delay of delays) {
      if (delay) {
        await wait(delay);
      }

      latest = await syncDeposit(depositId);
      if (!latest) {
        break;
      }

      if (isSuccessfulDeposit(latest.status) || latest.status === "failed" || latest.status === "cancelled") {
        return latest;
      }
    }

    return latest;
  };

  const showDepositOutcome = (item: DepositOrder) => {
    if (isSuccessfulDeposit(item.status)) {
      openResult("success", "Payment successful", "Money was verified and added to your balance.", [
        `Amount ${detail?.amount ?? ""}`.trim(),
        "Balance and activity history have been updated.",
      ]);
      return;
    }
    if (item.status === "cancelled") {
      openResult("warning", "Checkout closed", "Payment was cancelled before completion.", [item.providerOrderId ?? item.id]);
      return;
    }
    if (item.status === "failed") {
      openResult("failed", "Payment failed", "The provider did not confirm this payment.", [item.providerOrderId ?? item.id]);
      return;
    }
    openResult("info", "Payment pending", "The provider is still confirming this order.", [
      "Use Sync if you already completed the payment.",
    ]);
  };

  const copyPrimaryId = async () => {
    if (!primaryId) return;
    await Clipboard.setStringAsync(primaryId);
    openResult("success", "Copied", `${primaryIdLabel} copied.`, [primaryId]);
  };

  const copyReceipt = async () => {
    if (!receiptText) return;
    await Clipboard.setStringAsync(receiptText);
    openResult("success", "Copied", "Receipt details copied.", []);
  };

  const shareReceipt = async () => {
    if (!receiptText) return;
    await Share.share({
      message: receiptText,
      title: "Transaction receipt",
    });
  };

  const launchCashfreePayment = async (item: DepositOrder) => {
    if (!item.checkoutSession?.paymentSessionId || !item.providerOrderId) {
      Alert.alert("Payment session missing", "This order is missing its Cashfree session.");
      return;
    }

    if (!nativeCheckoutReady) {
      Alert.alert("Install dev build", "In-app Cashfree checkout needs a development build. Expo Go cannot open the native payment flow.");
      return;
    }

    try {
      const outcome = await startCashfreePayment({
        paymentSessionId: item.checkoutSession.paymentSessionId,
        orderId: item.providerOrderId,
        environment: providerEnvironment,
      });

      if (outcome.kind === "failed") {
        if (isCashfreeTrustedSourceError(outcome.message)) {
          openResult("warning", "Trusted install required", "Cashfree blocked native checkout for this sideloaded APK.", [
            "Install the production app from Play Store or another Cashfree-approved store.",
            "For web checkout, the API domain and Android package must be whitelisted in the Cashfree merchant dashboard.",
            outcome.message,
          ]);
          return;
        }
        openResult("failed", "Payment failed", "Cashfree could not complete this payment.", [outcome.message]);
        return;
      }

      if (outcome.kind === "cancelled" || outcome.kind === "dropped") {
        openResult("warning", "Checkout closed", "Cashfree checkout was closed before confirmation.", [outcome.message]);
        return;
      }

      if (outcome.kind === "submitted") {
        const synced = await settleDepositStatus(item.id);
        if (synced) {
          showDepositOutcome(synced);
          return;
        }
        openResult("info", "Payment submitted", "Cashfree received your payment attempt.", ["Sync once the provider confirms it."]);
        return;
      }

      if (outcome.kind === "pending") {
        const synced = await settleDepositStatus(item.id);
        if (synced && (isSuccessfulDeposit(synced.status) || synced.status === "failed" || synced.status === "cancelled")) {
          showDepositOutcome(synced);
          return;
        }
        openResult("info", "Payment pending", "Cashfree is still confirming this payment.", [outcome.message]);
        return;
      }
    } catch (error) {
      openResult("failed", "Checkout unavailable", "Unable to start Cashfree checkout right now.", [
        error instanceof Error ? error.message : "Unknown Cashfree launch error.",
      ]);
    }
  };

  if (!detail) {
    return (
      <ScreenShell>
        <ActionResultSheet
          visible={resultOpen}
          onDismiss={() => setResultOpen(false)}
          tone={resultTone}
          title={resultTitle}
          message={resultMessage}
          details={resultDetails}
        />
        <View
          style={{
            borderRadius: 24,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#e7dfd2",
            padding: 14,
            gap: 8,
          }}
        >
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            Transaction not found
          </Text>
          <Text selectable style={{ ...typography.sectionBody, color: colors.muted }}>
            This transaction could not be loaded. Go back and open it again.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  const tone = tonePalette[detail.badgeTone];

  return (
    <ScreenShell quietDecor>
      <ActionResultSheet
        visible={resultOpen}
        onDismiss={() => setResultOpen(false)}
        tone={resultTone}
        title={resultTitle}
        message={resultMessage}
        details={resultDetails}
      />
      <View style={{ gap: 10 }}>
        <LinearGradient
          colors={tone.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 26, paddingHorizontal: 16, paddingVertical: 15, gap: 14 }}
        >
          <View
            style={{
              position: "absolute",
              top: -30,
              right: -6,
              width: 150,
              height: 150,
              borderRadius: 999,
              backgroundColor: "#ffffff10",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text selectable style={{ ...typography.heroLabel, color: "#eaf8ee" }}>
                {detail.badgeLabel.toUpperCase()}
              </Text>
              <Text selectable style={{ ...typography.heroValue, color: "#ffffff", fontSize: 27, lineHeight: 31 }}>
                {detail.amount}
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: "#eef8f2" }}>
                {detail.title}
              </Text>
              {detail.subtitle ? (
                <Text selectable style={{ ...typography.cardMeta, color: "#dff0e4" }}>
                  {detail.subtitle}
                </Text>
              ) : null}
            </View>

            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: tone.iconShell,
              }}
            >
              <MaterialCommunityIcons name={detail.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color="#ffffff" />
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: 7,
              borderRadius: 999,
              backgroundColor: tone.chipBackground,
              borderWidth: 1,
              borderColor: tone.chipBorder,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <MaterialCommunityIcons name={statusIcon[detail.badgeTone]} size={13} color={tone.chipText} />
            <Text selectable style={{ ...typography.badge, color: tone.chipText }}>
              {detail.badgeLabel}
            </Text>
          </View>
        </LinearGradient>

        <View style={{ gap: 6 }}>
          <View style={{ paddingHorizontal: 4, gap: 4 }}>
            <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
              Transaction details
            </Text>
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              Full order and payment information for this entry.
            </Text>
          </View>

          {rows.map((row) => {
            const denseValue = /id|utr|session|reference/i.test(row.label);
            return (
              <View
                key={`${row.label}:${row.value}`}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 10,
                  gap: 3,
                  borderRadius: 18,
                  backgroundColor: "#fffdf9",
                  borderWidth: 1,
                  borderColor: "#ece4d8",
                }}
              >
                <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                  {row.label.toUpperCase()}
                </Text>
                <Text
                  selectable
                  style={{
                    color: colors.ink,
                    fontFamily: denseValue ? fontFamily.medium : fontFamily.bold,
                    fontSize: denseValue ? 11.1 : 12.4,
                    lineHeight: denseValue ? 15.3 : 17.4,
                  }}
                >
                  {row.value}
                </Text>
              </View>
            );
          })}
        </View>

        {deposit ? (
          <View
            style={{
              borderRadius: 22,
              overflow: "hidden",
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: "#e7dfd2",
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 4 }}>
              <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                Payment actions
              </Text>
              <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                Manage this payment only while the provider is still confirming it.
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 6,
                paddingHorizontal: 10,
                paddingTop: 4,
                paddingBottom: 12,
              }}
            >
              {canRetryDepositFromStatus(deposit.status) ? (
                <ActionTile
                  icon="refresh"
                  label="Retry"
                  accent="#d8c3ff"
                  shell="#4b2c92"
                  disabled={isSubmitting}
                  onPress={() => void launchCashfreePayment(deposit)}
                />
              ) : null}

              {canSyncDepositFromStatus(deposit.status) ? (
                <ActionTile
                  icon="cached"
                  label="Sync"
                  accent="#c8ddff"
                  shell="#23426b"
                  disabled={isSubmitting}
                  onPress={() =>
                    void (async () => {
                      const synced = await syncDeposit(deposit.id);
                      if (synced) {
                        showDepositOutcome(synced);
                      }
                    })()
                  }
                />
              ) : null}

              {canCancelDepositFromStatus(deposit.status) ? (
                <ActionTile
                  icon="close-circle-outline"
                  label="Cancel"
                  accent="#ffb0a8"
                  shell="#5b2327"
                  disabled={isSubmitting}
                  onPress={() =>
                    void (async () => {
                      const cancelled = await cancelDeposit(deposit.id);
                      if (cancelled) {
                        openResult("warning", "Payment cancelled", "This deposit was marked as cancelled.", [
                          cancelled.providerOrderId ?? cancelled.id,
                        ]);
                      }
                    })()
                  }
                />
              ) : null}
            </View>
          </View>
        ) : null}

        <View
          style={{
            borderRadius: 20,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#e9e2d6",
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
            Receipt actions
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionTile icon="identifier" label="Copy ID" accent="#d0ddff" shell="#21406b" onPress={() => void copyPrimaryId()} />
            <ActionTile icon="content-copy" label="Copy receipt" accent="#bfe2d2" shell="#1d5b49" onPress={() => void copyReceipt()} />
            <ActionTile icon="share-variant-outline" label="Share" accent="#dcc6ff" shell="#51289b" onPress={() => void shareReceipt()} />
          </View>
        </View>

        <View
          style={{
            borderRadius: 20,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#e9e2d6",
            paddingHorizontal: 13,
            paddingVertical: 11,
            gap: 4,
          }}
        >
          <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
            Timeline
          </Text>
          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
            Opened {shortDateTime(source === "deposit" ? deposit?.createdAt : source === "withdrawal" ? withdrawal?.createdAt : transaction?.createdAt)}
          </Text>
          <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
            Last updated {shortDateTime(source === "deposit" ? deposit?.updatedAt : source === "withdrawal" ? withdrawal?.updatedAt : transaction?.createdAt)}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}
