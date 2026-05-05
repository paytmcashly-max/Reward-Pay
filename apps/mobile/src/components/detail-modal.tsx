import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { Pressable, ScrollView, View } from "@/ui/native";
import { Modal, Portal, Text } from "@/ui/paper";

type DetailModalProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  amount?: string;
  badgeLabel?: string;
  badgeTone?: "success" | "failed" | "warning" | "neutral" | "info";
  lines: string[];
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actions?: Array<{
    label: string;
    onPress: () => void;
    tone?: "primary" | "danger" | "neutral";
    disabled?: boolean;
    loading?: boolean;
  }>;
};

const badgePalette: Record<NonNullable<DetailModalProps["badgeTone"]>, { background: string; text: string }> = {
  success: { background: colors.greenSoft, text: colors.green },
  failed: { background: colors.coralSoft, text: colors.coral },
  warning: { background: "#fff1d8", text: colors.goldDeep },
  neutral: { background: "#eef1f6", text: colors.muted },
  info: { background: colors.blueSoft, text: colors.blue },
};

const badgeIcons: Record<NonNullable<DetailModalProps["badgeTone"]>, keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: "check-decagram",
  failed: "close-octagon",
  warning: "clock-outline",
  neutral: "minus-circle-outline",
  info: "information-outline",
};

const actionIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  "Retry pay": "refresh",
  "Pay now": "arrow-top-right",
  Sync: "cached",
  "Cancel payment": "close-circle-outline",
};

function splitLine(line: string) {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex === -1) {
    return {
      label: "Detail",
      value: line,
    };
  }

  return {
    label: line.slice(0, separatorIndex).trim(),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

export function DetailModal({
  visible,
  onDismiss,
  title,
  subtitle,
  amount,
  badgeLabel,
  badgeTone = "neutral",
  lines,
  icon = "text-box-search-outline",
  actions = [],
}: DetailModalProps) {
  const badgeStyle = badgePalette[badgeTone];
  const badgeIcon = badgeIcons[badgeTone];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          marginHorizontal: 10,
          borderRadius: 28,
          backgroundColor: "#111317",
          padding: 12,
          gap: 12,
          maxHeight: "82%",
          borderWidth: 1,
          borderColor: "#1d232c",
          boxShadow: "0 18px 44px rgba(0, 0, 0, 0.34)",
        }}
      >
        <View
          style={{
            borderRadius: 22,
            backgroundColor: "#171b22",
            padding: 12,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${badgeStyle.text}22`,
                  borderWidth: 1,
                  borderColor: `${badgeStyle.text}33`,
                }}
              >
                <MaterialCommunityIcons name={icon} size={20} color={badgeStyle.text} />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={{ ...typography.sectionTitle, color: "#f7f8fb", fontSize: 16, lineHeight: 20 }}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text selectable style={{ ...typography.cardMeta, color: "#9aa4b2", lineHeight: 15 }}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={onDismiss}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#212833",
              }}
            >
              <MaterialCommunityIcons name="close" size={18} color="#f3f5f8" />
            </Pressable>
          </View>

          {(amount || badgeLabel) ? (
            <View
              style={{
                gap: 12,
                borderRadius: 20,
                backgroundColor: "#0f1217",
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: "#222a35",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text selectable style={{ ...typography.metricLabel, color: "#7e8a99" }}>
                    AMOUNT
                  </Text>
                  <Text selectable style={{ ...typography.heroValue, color: "#ffffff", fontSize: 27, lineHeight: 31 }}>
                    {amount ?? "--"}
                  </Text>
                </View>

                {badgeLabel ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: `${badgeStyle.text}20`,
                      borderWidth: 1,
                      borderColor: `${badgeStyle.text}2f`,
                    }}
                  >
                    <MaterialCommunityIcons name={badgeIcon} size={12} color={badgeStyle.text} />
                    <Text
                      selectable
                      style={{
                        ...typography.badge,
                        color: badgeStyle.text,
                        fontFamily: fontFamily.bold,
                      }}
                    >
                      {badgeLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            gap: 0,
            paddingBottom: 2,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#171b22",
            borderWidth: 1,
            borderColor: "#212833",
          }}
        >
          {lines.map((line, index) => {
            const detail = splitLine(line);

            return (
              <View
                key={`${detail.label}:${detail.value}`}
                style={{
                  backgroundColor: "#171b22",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  gap: 3,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#222933",
                }}
              >
                <Text selectable style={{ ...typography.metricLabel, color: "#7e8a99" }}>
                  {detail.label.toUpperCase()}
                </Text>
                <Text
                  selectable
                  numberOfLines={3}
                  style={{
                    ...typography.cardMeta,
                    color: "#f2f4f7",
                    fontFamily: fontFamily.medium,
                    lineHeight: 16,
                  }}
                >
                  {detail.value}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {actions.length ? (
          <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={{
                  flex: 1,
                  minHeight: 74,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor:
                    action.tone === "primary" ? "#5b2bc8" : action.tone === "danger" ? "#32171a" : "#1b212b",
                  borderWidth: 1,
                  borderColor:
                    action.tone === "primary" ? "#7245d8" : action.tone === "danger" ? "#4c262b" : "#28303b",
                  opacity: action.disabled ? 0.55 : 1,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      action.tone === "primary" ? "#7141db" : action.tone === "danger" ? "#4a1d24" : "#262f3a",
                  }}
                >
                  <MaterialCommunityIcons
                    name={actionIcons[action.label] ?? "arrow-top-right"}
                    size={16}
                    color={action.tone === "danger" ? "#ff9f95" : "#ffffff"}
                  />
                </View>
                <Text
                  selectable
                  style={{
                    ...typography.cardMeta,
                    fontFamily: fontFamily.bold,
                    color: action.tone === "danger" ? "#ffb0a8" : "#f4f6fa",
                    textAlign: "center",
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </Portal>
  );
}
