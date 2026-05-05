import type { WalletTransaction } from "@reward-wallet/shared";
import { colors } from "@/theme/colors";
import { View } from "@/ui/native";
import { Card, Text } from "@/ui/paper";
import { formatMoney, formatTimeLabel } from "@/utils/money";

type TransactionRowProps = {
  transaction: WalletTransaction;
};

const toneByType: Record<WalletTransaction["type"], string> = {
  deposit_principal: colors.blue,
  reward_credit: colors.green,
  chunk_listed: colors.goldDeep,
  chunk_match: colors.green,
  withdraw_request: colors.coral,
  withdraw_reversal: colors.plum,
  game_entry: colors.coral,
  game_payout: colors.green,
};

export function TransactionRow({ transaction }: TransactionRowProps) {
  const note = String(transaction.metadata.note ?? "Wallet activity");

  return (
    <Card mode="outlined">
      <Card.Content
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable variant="titleSmall" style={{ color: colors.ink, fontWeight: "800" }}>
            {note}
          </Text>
          <Text selectable variant="bodySmall" style={{ color: colors.muted, lineHeight: 18 }}>
            {transaction.type.replaceAll("_", " ")} | {formatTimeLabel(transaction.createdAt)}
          </Text>
        </View>
        <Text
          selectable
          variant="titleMedium"
          style={{
            color: toneByType[transaction.type],
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMoney(transaction.amount)}
        </Text>
      </Card.Content>
    </Card>
  );
}
