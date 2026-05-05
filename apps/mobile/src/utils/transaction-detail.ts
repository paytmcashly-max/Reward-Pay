import type {
  DepositOrder,
  DepositStatus,
  User,
  WalletTransaction,
  WithdrawBeneficiary,
  WithdrawRequest,
  WithdrawalStatus,
} from "@reward-wallet/shared";
import { buildActivityFeed } from "@/utils/activity-feed";
import { getDepositStatusHint, getDepositStatusLabel, getDepositStatusTone } from "@/utils/deposit-status";
import { formatMoney } from "@/utils/money";

export type TransactionDetailSource = "deposit" | "withdrawal" | "transaction";
export type TransactionDetailTone = "success" | "failed" | "warning" | "neutral" | "info";

export type TransactionDetailRecord = {
  title: string;
  subtitle?: string;
  amount: string;
  badgeLabel: string;
  badgeTone: TransactionDetailTone;
  icon: string;
  lines: string[];
};

export const compactValue = (value: string) => value;

export const compactDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const withdrawalTone = (status: WithdrawalStatus): TransactionDetailTone => {
  if (status === "paid" || status === "approved") {
    return "success";
  }
  if (status === "rejected" || status === "reversed") {
    return "failed";
  }
  if (status === "provider_processing") {
    return "info";
  }
  return "warning";
};

const withdrawalLabel = (status: WithdrawalStatus) => status.replaceAll("_", " ");

export function buildDepositDetailRecord(deposit: DepositOrder, user: User | null): TransactionDetailRecord {
  return {
    title: "Payment Details",
    subtitle: getDepositStatusHint(deposit.status),
    amount: formatMoney(deposit.amount),
    badgeLabel: getDepositStatusLabel(deposit.status),
    badgeTone: getDepositStatusTone(deposit.status),
    icon: "cash-fast",
    lines: [
      `Provider: ${deposit.provider === "cashfree" ? "Cashfree" : "Test top-up"}`,
      `Order ID: ${compactValue(deposit.providerOrderId ?? deposit.id)}`,
      `Status: ${getDepositStatusLabel(deposit.status)}`,
      `Created: ${compactDateTime(deposit.createdAt)}`,
      `Updated: ${compactDateTime(deposit.updatedAt)}`,
      `Payer: ${user?.name ?? "Wallet user"}`,
      `Session ID: ${deposit.checkoutSession?.paymentSessionId ? compactValue(deposit.checkoutSession.paymentSessionId) : "Not available"}`,
    ],
  };
}

export function buildWithdrawalDetailRecord(withdrawal: WithdrawRequest, beneficiary?: WithdrawBeneficiary): TransactionDetailRecord {
  return {
    title: "Withdrawal Details",
    subtitle: `Requested on ${compactDateTime(withdrawal.createdAt)}`,
    amount: formatMoney(withdrawal.amount),
    badgeLabel: withdrawalLabel(withdrawal.status),
    badgeTone: withdrawalTone(withdrawal.status),
    icon: "bank-transfer-out",
    lines: [
      `Status: ${withdrawalLabel(withdrawal.status)}`,
      `Beneficiary: ${beneficiary?.label ?? "Primary payout"}`,
      `Account: ${beneficiary?.upiId ?? beneficiary?.bankAccountNumber ?? beneficiary?.accountName ?? "Saved method"}`,
      `Created: ${compactDateTime(withdrawal.createdAt)}`,
      `Updated: ${compactDateTime(withdrawal.updatedAt)}`,
    ],
  };
}

export function buildTransactionDetailRecord(transaction: WalletTransaction, context: {
  deposits: DepositOrder[];
  withdrawals: WithdrawRequest[];
  transactions: WalletTransaction[];
}): TransactionDetailRecord {
  const activityItem = buildActivityFeed(context).find((item) => item.source === "transaction" && item.sourceId === transaction.id);

  return {
    title: activityItem?.title ?? "Transaction Details",
    subtitle: activityItem?.subtitle ?? transaction.type.replaceAll("_", " "),
    amount: formatMoney(Math.abs(transaction.amount)),
    badgeLabel: activityItem?.badge ?? transaction.type.replaceAll("_", " "),
    badgeTone: activityItem?.tone ?? "info",
    icon: "history",
    lines: activityItem?.details ?? [
      `Type: ${transaction.type.replaceAll("_", " ")}`,
      `Time: ${compactDateTime(transaction.createdAt)}`,
    ],
  };
}

export const canCancelDepositFromStatus = (status: DepositStatus) => status === "created" || status === "payment_pending";
export const canSyncDepositFromStatus = (status: DepositStatus) =>
  status === "created" || status === "payment_pending" || status === "paid" || status === "verified";
export const canRetryDepositFromStatus = (status: DepositStatus) => status === "failed";
