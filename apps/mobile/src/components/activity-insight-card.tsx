import { useRouter } from "expo-router";
import type { ActivityFeedItem } from "@/utils/activity-feed";
import { ActivityRow } from "@/components/activity-row";

type ActivityInsightCardProps = {
  item: ActivityFeedItem;
  compact?: boolean;
};

export function ActivityInsightCard({ item, compact = false }: ActivityInsightCardProps) {
  const router = useRouter();

  return (
    <ActivityRow
      item={item}
      compact={compact}
      onPress={() =>
        router.push({
          pathname: "/transaction-details",
          params: { source: item.source, sourceId: item.sourceId },
        })
      }
    />
  );
}
