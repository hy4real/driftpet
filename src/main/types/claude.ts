export type ClaudeDispatchMeta = {
  command: string;
  promptPath: string;
  runner: string;
  cwd: string;
  createdAt: number;
  status: "launched" | "failed";
  error?: string;
};
