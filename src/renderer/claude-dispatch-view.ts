import type { ClaudeDispatchMeta } from "../main/types/claude";

export type ClaudeDispatchStatusView = {
  label: string;
  detail: string | null;
  tone: "success" | "error";
};

const formatDispatchTime = (createdAt: number): string => {
  if (createdAt <= 0) {
    return "";
  }

  return ` · ${new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const dispatchModeLabel = (dispatch: ClaudeDispatchMeta): string => {
  return dispatch.mode === "thread" ? "整条线" : "单卡";
};

export const getClaudeDispatchStatusView = (
  dispatch: ClaudeDispatchMeta | null | undefined
): ClaudeDispatchStatusView | null => {
  if (dispatch === null || dispatch === undefined || dispatch.status === "dismissed") {
    return null;
  }

  const modeLabel = dispatchModeLabel(dispatch);

  if (dispatch.status === "failed") {
    return {
      label: `${modeLabel}派发失败`,
      detail: dispatch.error ?? "检查终端配置",
      tone: "error",
    };
  }

  const timeLabel = formatDispatchTime(dispatch.createdAt);
  const detail = dispatch.cwd.length > 0
    ? `${dispatch.runner} · ${dispatch.cwd}`
    : dispatch.runner;

  return {
    label: dispatch.status === "done"
      ? `${modeLabel}已完成${timeLabel}`
      : `${modeLabel}已派发${timeLabel}`,
    detail,
    tone: "success",
  };
};
