import type { DepositOrder, DepositStatus } from "@reward-wallet/shared";

type DepositTone = "success" | "failed" | "warning" | "neutral" | "info";

const statusTone: Record<DepositStatus, DepositTone> = {
  created: "neutral",
  payment_pending: "warning",
  paid: "success",
  verified: "success",
  reward_credited: "success",
  chunked: "success",
  listed: "success",
  failed: "failed",
  cancelled: "failed",
};

const statusLabel: Record<DepositStatus, string> = {
  created: "Created",
  payment_pending: "Pending",
  paid: "Paid",
  verified: "Verified",
  reward_credited: "Rewarded",
  chunked: "Processing",
  listed: "Settled",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusHint: Record<DepositStatus, string> = {
  created: "Order is ready for payment.",
  payment_pending: "Waiting for provider confirmation.",
  paid: "Payment received, verification in progress.",
  verified: "Verification passed, funds are moving into the wallet.",
  reward_credited: "Reward is credited and balance is updated.",
  chunked: "Legacy processing state. No new Task Pass flow depends on it.",
  listed: "Legacy settled state. New Task Pass payments activate the selected pass.",
  failed: "Payment was not completed successfully.",
  cancelled: "Checkout was closed before completion.",
};

export const getDepositStatusTone = (status: DepositStatus) => statusTone[status];

export const getDepositStatusLabel = (status: DepositStatus) => statusLabel[status];

export const getDepositStatusHint = (status: DepositStatus) => statusHint[status];

export const canRepayDeposit = (status: DepositStatus) => status === "created" || status === "payment_pending" || status === "failed" || status === "cancelled";

export const isSuccessfulDeposit = (status: DepositStatus) =>
  status === "paid" || status === "verified" || status === "reward_credited" || status === "chunked" || status === "listed";

const compactDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const compactId = (value: string) => {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

export const buildDepositDetailLines = (deposit: DepositOrder) => [
  `Status: ${getDepositStatusLabel(deposit.status)}`,
  `Provider: ${deposit.provider === "cashfree" ? "Cashfree" : "Test top-up"}`,
  `Order ID: ${compactId(deposit.providerOrderId ?? deposit.id)}`,
  `Created: ${compactDate(deposit.createdAt)}`,
  `Updated: ${compactDate(deposit.updatedAt)}`,
];
