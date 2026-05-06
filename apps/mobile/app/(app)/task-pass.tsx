import { useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SectionCard } from "@/components/section-card";
import { ScreenShell } from "@/components/screen-shell";
import { StatusBadge } from "@/components/status-badge";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { LinearGradient } from "@/ui/gradient";
import { View } from "@/ui/native";
import { Button, HelperText, Text } from "@/ui/paper";

function PlanPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 12,
        backgroundColor: "#ffe6b5",
        paddingHorizontal: 8,
        paddingVertical: 5,
      }}
    >
      <MaterialCommunityIcons name={icon as never} size={14} color={colors.blue} />
      <Text selectable style={{ ...typography.cardMeta, color: colors.ink, fontFamily: typography.cardTitle.fontFamily }}>
        {label}
      </Text>
    </View>
  );
}

function SummaryMetric({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tone}18` }}>
          <MaterialCommunityIcons name={icon as never} size={14} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
            {label}
          </Text>
        </View>
        <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function TaskPassScreen() {
  const { taskPassPlans, currentTaskPass, dailyOverview, createDeposit, isSubmitting, errorMessage, providerStatus } = useMobileStore();

  const activePlan = currentTaskPass?.plan ?? null;
  const assignedCount = dailyOverview?.assignedCount ?? 0;
  const completedCount = dailyOverview?.completedCount ?? 0;
  const tokenEarned = dailyOverview?.tokenBalance.todayEarned ?? 0;
  const tokenCap = dailyOverview?.tokenBalance.todayCap ?? activePlan?.dailyTokenCap ?? 0;
  const dayNumber = dailyOverview?.dayNumber ?? 1;
  const totalDays = dailyOverview?.totalDays ?? activePlan?.durationDays ?? 0;

  const recommendedPlan = useMemo(() => {
    const growth = taskPassPlans.find((plan) => /growth/i.test(plan.name));
    if (growth) return growth;
    return taskPassPlans.find((plan) => plan.id !== activePlan?.id) ?? taskPassPlans[0] ?? null;
  }, [activePlan?.id, taskPassPlans]);

  const otherPlans = taskPassPlans.filter((plan) => plan.id !== recommendedPlan?.id);

  const handleBuy = (planId: string, amount: number) => {
    const provider = providerStatus?.cashfree.paymentsLive ? "cashfree" : "mock";
    void createDeposit(amount, provider, planId);
  };

  return (
    <ScreenShell quietDecor>
      <SectionCard
        eyebrow="Current Pass"
        title={activePlan ? "Current pass" : "No active Task Pass"}
        subtitle={
          activePlan
            ? `${activePlan.name} is active right now. Buy your next pass when you're ready for the next cycle.`
            : "Choose a Task Pass to unlock daily tasks and reward earning."
        }
      >
        {activePlan ? (
          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 13, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                  {activePlan.name}
                </Text>
                <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                  Day {dayNumber} of {totalDays}. Complete tasks daily and stay within your daily reward limit.
                </Text>
              </View>
              <StatusBadge label="Active" tone="success" />
            </View>

            <View style={{ flexDirection: "row", gap: 9 }}>
              <SummaryMetric label="Tasks done" value={`${completedCount}/${assignedCount}`} icon="clipboard-check-outline" tone={colors.green} />
              <SummaryMetric label="Added today" value={`${tokenEarned}/${tokenCap}`} icon="star-circle-outline" tone={colors.goldDeep} />
            </View>
          </View>
        ) : (
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", padding: 13, gap: 6 }}>
            <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
              Unlock daily tasks
            </Text>
            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              Pick a pass below, complete payment, and your daily reward flow starts automatically.
            </Text>
          </View>
        )}
      </SectionCard>

      {recommendedPlan ? (
        <SectionCard eyebrow="Recommended" title="Recommended plan" subtitle="Best balance of price, duration, and daily reward pace.">
          <LinearGradient colors={["#eef3ff", "#f8fbff", "#fffdf6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 14, gap: 13 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.greenSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text selectable style={{ ...typography.badge, color: colors.green }}>
                    MOST POPULAR
                  </Text>
                </View>
                <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
                  {recommendedPlan.name}
                </Text>
                <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                  {recommendedPlan.durationDays} days with {recommendedPlan.dailyTaskMin}-{recommendedPlan.dailyTaskMax} tasks each day.
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                  ONE-TIME PRICE
                </Text>
                <Text selectable style={{ ...typography.heroValue, color: colors.ink, fontSize: 24, lineHeight: 28 }}>
                  Rs {recommendedPlan.priceAmount}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 3, marginBottom: 1 }}>
              <PlanPill icon="calendar-range" label={`${recommendedPlan.durationDays} days`} />
              <PlanPill icon="clipboard-text-outline" label={`${recommendedPlan.dailyTaskMin}-${recommendedPlan.dailyTaskMax} tasks/day`} />
              <PlanPill icon="bullseye-arrow" label={`Earn up to ${recommendedPlan.targetTokens}`} />
              <PlanPill icon="star-four-points-outline" label={`Daily limit ${recommendedPlan.dailyTokenCap}`} />
            </View>

            {activePlan?.id === recommendedPlan.id ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.greenSoft, paddingVertical: 11, alignItems: "center", justifyContent: "center" }}>
                <Text selectable style={{ ...typography.cardTitle, color: colors.green }}>
                  Current Pass Active
                </Text>
              </View>
            ) : (
              <Button
                mode="contained"
                style={{ borderRadius: 14 }}
                contentStyle={{ minHeight: 40 }}
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={() => handleBuy(recommendedPlan.id, recommendedPlan.priceAmount)}
              >
                {`Buy ${recommendedPlan.name}`}
              </Button>
            )}

            <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
              Rs {recommendedPlan.priceAmount} one-time payment.
            </Text>
          </LinearGradient>
        </SectionCard>
      ) : null}

      <SectionCard eyebrow="Other Plans" title={`${otherPlans.length} more options`} subtitle="Choose a different pace if you want a shorter or longer pass.">
        <View style={{ gap: 12 }}>
          {otherPlans.map((plan) => (
            <View
              key={plan.id}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: plan.id === activePlan?.id ? colors.blue : colors.outline,
                backgroundColor: "#ffffff",
                padding: 13,
                gap: 11,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                    {plan.name}
                  </Text>
                  <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                    {plan.durationDays} days {"-"} {plan.dailyTaskMin}-{plan.dailyTaskMax} tasks/day {"-"} earn up to {plan.targetTokens}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text selectable style={{ ...typography.metricValue, color: colors.ink }}>
                    Rs {plan.priceAmount}
                  </Text>
                  {plan.id === activePlan?.id ? <StatusBadge label="Current" tone="info" /> : null}
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 1 }}>
                <PlanPill icon="star-four-points-outline" label={`Daily limit ${plan.dailyTokenCap}`} />
                <PlanPill icon="currency-inr" label="1 INR = 1 reward unit" />
              </View>

              <Button
                mode={plan.id === activePlan?.id ? "contained-tonal" : "outlined"}
                style={{ borderRadius: 14 }}
                contentStyle={{ minHeight: 36 }}
                loading={isSubmitting && plan.id !== activePlan?.id}
                disabled={isSubmitting || plan.id === activePlan?.id}
                onPress={() => handleBuy(plan.id, plan.priceAmount)}
              >
                {plan.id === activePlan?.id ? `${plan.name} active` : `Buy ${plan.name}`}
              </Button>
            </View>
          ))}

          <HelperText type="info" visible>
            Prices are shown in INR. Reward figures explain the pace of each pass.
          </HelperText>
          {errorMessage ? <HelperText type="error" visible>{errorMessage}</HelperText> : null}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}
