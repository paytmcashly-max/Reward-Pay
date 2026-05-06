import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { ScreenShell } from "@/components/screen-shell";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { useMobileStore } from "@/store/mobile-store";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { View } from "@/ui/native";
import { Button, Card, HelperText, Text, TextInput } from "@/ui/paper";

const claimedStatuses = new Set(["claimed"]);
const statusToneMap: Record<string, "info" | "warning" | "success" | "failed"> = {
  assigned: "info",
  started: "warning",
  checking: "warning",
  submitted: "warning",
  approved: "success",
  rejected: "failed",
  claimed: "success",
};

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={{ height: 7, borderRadius: 999, backgroundColor: "#e8edf5", overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", borderRadius: 999, backgroundColor: colors.green }} />
    </View>
  );
}

function Pill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 11, backgroundColor: "#ffe6b5", paddingHorizontal: 8, paddingVertical: 4 }}>
      <MaterialCommunityIcons name={icon as never} size={14} color={colors.blue} />
      <Text selectable style={{ ...typography.cardMeta, color: colors.ink, fontFamily: typography.cardTitle.fontFamily }}>
        {label}
      </Text>
    </View>
  );
}

function SummaryMetric({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 15, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 24, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tone}18` }}>
          <MaterialCommunityIcons name={icon as never} size={14} color={tone} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
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

function StateNote({
  icon,
  title,
  message,
  tone,
}: {
  icon: string;
  title: string;
  message: string;
  tone: "success" | "info" | "error";
}) {
  const palette =
    tone === "success"
      ? { bg: "#eefaf2", border: "#cde9d7", iconBg: colors.greenSoft, icon: colors.green, text: colors.green }
      : tone === "error"
        ? { bg: "#fff3ef", border: "#ffd7ca", iconBg: colors.coralSoft, icon: colors.coral, text: colors.coral }
        : { bg: "#f5f7ff", border: "#dbe4ff", iconBg: colors.blueSoft, icon: colors.blue, text: colors.blue };

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.iconBg,
          }}
        >
          <MaterialCommunityIcons name={icon as never} size={14} color={palette.icon} />
        </View>
        <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
          {title}
        </Text>
      </View>
      <Text selectable style={{ ...typography.cardMeta, color: tone === "info" ? colors.muted : palette.text }}>
        {message}
      </Text>
    </View>
  );
}

export default function TasksScreen() {
  const { currentTaskPass, dailyOverview, dailyTasks, startDailyTask, submitDailyTask, claimDailyTask, isSubmitting, errorMessage } =
    useMobileStore();
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "checking" | "done">("all");
  const activePlan = currentTaskPass?.plan ?? dailyOverview?.activePlan ?? null;
  const completed = dailyTasks.filter((item) => claimedStatuses.has(item.assignment.status)).length;
  const taskProgress = dailyTasks.length ? (completed / dailyTasks.length) * 100 : 0;
  const tokenBalance = dailyOverview?.tokenBalance;
  const allTasksCompleted = Boolean(activePlan && dailyTasks.length > 0 && completed === dailyTasks.length);

  const filteredTasks = useMemo(
    () =>
      dailyTasks.filter((item) => {
        if (filter === "pending") {
          return ["assigned", "started"].includes(item.assignment.status);
        }
        if (filter === "checking") {
          return ["checking", "submitted"].includes(item.assignment.status);
        }
        if (filter === "done") {
          return ["approved", "claimed"].includes(item.assignment.status);
        }
        return true;
      }),
    [dailyTasks, filter],
  );

  return (
    <ScreenShell>
      <SectionCard
        eyebrow="Daily Tasks"
        title={activePlan ? `${dailyTasks.length} tasks assigned` : "No active Task Pass"}
        subtitle={
          activePlan
            ? allTasksCompleted
              ? "All daily tasks completed! Come back tomorrow."
              : `${completed}/${dailyTasks.length} done. Quick checks run before rewards are added.`
            : "Buy a Task Pass to unlock check-ins and daily tasks."
        }
      >
        <View style={{ gap: 9 }}>
          <ProgressBar value={taskProgress} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SummaryMetric label="Added today" value={`${tokenBalance?.todayEarned ?? 0}/${tokenBalance?.todayCap ?? activePlan?.dailyTokenCap ?? 0}`} icon="star-circle-outline" tone={colors.goldDeep} />
          <SummaryMetric label="Pending" value={`${Math.max(dailyTasks.length - completed, 0)}`} icon="clipboard-text-outline" tone={colors.blue} />
        </View>
        <Link href="/task-pass" asChild>
          <Button mode="outlined" style={{ borderRadius: 14 }} contentStyle={{ minHeight: 34 }}>
            Unlock More Tasks
          </Button>
        </Link>
      </SectionCard>

      {activePlan ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 2, marginTop: 4, marginBottom: 2 }}>
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["checking", "Checking"],
            ["done", "Completed"],
          ].map(([value, label]) => (
            <Button
              key={value}
              mode={filter === value ? "contained" : "outlined"}
              compact
              onPress={() => setFilter(value as typeof filter)}
              style={{ flex: 1, borderRadius: 14 }}
              labelStyle={{ fontSize: 11, marginHorizontal: 4 }}
              contentStyle={{ minHeight: 32 }}
            >
              {label}
            </Button>
          ))}
        </View>
      ) : null}

      {allTasksCompleted ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#cde9d7",
            backgroundColor: "#effaf3",
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text selectable style={{ ...typography.cardTitle, color: colors.green }}>
            All daily tasks completed! Come back tomorrow.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        {activePlan && filteredTasks.length ? (
          filteredTasks.map(({ assignment, task }) => {
            const proofDraft = proofDrafts[assignment.id] ?? assignment.proof ?? "";
            const needsProof = task.type === "manual" || task.type === "proof_upload" || task.type === "quiz";
            const canStart = assignment.status === "assigned";
            const canSubmit = assignment.status === "started";
            const canClaim = assignment.status === "approved";
            const isChecking = ["checking", "submitted"].includes(assignment.status);
            const isClaimed = assignment.status === "claimed";
            const isRejected = assignment.status === "rejected";
            const canEditProof = needsProof && assignment.status === "started";
            const submittedProof = proofDraft.trim();

            return (
              <Card key={assignment.id} mode="outlined" style={{ borderRadius: 18, backgroundColor: "#ffffff", overflow: "hidden" }}>
                <Card.Content style={{ padding: 13, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text selectable style={{ ...typography.cardTitle, color: colors.ink }}>
                        {task.title}
                      </Text>
                      <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                        {task.description}
                      </Text>
                    </View>
                    <StatusBadge label={assignment.status.replaceAll("_", " ")} tone={statusToneMap[assignment.status] ?? "info"} />
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 2, marginBottom: 1 }}>
                    <Pill icon="star-four-points-outline" label={`${assignment.rewardTokens} reward`} />
                    <Pill icon="shield-check-outline" label="Quick checks" />
                    <Pill icon="shape-outline" label={task.type.replaceAll("_", " ")} />
                  </View>

                  {needsProof && assignment.status === "assigned" ? (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#fafbff", paddingHorizontal: 10, paddingVertical: 7 }}>
                      <Text selectable style={{ ...typography.cardMeta, color: colors.muted }}>
                        Start this task first, then add your proof or note before submitting.
                      </Text>
                    </View>
                  ) : null}

                  {needsProof && canEditProof ? (
                    <TextInput
                      dense
                      mode="outlined"
                      label={task.type === "quiz" ? "Answer" : "Proof or note"}
                      value={proofDraft}
                      onChangeText={(value: string) => setProofDrafts((current) => ({ ...current, [assignment.id]: value }))}
                      placeholder={task.type === "quiz" ? "Enter your answer" : "Paste proof link or short note"}
                    />
                  ) : null}

                  {isClaimed ? (
                    <StateNote icon="check-circle" title="Completed" message={`+${assignment.rewardTokens} added to your balance.`} tone="success" />
                  ) : canStart ? (
                    <Button mode="outlined" compact contentStyle={{ minHeight: 34 }} labelStyle={{ fontSize: 12, marginHorizontal: 8 }} onPress={() => void startDailyTask(assignment.id)}>
                      Start task
                    </Button>
                  ) : canSubmit ? (
                    <Button
                      mode="contained-tonal"
                      compact
                      contentStyle={{ minHeight: 34 }}
                      labelStyle={{ fontSize: 12, marginHorizontal: 8 }}
                      onPress={() => void submitDailyTask(assignment.id, needsProof ? proofDraft : undefined)}
                      disabled={isSubmitting || (needsProof && !proofDraft.trim())}
                    >
                      Submit proof
                    </Button>
                  ) : canClaim ? (
                    <>
                      <StateNote icon="gift-outline" title="Ready to claim" message="Your checks are complete. Claim this reward now." tone="success" />
                      <Button mode="contained" compact contentStyle={{ minHeight: 34 }} labelStyle={{ fontSize: 12, marginHorizontal: 8 }} onPress={() => void claimDailyTask(assignment.id)} disabled={isSubmitting}>
                        Claim reward
                      </Button>
                    </>
                  ) : null}

                  {needsProof && !canEditProof && submittedProof ? (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.outline, backgroundColor: "#fafbff", paddingHorizontal: 10, paddingVertical: 7, gap: 2 }}>
                      <Text selectable style={{ ...typography.metricLabel, color: colors.muted }}>
                        {isClaimed ? "PROOF SAVED" : "PROOF SUBMITTED"}
                      </Text>
                      <Text selectable numberOfLines={1} style={{ ...typography.cardMeta, color: colors.ink }}>
                        {submittedProof}
                      </Text>
                    </View>
                  ) : null}

                  {isChecking ? (
                    <StateNote icon="progress-clock" title="Checks running" message="We'll unlock claim after the review finishes." tone="info" />
                  ) : null}
                  {isRejected ? (
                    <StateNote icon="alert-circle-outline" title="Needs another try" message={assignment.rejectedReason ?? "Task checks failed. Try the next task."} tone="error" />
                  ) : null}
                </Card.Content>
              </Card>
            );
          })
        ) : (
          <SectionCard
            eyebrow="Empty"
            title={activePlan ? "No tasks in this filter" : "Activate a Task Pass"}
            subtitle={activePlan ? "Try another filter or check back after the next task update." : "Choose a pass and complete payment to receive daily tasks."}
          >
            <Link href="/task-pass" asChild>
              <Button mode="contained">{activePlan ? "Unlock More Tasks" : "Choose Task Pass"}</Button>
            </Link>
          </SectionCard>
        )}
      </View>

      {errorMessage ? <HelperText type="error" visible>{errorMessage}</HelperText> : null}
    </ScreenShell>
  );
}
