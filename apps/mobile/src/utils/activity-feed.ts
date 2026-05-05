import type { DepositOrder, DepositStatus, WalletTransaction, WithdrawRequest, WithdrawalStatus } from "@reward-wallet/shared";

export type ActivityFeedTone = "success" | "failed" | "warning" | "neutral" | "info";
export type ActivityFeedFilter = "all" | "success" | "failed";

export type ActivityFeedItem = {
  id: string;
  source: "deposit" | "withdrawal" | "transaction";
  sourceId: string;
  title: string;
  subtitle: string;
  amount: number;
  createdAt: string;
  badge: string;
  tone: ActivityFeedTone;
  details: string[];
  sourceStatus?: DepositStatus | WithdrawalStatus | WalletTransaction["type"];
};

const depositTone: Record<DepositStatus, ActivityFeedTone> = {
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

const depositBadge: Record<DepositStatus, string> = {
  created: "Created",
  payment_pending: "Pending",
  paid: "Paid",
  verified: "Verified",
  reward_credited: "Rewarded",
  chunked: "Chunked",
  listed: "Listed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const withdrawalTone: Record<WithdrawalStatus, ActivityFeedTone> = {
  requested: "neutral",
  queued_for_review: "warning",
  approved: "success",
  provider_processing: "info",
  paid: "success",
  rejected: "failed",
  reversed: "failed",
};

const withdrawalBadge: Record<WithdrawalStatus, string> = {
  requested: "Requested",
  queued_for_review: "Review",
  approved: "Approved",
  provider_processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  reversed: "Reversed",
};

const transactionTone: Record<WalletTransaction["type"], ActivityFeedTone> = {
  deposit_principal: "success",
  reward_credit: "success",
  chunk_listed: "info",
  chunk_match: "success",
  withdraw_request: "warning",
  withdraw_reversal: "failed",
  game_entry: "neutral",
  game_payout: "success",
};

const transactionBadge: Record<WalletTransaction["type"], string> = {
  deposit_principal: "Paid",
  reward_credit: "Reward",
  chunk_listed: "Listed",
  chunk_match: "Sold",
  withdraw_request: "Requested",
  withdraw_reversal: "Reversed",
  game_entry: "Played",
  game_payout: "Won",
};

const prettify = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

export function buildActivityFeed(input: {
  deposits: DepositOrder[];
  withdrawals: WithdrawRequest[];
  transactions: WalletTransaction[];
}) {
  const depositItems: ActivityFeedItem[] = input.deposits.map((deposit) => ({
    id: `deposit:${deposit.id}`,
    source: "deposit",
    sourceId: deposit.id,
    title: "Add Money",
    subtitle: `${deposit.provider === "cashfree" ? "Cashfree" : "Test top-up"} deposit`,
    amount: deposit.amount,
    createdAt: deposit.updatedAt || deposit.createdAt,
    badge: depositBadge[deposit.status],
    tone: depositTone[deposit.status],
    sourceStatus: deposit.status,
    details: [
      `Transaction ID: ${deposit.providerOrderId ?? deposit.id}`,
      `Status: ${depositBadge[deposit.status]}`,
      `Amount: Rs ${deposit.amount.toLocaleString("en-IN")}`,
      `Created: ${new Date(deposit.createdAt).toLocaleString("en-IN")}`,
      `Updated: ${new Date(deposit.updatedAt).toLocaleString("en-IN")}`,
    ],
  }));

  const withdrawalItems: ActivityFeedItem[] = input.withdrawals.map((withdrawal) => ({
    id: `withdrawal:${withdrawal.id}`,
    source: "withdrawal",
    sourceId: withdrawal.id,
    title: "Withdraw",
    subtitle: "Payout request",
    amount: withdrawal.amount,
    createdAt: withdrawal.updatedAt || withdrawal.createdAt,
    badge: withdrawalBadge[withdrawal.status],
    tone: withdrawalTone[withdrawal.status],
    sourceStatus: withdrawal.status,
    details: [
      `Transaction ID: ${withdrawal.id}`,
      `Status: ${withdrawalBadge[withdrawal.status]}`,
      `Amount: Rs ${withdrawal.amount.toLocaleString("en-IN")}`,
      `Created: ${new Date(withdrawal.createdAt).toLocaleString("en-IN")}`,
      `Updated: ${new Date(withdrawal.updatedAt).toLocaleString("en-IN")}`,
      `Reference: ${withdrawal.providerReference ?? "Pending assignment"}`,
    ],
  }));

  const transactionItems: ActivityFeedItem[] = input.transactions.map((transaction) => ({
    id: `transaction:${transaction.id}`,
    source: "transaction",
    sourceId: transaction.id,
    title: String(transaction.metadata.note ?? prettify(transaction.type)),
    subtitle: prettify(transaction.type),
    amount: transaction.amount,
    createdAt: transaction.createdAt,
    badge: transactionBadge[transaction.type],
    tone: transactionTone[transaction.type],
    sourceStatus: transaction.type,
    details: [
      `Transaction ID: ${transaction.id}`,
      `Type: ${prettify(transaction.type)}`,
      `Amount: Rs ${Math.abs(transaction.amount).toLocaleString("en-IN")}`,
      `Time: ${new Date(transaction.createdAt).toLocaleString("en-IN")}`,
      ...Object.entries(transaction.metadata ?? {}).slice(0, 4).map(([key, value]) => `${prettify(key)}: ${String(value)}`),
    ],
  }));

  return [...depositItems, ...withdrawalItems, ...transactionItems].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function filterActivityFeed(items: ActivityFeedItem[], filter: ActivityFeedFilter) {
  if (filter === "all") {
    return items;
  }

  return items.filter((item) => {
    if (filter === "success") {
      return item.tone === "success" || item.badge === "Paid";
    }

    return item.tone === "failed";
  });
}
