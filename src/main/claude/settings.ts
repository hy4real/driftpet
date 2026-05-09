import { getPref, setPref } from "../db/prefs";
import { getAppRoot } from "../paths";

export type ClaudeDispatchSettings = {
  terminalApp: string;
  workingDirectory: string;
  continuityMode: "continuous" | "isolated";
};

const TERMINAL_APP_PREF = "claude_dispatch_terminal_app";
const WORKING_DIRECTORY_PREF = "claude_dispatch_working_directory";
const CONTINUITY_MODE_PREF = "driftpet_continuity_mode";

const DEFAULT_TERMINAL_APP = "Ghostty";
const DEFAULT_CONTINUITY_MODE = "continuous";

export const normalizeClaudeDispatchSettings = (
  settings: ClaudeDispatchSettings,
  defaultWorkingDirectory = getAppRoot()
): ClaudeDispatchSettings => {
  const terminalApp = settings.terminalApp.trim() || DEFAULT_TERMINAL_APP;
  const workingDirectory = settings.workingDirectory.trim() || defaultWorkingDirectory;
  const continuityMode = settings.continuityMode === "isolated" ? "isolated" : DEFAULT_CONTINUITY_MODE;

  return {
    terminalApp,
    workingDirectory,
    continuityMode,
  };
};

export const getClaudeDispatchSettings = (): ClaudeDispatchSettings => {
  const terminalApp = getPref(TERMINAL_APP_PREF)?.trim() || process.env.DRIFTPET_CLAUDE_CODE_TERMINAL_APP?.trim() || DEFAULT_TERMINAL_APP;
  const workingDirectory = getPref(WORKING_DIRECTORY_PREF)?.trim() || process.env.DRIFTPET_CLAUDE_CODE_CWD?.trim() || getAppRoot();
  const continuityPref = getPref(CONTINUITY_MODE_PREF)?.trim();
  const continuityMode = continuityPref === "isolated" ? "isolated" : DEFAULT_CONTINUITY_MODE;

  return {
    terminalApp,
    workingDirectory,
    continuityMode,
  };
};

export const setClaudeDispatchSettings = (settings: ClaudeDispatchSettings): ClaudeDispatchSettings => {
  const normalized = normalizeClaudeDispatchSettings(settings);

  setPref(TERMINAL_APP_PREF, normalized.terminalApp);
  setPref(WORKING_DIRECTORY_PREF, normalized.workingDirectory);
  setPref(CONTINUITY_MODE_PREF, normalized.continuityMode);

  return normalized;
};
