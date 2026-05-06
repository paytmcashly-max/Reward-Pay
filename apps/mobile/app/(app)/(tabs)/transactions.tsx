import { useMemo, useState } from "react";
import { ActivityInsightCard } from "@/components/activity-insight-card";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { useMobileStore } from "@/store/mobile-store";
import { fontFamily, typography } from "@/theme/typography";
import { buildActivityFeed, filterActivityFeed, type ActivityFeedFilter } from "@/utils/activity-feed";
import { View } from "@/ui/native";
import { Chip, Text } from "@/ui/paper";

export default function TransactionsScreen() {
  const { transactions, deposits, withdrawals } = useMobileStore();
  const [filter, setFilter] = useState<ActivityFeedFilter>("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const activityItems = useMemo(
    () => buildActivityFeed({ deposits, withdrawals, transactions }),
    [deposits, withdrawals, transactions],
  );
  const filteredItems = useMemo(() => filterActivityFeed(activityItems, filter), [activityItems, filter]);
  const visibleItems = filteredItems.slice(0, visibleCount);
  const successCount = activityItems.filter((item) => item.tone === "success" || item.badge === "Paid").length;
  const failedCount = activityItems.filter((item) => item.tone === "failed").length;

  return (
    <ScreenShell quietDecor>
      <SectionCard eyebrow="Ledger" title="Activity history" subtitle="Cash movements, purchases, and payout events in one list.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip compact icon="history" selected={filter === "all"} onPress={() => setFilter("all")} textStyle={{ fontFamily: fontFamily.bold }}>
            All {activityItems.length}
          </Chip>
          <Chip
            compact
            icon="check-decagram-outline"
            selected={filter === "success"}
            onPress={() => setFilter("success")}
            textStyle={{ fontFamily: fontFamily.bold }}
          >
            Success {successCount}
          </Chip>
          <Chip compact icon="close-octagon-outline" selected={filter === "failed"} onPress={() => setFilter("failed")} textStyle={{ fontFamily: fontFamily.bold }}>
            Failed {failedCount}
          </Chip>
        </View>

        <View style={{ gap: 4 }}>
          {visibleItems.map((item) => (
            <ActivityInsightCard key={item.id} item={item} compact />
          ))}
        </View>

        {filteredItems.length > visibleCount ? (
          <Chip compact icon="chevron-down" onPress={() => setVisibleCount((count) => count + 8)} textStyle={{ fontFamily: fontFamily.bold }}>
            Load more
          </Chip>
        ) : null}

        {!filteredItems.length ? (
          <Text selectable variant="bodyMedium" style={{ ...typography.sectionBody }}>
            {filter === "failed" ? "No failed activity yet." : "No activity yet."}
          </Text>
        ) : null}
      </SectionCard>
    </ScreenShell>
  );
}
