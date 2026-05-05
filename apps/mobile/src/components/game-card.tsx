import type { GameDefinition } from "@reward-wallet/shared";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Button, Card, Chip, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

type GameCardProps = {
  game: GameDefinition;
  onPlay: (gameId: GameDefinition["id"]) => void;
};

export function GameCard({ game, onPlay }: GameCardProps) {
  const accent = game.id === "spin" ? "#24478b" : game.id === "scratch" ? "#7d3cff" : "#1f8a5b";
  const icon = game.id === "spin" ? "sync" : game.id === "scratch" ? "ticket-percent-outline" : "lightning-bolt-outline";
  const actionLabel = game.id === "prediction" ? "Predict now" : "Play now";

  return (
    <Card mode="elevated" style={{ borderRadius: 20, backgroundColor: "#ffffff" }}>
      <Card.Content style={{ gap: 10, padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable variant="titleLarge" style={{ ...typography.cardTitle, color: colors.ink, fontFamily: fontFamily.heavy, fontSize: 16, lineHeight: 20 }}>
              {game.name}
            </Text>
            <Text selectable variant="bodyMedium" style={{ ...typography.cardMeta, color: colors.muted, lineHeight: 16 }}>
              Quick round with instant wallet settlement.
            </Text>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${accent}16`,
            }}
          >
            <MaterialCommunityIcons name={icon} size={18} color={accent} />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip icon="controller-classic-outline">Entry {formatMoney(game.entryFee)}</Chip>
          <Chip icon="gift-outline">Up to {formatMoney(game.maxReward)}</Chip>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text selectable style={{ ...typography.cardMeta, color: colors.muted, flex: 1 }}>
            Reward range {formatMoney(game.minReward)} - {formatMoney(game.maxReward)}
          </Text>
          <Button mode="contained" onPress={() => onPlay(game.id)} contentStyle={{ minHeight: 36 }} style={{ borderRadius: 16 }} labelStyle={{ fontFamily: fontFamily.bold, fontSize: 11.5 }}>
            {actionLabel}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}
