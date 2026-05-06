import { GameCard } from "@/components/game-card";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { useState } from "react";
import { ActionResultSheet } from "@/components/action-result-sheet";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Card, Chip, Text } from "@/ui/paper";
import { formatMoney } from "@/utils/money";

export default function GamesScreen() {
  const { games, playGame, wallet } = useMobileStore();
  const [resultOpen, setResultOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [resultTone, setResultTone] = useState<"success" | "failed">("success");

  return (
    <ScreenShell>
      <ActionResultSheet
        visible={resultOpen}
        onDismiss={() => setResultOpen(false)}
        tone={resultTone}
        title={resultTone === "success" ? "Round settled" : "Round unavailable"}
        message={resultMessage}
        actions={[{ label: "Close", tone: "primary", onPress: () => setResultOpen(false) }]}
      />
      <SectionCard
        eyebrow="Games"
        title="Play for rewards"
        subtitle="Fast wallet games with instant settlement."
      >
        <Card mode="contained" style={{ borderRadius: 18, backgroundColor: "#f6f8fc" }}>
          <Card.Content style={{ padding: 12, gap: 7 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip compact icon="gift-outline">Reward {formatMoney(wallet.rewardBalance)}</Chip>
              <Chip compact icon="wallet-outline">Playable {formatMoney(wallet.principalBalance)}</Chip>
            </View>
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              Entry is deducted from reward first, then wallet balance if needed.
            </Text>
          </Card.Content>
        </Card>

        <View style={{ gap: 8 }}>
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            onPlay={(gameId) => {
              playGame(gameId).then((message) => {
                setResultMessage(message);
                setResultTone(message.toLowerCase().includes("unable") || message.toLowerCase().includes("not enough") ? "failed" : "success");
                setResultOpen(true);
              });
            }}
          />
        ))}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
