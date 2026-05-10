export type ClaudeDispatchMode = "card" | "thread";

export type ClaudeDispatchMeta = {
  command: string;
  promptPath: string;
  runner: string;
  cwd: string;
  createdAt: number;
  status: "launched" | "failed";
  mode?: ClaudeDispatchMode;
  error?: string;
};
