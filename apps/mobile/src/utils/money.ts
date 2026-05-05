import type { RewardRule } from "@reward-wallet/shared";

export const formatMoney = (value: number) =>
  `Rs ${Math.max(0, value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const getRewardPreview = (amount: number, rules: RewardRule[]) => {
  const matchingRule = rules.find(
    (rule) => rule.active && amount >= rule.minDepositAmount && amount <= rule.maxDepositAmount,
  );

  if (!matchingRule) {
    return { reward: 0, percent: 0 };
  }

  return {
    reward: Math.floor((amount * matchingRule.rewardPercent) / 100),
    percent: matchingRule.rewardPercent,
  };
};

export const formatTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
