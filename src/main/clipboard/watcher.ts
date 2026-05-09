// Watches the system clipboard for fresh text the user just copied and emits
// an "offer" event so driftpet can ask, in mini mode, whether to drop it into
// the nest. Pollling is the only portable option — Electron has no native
// "clipboard changed" event on macOS — so the loop is intentionally cheap and
// only acts when readText() returns something different from the last poll.

export type ClipboardOffer = {
  text: string;
  capturedAt: number;
};

export type ClipboardOfferListener = (offer: ClipboardOffer) => void;

export type ClipboardReader = {
  readText: () => string;
};

export type ClipboardWatcherOptions = {
  reader: ClipboardReader;
  onOffer: ClipboardOfferListener;
  pollIntervalMs?: number;
  initialClipboardText?: string;
  now?: () => number;
};

const DEFAULT_POLL_INTERVAL_MS = 1500;
const MIN_OFFER_LENGTH = 10;
const MAX_OFFER_LENGTH = 2000;

export const isOfferableClipboardText = (raw: string): boolean => {
  if (typeof raw !== "string") {
    return false;
  }

  const trimmed = raw.trim();
  if (trimmed.length < MIN_OFFER_LENGTH || trimmed.length > MAX_OFFER_LENGTH) {
    return false;
  }

  return true;
};

// Pure decision: given the current poll result and what we've already acted on,
// should we emit an offer, and what is the new "last seen" pointer?
export const decideClipboardAction = (
  currentText: string,
  lastSeenText: string
): { lastSeenText: string; offer: string | null } => {
  if (currentText === lastSeenText) {
    return { lastSeenText, offer: null };
  }

  // Always advance lastSeen, even when the text isn't offerable, so we don't
  // re-evaluate the same low-signal blob on every poll.
  if (!isOfferableClipboardText(currentText)) {
    return { lastSeenText: currentText, offer: null };
  }

  return { lastSeenText: currentText, offer: currentText.trim() };
};

export const startClipboardWatcher = (
  options: ClipboardWatcherOptions
): { stop: () => void } => {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  let lastSeenText = options.initialClipboardText ?? readSafely(options.reader);

  const tick = (): void => {
    const currentText = readSafely(options.reader);
    const decision = decideClipboardAction(currentText, lastSeenText);
    lastSeenText = decision.lastSeenText;
    if (decision.offer !== null) {
      options.onOffer({ text: decision.offer, capturedAt: now() });
    }
  };

  const handle = setInterval(tick, pollIntervalMs);
  // Don't keep the event loop alive on this timer alone.
  if (typeof handle.unref === "function") {
    handle.unref();
  }

  return {
    stop: (): void => {
      clearInterval(handle);
    }
  };
};

const readSafely = (reader: ClipboardReader): string => {
  try {
    return reader.readText() ?? "";
  } catch {
    return "";
  }
};
