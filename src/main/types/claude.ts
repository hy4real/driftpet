export type ClaudeDispatchMode = "card" | "thread";
export type ClaudeDispatchStatus = "launched" | "failed" | "done" | "dismissed";
export type ClaudeDispatchUserStatus = "done" | "dismissed";

export type ClaudeDispatchMeta = {
  command: string;
  promptPath: string;
  runner: string;
  cwd: string;
  createdAt: number;
  status: ClaudeDispatchStatus;
  mode?: ClaudeDispatchMode;
  error?: string;
};
