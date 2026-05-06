import type { DepositOrder, TokenTransaction, WalletTransaction, WithdrawRequest } from "@reward-wallet/shared";
import { buildActivityFeed, type ActivityFeedTone } from "@/utils/activity-feed";

export type BalanceActivityItem = {
  id: string;
  source: "deposit" | "withdrawal" | "transaction" | "token";
  sourceId: string;
  title: string;
  subtitle: string;
  amount: number;
  direction: "credit" | "debit" | "neutral";
  createdAt: string;
  tone: ActivityFeedTone;
  badge?: string;
};

const tokenReasonLabels: Record<string, string> = {
  daily_checkin: "Daily Check-in",
  daily_task: "Daily Task",
  milestone_reward: "Milestone Reward",
  referral_commission: "Referral Commission",
  deposit_bonus: "Deposit Bonus",
  admin_adjustment: "Admin Adjustment",
  redemption: "Redemption",
};

export function buildBalanceActivity(input: {
  deposits: DepositOrder[];
  withdrawals: WithdrawRequest[];
  transactions: WalletTransaction[];
  tokenLedger: TokenTransaction[];
}) {
  const transactionDepositIds = new Set(
    input.transactions
      .map((transaction) => String(transaction.metadata?.depositId ?? ""))
      .filter(Boolean),
  );

  const moneyItems: BalanceActivityItem[] = buildActivityFeed({
    deposits: input.deposits.filter((deposit) => {
      const alreadyHasLedger = transactionDepositIds.has(deposit.id);
      return !alreadyHasLedger || deposit.status === "created" || deposit.status === "payment_pending" || deposit.status === "failed" || deposit.status === "cancelled";
    }),
    withdrawals: input.withdrawals,
    transactions: input.transactions,
  }).map((item) => ({
    id: item.id,
    source: item.source,
    sourceId: item.sourceId,
    title: item.title,
    subtitle: item.subtitle,
    amount: Math.abs(item.amount),
    direction:
      item.source === "withdrawal" || item.amount < 0
        ? "debit"
        : item.source === "deposit" && item.tone !== "success"
          ? "neutral"
          : "credit",
    createdAt: item.createdAt,
    tone: item.tone,
    badge: item.badge,
  }));

  const tokenItems: BalanceActivityItem[] = input.tokenLedger.map((entry) => ({
    id: `token:${entry.id}`,
    source: "token",
    sourceId: entry.id,
    title: tokenReasonLabels[entry.reason] ?? entry.reason.replaceAll("_", " "),
    subtitle: "Reward balance update",
    amount: entry.amount,
    direction: entry.direction,
    createdAt: entry.createdAt,
    tone: entry.direction === "credit" ? "success" : "failed",
    badge: entry.direction === "credit" ? "Added" : "Deducted",
  }));

  return [...moneyItems, ...tokenItems].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
