import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { fontFamily, typography } from "@/theme/typography";
import { Pressable, ScrollView, View } from "@/ui/native";
import { Modal, Portal, Text } from "@/ui/paper";

type ResultTone = "success" | "failed" | "warning" | "info";

type ResultAction = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "neutral" | "danger";
  disabled?: boolean;
};

type ActionResultSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  tone: ResultTone;
  title: string;
  message: string;
  details?: string[];
  actions?: ResultAction[];
};

const palette: Record<ResultTone, { bg: string; tint: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  success: { bg: "#22a55a", tint: "#effdf2", icon: "check-decagram" },
  failed: { bg: "#d8605a", tint: "#fff3f1", icon: "close-octagon" },
  warning: { bg: "#d1a33f", tint: "#fffdf4", icon: "clock-outline" },
  info: { bg: "#365fdd", tint: "#f6f9ff", icon: "information-outline" },
};

export function ActionResultSheet({
  visible,
  onDismiss,
  tone,
  title,
  message,
  details = [],
  actions = [],
}: ActionResultSheetProps) {
  const current = palette[tone];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          marginHorizontal: 12,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        <View style={{ gap: 0 }}>
          <View style={{ backgroundColor: current.bg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#ffffff22",
                  }}
                >
                  <MaterialCommunityIcons name={current.icon} size={20} color="#ffffff" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text selectable style={{ ...typography.sectionTitle, color: "#ffffff" }}>
                    {title}
                  </Text>
                  <Text selectable style={{ ...typography.cardMeta, color: current.tint }}>
                    {message}
                  </Text>
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
                  backgroundColor: "#ffffff20",
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          {details.length ? (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8, maxHeight: 220 }}
              showsVerticalScrollIndicator={false}
            >
              {details.map((detail) => (
                <View
                  key={detail}
                  style={{
                    borderRadius: 16,
                    backgroundColor: "#fffdf9",
                    borderWidth: 1,
                    borderColor: "#ede4d7",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text selectable style={{ ...typography.cardMeta, color: colors.ink, lineHeight: 16 }}>
                    {detail}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 14, paddingTop: details.length ? 0 : 14 }}>
            {actions.length
              ? actions.map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={action.onPress}
                    disabled={action.disabled}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        action.tone === "primary" ? colors.ink : action.tone === "danger" ? "#fff1ee" : "#f7f9fc",
                      borderWidth: 1,
                      borderColor:
                        action.tone === "primary" ? colors.ink : action.tone === "danger" ? "#ffd2cb" : "#e7ecf4",
                      opacity: action.disabled ? 0.55 : 1,
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        ...typography.cardMeta,
                        fontFamily: fontFamily.bold,
                        color: action.tone === "primary" ? "#ffffff" : action.tone === "danger" ? colors.coral : colors.ink,
                      }}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))
              : (
                <Pressable
                  onPress={onDismiss}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#f7f9fc",
                    borderWidth: 1,
                    borderColor: "#e7ecf4",
                  }}
                >
                  <Text selectable style={{ ...typography.cardMeta, fontFamily: fontFamily.bold, color: colors.ink }}>
                    Done
                  </Text>
                </Pressable>
              )}
          </View>
        </View>
      </Modal>
    </Portal>
  );
}
