export type PetUiState = "idle" | "happy" | "curious" | "carrying" | "tired" | "sleepy" | "thinking";
export type PetExpression = "idle" | "run-right" | "run-left" | "waving" | "jumping" | "failed" | "waiting" | "running" | "review";

export type ExpressionTrigger = {
  expression: PetExpression;
  startedAt: number;
  durationMs: number;
};

export const resolveExpression = (
  stateExpression: PetExpression,
  triggers: ExpressionTrigger[],
  now: number
): PetExpression => {
  // Find the most recent active trigger.
  let newest: ExpressionTrigger | null = null;
  for (const trigger of triggers) {
    if (now - trigger.startedAt < trigger.durationMs) {
      if (newest === null || trigger.startedAt > newest.startedAt) {
        newest = trigger;
      }
    }
  }

  return newest !== null ? newest.expression : stateExpression;
};

export const getPetUiState = ({
  activeCardTitle,
  isExpanded,
  petHourlyBudget,
  petShownThisHour
}: {
  activeCardTitle: string | null;
  isExpanded: boolean;
  petHourlyBudget: number;
  petShownThisHour: number;
}): PetUiState => {
  if (isExpanded) {
    return "thinking";
  }
  if (activeCardTitle !== null) {
    return "carrying";
  }
  if (petShownThisHour >= petHourlyBudget) {
    return "tired";
  }

  return "idle";
};

export const petExpressionByState: Record<PetUiState, PetExpression> = {
  idle: "idle",
  happy: "jumping",
  curious: "jumping",
  carrying: "waving",
  tired: "waiting",
  sleepy: "review",
  thinking: "waiting"
};

export const moodLabelByState: Record<PetUiState, string> = {
  idle: "陪你待着",
  happy: "开心摇尾巴",
  curious: "凑过来了",
  carrying: "叼着小卡片",
  tired: "安静陪伴",
  sleepy: "打瞌睡中",
  thinking: "认真听你说"
};

export const statusLabelByState: Record<PetUiState, string> = {
  idle: "我在这儿，陪你待一会儿。",
  happy: "嘿，我在～",
  curious: "我凑近一点看看。",
  carrying: "我带着一张小卡片来找你。",
  tired: "今天提醒够多啦，我安静陪着你。",
  sleepy: "我先睡一会儿，要我陪你时再叫醒。",
  thinking: "你慢慢说，我听着。"
};
