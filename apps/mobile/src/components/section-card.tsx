import type { ReactNode } from "react";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Card, Text } from "@/ui/paper";

type SectionCardProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SectionCard({ eyebrow, title, subtitle, children }: SectionCardProps) {
  return (
    <Card
      mode="elevated"
      style={{
        borderRadius: 20,
        borderCurve: "continuous",
        backgroundColor: "#ffffffee",
      }}
    >
      <Card.Content style={{ gap: 7, paddingHorizontal: 9, paddingVertical: 9 }}>
        {eyebrow ? (
          <Text selectable variant="labelMedium" style={{ ...typography.eyebrow, color: colors.blue }}>
            {eyebrow.toUpperCase()}
          </Text>
        ) : null}
        <Text selectable variant="titleLarge" style={{ ...typography.sectionTitle, color: colors.ink }}>
          {title}
        </Text>
        {subtitle ? (
          <Text selectable variant="bodyMedium" style={{ ...typography.sectionBody, color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </Card.Content>
    </Card>
  );
}
