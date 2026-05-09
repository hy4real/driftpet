export type ParsedUseFor = {
  setAside: string | null;
  nextStep: string;
};

const NEXT_STEP_PREFIX = /^\s*(下一步|next)\s*[:：]\s*/i;
const SET_ASIDE_PREFIX = /^\s*(先放下|set\s*aside)\s*[:：]\s*/i;

export const parseUseFor = (text: string): ParsedUseFor => {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { setAside: null, nextStep: "" };
  }

  const lines = text.split(/\r?\n/);
  const nextStepLines: string[] = [];
  let setAside: string | null = null;
  let collecting: "none" | "next" | "set" = "none";

  const appendSetAside = (segment: string): void => {
    if (segment.length === 0) {
      return;
    }
    setAside = setAside === null ? segment : `${setAside} ${segment}`;
  };

  for (const line of lines) {
    const nextMatch = line.match(NEXT_STEP_PREFIX);
    if (nextMatch !== null) {
      collecting = "next";
      const remainder = line.replace(NEXT_STEP_PREFIX, "").trim();
      if (remainder.length > 0) {
        nextStepLines.push(remainder);
      }
      continue;
    }

    const setMatch = line.match(SET_ASIDE_PREFIX);
    if (setMatch !== null) {
      collecting = "set";
      const remainder = line.replace(SET_ASIDE_PREFIX, "").trim();
      appendSetAside(remainder);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (collecting === "set") {
      appendSetAside(trimmed);
    } else {
      // No tag yet, or already collecting next — fall through to next-step bucket.
      nextStepLines.push(trimmed);
    }
  }

  return {
    setAside,
    nextStep: nextStepLines.join(" "),
  };
};
