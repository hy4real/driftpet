import { useCallback, useEffect, useRef, useState } from "react";
import type { CardRecord } from "../main/types/card";
import type { ClipboardOffer } from "../main/clipboard/watcher";
import type { AppStatus } from "../main/types/status";
import type { ClaudeDispatchUserStatus } from "../main/types/claude";
import type { WorklineLifecycleAction } from "../main/workline/lifecycle";
import { buildThreadBundle } from "../shared/thread-bundle";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PetShell } from "./components/PetShell";
import bobaSpritesheet from "./assets/boba-spritesheet.webp";
import { rankHistoryCards } from "./rank-history";
import { WAITING_REMINDER_COOLDOWN_MS, getWaitingReminderSignal } from "./waiting-reminder-cadence";
import { resolvePetShellSurface, surfaceNeedsMiniBubbleWidth, type WindowMode } from "./ui-surface";

type PetdexRuntimeState = {
  expression: "idle" | "running" | "waiting" | "waving" | "jumping" | "failed" | "review";
  durationMs: number | null;
  updatedAt: number | null;
  counter: number | null;
  agentSource: string | null;
};

type PetdexRuntimeBubble = {
  text: string;
  agentSource: string | null;
  updatedAt: number | null;
  counter: number | null;
};

type ClaudeDispatchFeedback = {
  cardId: number;
  tone: "success" | "error";
  message: string;
};

type CompactCardReturnMode = "remembered_summary" | "expanded" | "mini";

type HotCapChoice = {
  card: CardRecord;
  hotCards: CardRecord[];
};

const worklineLifecycleNote: Record<WorklineLifecycleAction, string> = {
  continue_guarding: "好，我继续替你守着这条。",
  tomorrow: "好，明天我只轻轻浮一次。",
  archive: "这条线已沉淀，需要时还能找回。",
  drop: "这条线先放下了，7 天内需要时还能找回。",
  later_today: "好，今天稍后再看。",
  recover: "这条线已放回今天稍后再看。",
};

const RECENTLY_RELEASED_MARKER_MS = 15 * 60 * 1000;
const FRESH_RESOLVE_PRIORITIZED_MS = 10 * 60 * 1000;
const CHAOS_TEXT_DRAFT_KEY = "driftpet:chaos-text-draft";

const summarizeClaudeDispatchError = (message: string): string => {
  if (message.includes("自动化权限")) {
    return "需要打开 macOS 自动化权限。";
  }
  if (message.includes("辅助功能权限")) {
    return "需要打开 macOS 辅助功能权限。";
  }
  if (message.includes("找不到") || message.includes("没装好")) {
    return "终端应用没找到，先检查设置。";
  }
  return "派发失败了。先检查 Claude / 终端配置。";
};

const summarizeWorklineLifecycleError = (message: string): string => {
  if (message.includes("already guarding") || message.includes("3 hot worklines")) {
    return "我已经在帮你守 3 条线了。这张先放到今天稍后再看，或先放下一条。";
  }

  if (message.includes("no longer recoverable")) {
    return "这条线已经过了可找回时间。";
  }

  return "这条线刚才没改成。再试一次。";
};

const isActiveHotWorkline = (card: CardRecord, now = Date.now()): boolean =>
  card.lifecycleStatus === "hot" && (card.ttlAt === null || card.ttlAt >= now);

const toSpritesheetUrl = (slug: string, spritesheetPath: string): string => {
  if (slug === "boba" || spritesheetPath.length === 0) {
    return bobaSpritesheet;
  }
  const ext = spritesheetPath.endsWith(".png") ? ".png" : ".webp";
  return `driftpet-pet://${slug}/spritesheet${ext}`;
};

export default function App() {
  const [activeCard, setActiveCard] = useState<CardRecord | null>(null);
  const [pendingCard, setPendingCard] = useState<CardRecord | null>(null);
  const [history, setHistory] = useState<CardRecord[]>([]);
  const [dailyCloseLineCards, setDailyCloseLineCards] = useState<CardRecord[]>([]);
  const [hotCapChoice, setHotCapChoice] = useState<HotCapChoice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("mini");
  const [chaosText, setChaosText] = useState("");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [petNote, setPetNote] = useState<string | null>(null);
  const [spritesheetUrl, setSpritesheetUrl] = useState<string>(bobaSpritesheet);
  const [petdexRuntimeState, setPetdexRuntimeState] = useState<PetdexRuntimeState | null>(null);
  const [petdexBubble, setPetdexBubble] = useState<PetdexRuntimeBubble | null>(null);
  const [isNestSubmitting, setIsNestSubmitting] = useState(false);
  const [isAsync, setIsAsync] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [eventVersion, setEventVersion] = useState(0);
  const [clipboardOffer, setClipboardOffer] = useState<ClipboardOffer | null>(null);
  const [isDispatchingCardId, setIsDispatchingCardId] = useState<number | null>(null);
  const [updatingDispatchCardId, setUpdatingDispatchCardId] = useState<number | null>(null);
  const [capturingDispatchResultCardId, setCapturingDispatchResultCardId] = useState<number | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<number | null>(null);
  const [updatingWorklineCardId, setUpdatingWorklineCardId] = useState<number | null>(null);
  const [claudeDispatchFeedback, setClaudeDispatchFeedback] = useState<ClaudeDispatchFeedback | null>(null);
  const [recentlyReleasedCardId, setRecentlyReleasedCardId] = useState<number | null>(null);
  const [compactCardReturnMode, setCompactCardReturnMode] = useState<CompactCardReturnMode>("remembered_summary");
  const [freshResolveCardId, setFreshResolveCardId] = useState<number | null>(null);
  const petNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentlyReleasedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freshResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingReminderSeenRef = useRef<Map<string, number>>(new Map());
  const miniBubbleResizeActiveRef = useRef(false);
  const windowModeRef = useRef<WindowMode>("mini");
  const rememberedThread = status?.pet.rememberedThread ?? null;
  const rememberedThreadCard = rememberedThread !== null
    ? history.find((card) => card.id === rememberedThread.cardId) ?? null
    : null;
  const activeThreadBundle = buildThreadBundle(rememberedThreadCard, history);
  const isMini = windowMode === "mini";
  const rankedHistory = rankHistoryCards(history, {
    recentlyReleasedCardId,
    anchorCard: rememberedThreadCard,
  });
  const recentCards = rankedHistory.slice(0, 5);
  const miniVisibleNote = isMini ? (petdexBubble?.text ?? petNote) : null;
  const surface = resolvePetShellSurface({
    windowMode,
    activeCard,
    rememberedThread,
    rememberedThreadCard,
    miniVisibleNote,
  });
  const compactCardCloseLabel = compactCardReturnMode === "expanded"
    ? "回到小窝"
    : compactCardReturnMode === "mini"
      ? "回到桌边"
      : "回到守线";
  const needsMiniBubbleWidth = surfaceNeedsMiniBubbleWidth(surface);

  const updateChaosText = useCallback((value: string) => {
    setChaosText(value);
    try {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        window.localStorage.removeItem(CHAOS_TEXT_DRAFT_KEY);
        return;
      }
      window.localStorage.setItem(CHAOS_TEXT_DRAFT_KEY, value);
    } catch (error) {
      console.warn("[driftpet] failed to persist workbench draft:", error);
    }
  }, []);

  const clearChaosTextDraft = useCallback(() => {
    setChaosText("");
    try {
      window.localStorage.removeItem(CHAOS_TEXT_DRAFT_KEY);
    } catch (error) {
      console.warn("[driftpet] failed to clear workbench draft:", error);
    }
  }, []);

  useEffect(() => {
    windowModeRef.current = windowMode;
  }, [windowMode]);

  useEffect(() => {
    if (!isMini) {
      // Leaving mini mode: drop the bubble-resize tracking without sending IPC.
      // The expanded/compact resize already set the right bounds, and a stale
      // setMiniBubbleVisible(false) would shrink the window back to mini size.
      if (miniBubbleResizeActiveRef.current) {
        miniBubbleResizeActiveRef.current = false;
      }
      return;
    }

    if (needsMiniBubbleWidth === miniBubbleResizeActiveRef.current) {
      return;
    }

    miniBubbleResizeActiveRef.current = needsMiniBubbleWidth;
    void window.driftpet.setMiniBubbleVisible(needsMiniBubbleWidth);
  }, [isMini, needsMiniBubbleWidth]);

  useEffect(() => {
    return () => {
      if (miniBubbleResizeActiveRef.current) {
        miniBubbleResizeActiveRef.current = false;
        void window.driftpet.setMiniBubbleVisible(false);
      }
    };
  }, []);

  useEffect(() => {
    if (recentlyReleasedTimerRef.current !== null) {
      clearTimeout(recentlyReleasedTimerRef.current);
      recentlyReleasedTimerRef.current = null;
    }

    if (recentlyReleasedCardId === null) {
      return;
    }

    recentlyReleasedTimerRef.current = setTimeout(() => {
      setRecentlyReleasedCardId((current) => current === recentlyReleasedCardId ? null : current);
      recentlyReleasedTimerRef.current = null;
    }, RECENTLY_RELEASED_MARKER_MS);

    return () => {
      if (recentlyReleasedTimerRef.current !== null) {
        clearTimeout(recentlyReleasedTimerRef.current);
        recentlyReleasedTimerRef.current = null;
      }
    };
  }, [recentlyReleasedCardId]);

  useEffect(() => {
    if (freshResolveTimerRef.current !== null) {
      clearTimeout(freshResolveTimerRef.current);
      freshResolveTimerRef.current = null;
    }

    if (freshResolveCardId === null) {
      return;
    }

    freshResolveTimerRef.current = setTimeout(() => {
      setFreshResolveCardId((current) => current === freshResolveCardId ? null : current);
      freshResolveTimerRef.current = null;
    }, FRESH_RESOLVE_PRIORITIZED_MS);

    return () => {
      if (freshResolveTimerRef.current !== null) {
        clearTimeout(freshResolveTimerRef.current);
        freshResolveTimerRef.current = null;
      }
    };
  }, [freshResolveCardId]);

  useEffect(() => {
    if (recentlyReleasedCardId === null) {
      return;
    }
    if (rememberedThread !== null) {
      setRecentlyReleasedCardId(null);
      return;
    }
    if (!history.some((card) => card.id === recentlyReleasedCardId)) {
      setRecentlyReleasedCardId(null);
    }
  }, [history, rememberedThread, recentlyReleasedCardId]);

  useEffect(() => {
    if (freshResolveCardId === null) {
      return;
    }
    if (rememberedThreadCard?.id === freshResolveCardId) {
      return;
    }
    if (!history.some((card) => card.id === freshResolveCardId)) {
      setFreshResolveCardId(null);
    }
  }, [freshResolveCardId, history, rememberedThreadCard]);

  useEffect(() => {
    void window.driftpet.listRecentCards().then((cards) => {
      setHistory(cards);
      setActiveCard(null);
    });
    void window.driftpet.getStatus().then(setStatus);
    void window.driftpet.petActive().then((active) => {
      setSpritesheetUrl(toSpritesheetUrl(active.slug, active.spritesheetPath));
    });

    const unsubscribePet = window.driftpet.onPetActiveChanged((assets) => {
      setSpritesheetUrl(toSpritesheetUrl(assets.slug, assets.spritesheetPath));
    });

    const unsubscribePetdexRuntime = window.driftpet.onPetdexRuntimeState((state) => {
      setPetdexRuntimeState(state.expression === "idle" ? null : state);
    });

    const unsubscribePetdexBubble = window.driftpet.onPetdexBubble((bubble) => {
      const trimmedText = bubble.text.trim();
      setPetdexBubble(trimmedText.length === 0 ? null : { ...bubble, text: trimmedText });
    });

    const unsubscribe = window.driftpet.onCardCreated((card) => {
      if (petNoteTimerRef.current !== null) {
        clearTimeout(petNoteTimerRef.current);
        petNoteTimerRef.current = null;
      }
      setRecentlyReleasedCardId(null);
      setFreshResolveCardId(null);
      if (windowModeRef.current === "mini") {
        setPendingCard(card);
        setPetNote(null);
      } else {
        setPetNote(`我收到了一张小卡片：${card.title}`);
        setActiveCard(card);
      }
      setHistory((current) => [card, ...current.filter((entry) => entry.id !== card.id)].slice(0, 20));
      setEventVersion((v) => v + 1);
      setHasError(false);
      void window.driftpet.getStatus().then(setStatus);
    });

    const unsubscribeClipboard = window.driftpet.onClipboardOffer((offer) => {
      setClipboardOffer(offer);
    });

    return () => {
      unsubscribe();
      unsubscribePet();
      unsubscribePetdexRuntime();
      unsubscribePetdexBubble();
      unsubscribeClipboard();
      if (petNoteTimerRef.current !== null) {
        clearTimeout(petNoteTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (windowMode !== "expanded") {
      setDailyCloseLineCards([]);
      return () => {
        cancelled = true;
      };
    }

    void window.driftpet.listCloseLineCandidates()
      .then((cards) => {
        if (!cancelled) {
          setDailyCloseLineCards(cards);
        }
      })
      .catch((error) => {
        console.warn("[driftpet] failed to load daily close-line candidates:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [windowMode]);

  useEffect(() => {
    if (
      petdexRuntimeState === null ||
      petdexRuntimeState.durationMs === null ||
      petdexRuntimeState.updatedAt === null
    ) {
      return;
    }

    const remainingMs = petdexRuntimeState.durationMs - (Date.now() - petdexRuntimeState.updatedAt);
    if (remainingMs <= 0) {
      setPetdexRuntimeState(null);
      return;
    }

    const timer = setTimeout(() => {
      setPetdexRuntimeState((current) =>
        current?.counter === petdexRuntimeState.counter ? null : current
      );
    }, remainingMs);

    return () => {
      clearTimeout(timer);
    };
  }, [petdexRuntimeState]);

  const showPetNote = useCallback((note: string, duration = 4200) => {
    setPetdexBubble(null);
    setPetNote(note);
    if (petNoteTimerRef.current !== null) {
      clearTimeout(petNoteTimerRef.current);
    }
    petNoteTimerRef.current = setTimeout(() => {
      setPetNote(null);
      petNoteTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreDraft = async () => {
      const savedDraft = window.localStorage.getItem(CHAOS_TEXT_DRAFT_KEY);
      if (savedDraft !== null && savedDraft.trim().length > 0) {
        setChaosText(savedDraft);
        return;
      }

      const recoverableDraft = await window.driftpet.getRecoverableChaosDraft();
      if (cancelled || recoverableDraft === null || recoverableDraft.rawText.trim().length === 0) {
        return;
      }

      setChaosText(recoverableDraft.rawText);
      try {
        window.localStorage.setItem(CHAOS_TEXT_DRAFT_KEY, recoverableDraft.rawText);
      } catch (error) {
        console.warn("[driftpet] failed to persist recovered workbench draft:", error);
      }
      showPetNote(
        recoverableDraft.status === "failed"
          ? "上次没收好的内容已放回输入框。"
          : "上次还在整理的内容已放回输入框。",
        4200
      );
    };

    void restoreDraft().catch((error) => {
      console.warn("[driftpet] failed to restore workbench draft:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [showPetNote]);

  useEffect(() => {
    if (windowMode !== "mini") {
      return;
    }
    if (petdexBubble !== null || petNote !== null) {
      return;
    }
    if (isAsync || isNestSubmitting || isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    const signal = getWaitingReminderSignal(rememberedThreadCard);
    if (signal === null) {
      return;
    }

    const now = Date.now();
    const lastShownAt = waitingReminderSeenRef.current.get(signal.key) ?? 0;
    if (now - lastShownAt < WAITING_REMINDER_COOLDOWN_MS) {
      return;
    }

    waitingReminderSeenRef.current.set(signal.key, now);
    showPetNote(signal.note, signal.duration);
  }, [
    windowMode,
    petdexBubble,
    petNote,
    isAsync,
    isNestSubmitting,
    isDispatchingCardId,
    updatingDispatchCardId,
    capturingDispatchResultCardId,
    updatingWorklineCardId,
    rememberedThreadCard,
    showPetNote,
  ]);

  const revealPendingCard = () => {
    if (pendingCard === null) {
      return;
    }

    setActiveCard(pendingCard);
    setPendingCard(null);
    setPetNote(null);
    if (petNoteTimerRef.current !== null) {
      clearTimeout(petNoteTimerRef.current);
      petNoteTimerRef.current = null;
    }
  };

  const clearPetNote = () => {
    setPetNote(null);
    if (petNoteTimerRef.current !== null) {
      clearTimeout(petNoteTimerRef.current);
      petNoteTimerRef.current = null;
    }
  };

  const dismissClipboardOffer = () => {
    setClipboardOffer(null);
  };

  const openCompactCard = async (card: CardRecord) => {
    const nextReturnMode: CompactCardReturnMode = windowModeRef.current === "expanded"
      ? "expanded"
      : rememberedThread !== null || rememberedThreadCard !== null
        ? "remembered_summary"
        : "mini";
    setCompactCardReturnMode(nextReturnMode);
    setActiveCard(card);
    setPendingCard(null);
    setHistoryOpen(false);
    if (windowModeRef.current !== "compact") {
      await setWindowSize("compact", { revealPending: false });
    }
  };

  const showCompactRememberedSummary = async () => {
    setActiveCard(null);
    if (windowModeRef.current !== "compact") {
      await setWindowSize("compact", { revealPending: false });
    }
  };

  const closeCompactCard = useCallback(async () => {
    setActiveCard(null);
    if (compactCardReturnMode === "expanded") {
      await setWindowSize("expanded", { revealPending: false });
      return;
    }
    if (compactCardReturnMode === "mini" || rememberedThreadCard === null) {
      await setWindowSize("mini", { revealPending: false });
      return;
    }
    await showCompactRememberedSummary();
  }, [compactCardReturnMode, rememberedThreadCard]);

  const acceptClipboardOffer = async () => {
    if (clipboardOffer === null) {
      return;
    }
    const text = clipboardOffer.text;
    dismissClipboardOffer();
    updateChaosText(text);
    await setWindowSize("expanded");
  };

  const resurfaceRememberedThread = async () => {
    if (rememberedThread === null) {
      return;
    }
    const fromHistory = history.find((card) => card.id === rememberedThread.cardId) ?? null;
    if (fromHistory !== null) {
      await openCompactCard(fromHistory);
      return;
    }
    const cards = await window.driftpet.listRecentCards();
    setHistory(cards);
    const refetched = cards.find((card) => card.id === rememberedThread.cardId) ?? null;
    if (refetched !== null) {
      await openCompactCard(refetched);
      return;
    }
    showPetNote("这张线我还守着，但卡片要去历史里翻一翻。", 4200);
  };

  const dispatchClaudeCode = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    setIsDispatchingCardId(card.id);
    setClaudeDispatchFeedback(null);
    try {
      const result = await window.driftpet.dispatchClaudeCode(card.id);
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: result.status === "failed" ? "error" : "success",
        message: result.status === "failed"
          ? `派发失败：${result.error ?? "请检查 Claude / 终端配置。"}`
          : `已派给 Claude Code：${result.runner}`,
      });
      showPetNote(
        result.status === "failed"
          ? "派发失败了。先检查 Claude / 终端配置。"
          : `已派给 Claude Code：${result.runner}`,
        4200
      );
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } catch (error) {
      console.error("[driftpet] Claude Code dispatch failed:", error);
      const message = error instanceof Error
        ? error.message
        : "派发失败了。先检查 Claude / 终端配置。";
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: `派发失败：${message}`,
      });
      showPetNote(summarizeClaudeDispatchError(message), 5200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } finally {
      setIsDispatchingCardId(null);
    }
  };

  const dispatchClaudeThread = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    setIsDispatchingCardId(card.id);
    setClaudeDispatchFeedback(null);
    try {
      const result = await window.driftpet.dispatchClaudeThread(card.id);
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: result.status === "failed" ? "error" : "success",
        message: result.status === "failed"
          ? `整条线派发失败：${result.error ?? "请检查 Claude / 终端配置。"}`
          : `整条线已派给 Claude Code：${result.runner}`,
      });
      showPetNote(
        result.status === "failed"
          ? "整条线派发失败了。先检查 Claude / 终端配置。"
          : `整条线已派给 Claude Code：${result.runner}`,
        4200
      );
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } catch (error) {
      console.error("[driftpet] Claude thread dispatch failed:", error);
      const message = error instanceof Error
        ? error.message
        : "整条线派发失败了。先检查 Claude / 终端配置。";
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: `整条线派发失败：${message}`,
      });
      showPetNote(summarizeClaudeDispatchError(message), 5200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } finally {
      setIsDispatchingCardId(null);
    }
  };

  const deleteCard = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    setDeletingCardId(card.id);
    setClaudeDispatchFeedback(null);
    try {
      const deleted = await window.driftpet.deleteCard(card.id);
      if (!deleted) {
        showPetNote("这张卡片没删掉。刷新一下再试。", 4200);
        return;
      }

      setHistory((current) => current.filter((entry) => entry.id !== card.id));
      setActiveCard((current) => current?.id === card.id ? null : current);
      setPendingCard((current) => current?.id === card.id ? null : current);
      setRecentlyReleasedCardId((current) => current === card.id ? null : current);
      setFreshResolveCardId((current) => current === card.id ? null : current);
      showPetNote("这张记忆已经删掉了。", 3200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
    } catch (error) {
      console.error("[driftpet] card delete failed:", error);
      showPetNote("删除失败了。再试一次。", 4200);
    } finally {
      setDeletingCardId(null);
    }
  };

  const updateWorklineLifecycle = async (card: CardRecord, action: WorklineLifecycleAction): Promise<boolean> => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return false;
    }

    setUpdatingWorklineCardId(card.id);
    try {
      const updatedCard = await window.driftpet.updateWorklineLifecycle(card.id, action);
      setHistory((current) => current.map((entry) => entry.id === card.id ? updatedCard : entry));
      const shouldClearForeground = action === "archive" || action === "drop";
      setActiveCard((current) => current?.id === card.id
        ? (shouldClearForeground ? null : updatedCard)
        : current);
      setPendingCard((current) => current?.id === card.id
        ? (shouldClearForeground ? null : updatedCard)
        : current);
      if (shouldClearForeground) {
        setFreshResolveCardId((current) => current === card.id ? null : current);
      }
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
      setDailyCloseLineCards((current) => current.filter((entry) => entry.id !== card.id));
      setHotCapChoice((current) => current?.card.id === card.id ? null : current);
      setRecentlyReleasedCardId(action === "drop" && nextStatus.pet.rememberedThread === null ? card.id : null);
      showPetNote(worklineLifecycleNote[action], action === "drop" ? 4200 : 3200);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "workline lifecycle update failed";
      const isHotCapError = message.includes("already guarding") || message.includes("3 hot worklines");
      if (isHotCapError && action === "continue_guarding") {
        setHotCapChoice({
          card,
          hotCards: history.filter((entry) => entry.id !== card.id && isActiveHotWorkline(entry)).slice(0, 3),
        });
      } else {
        console.error("[driftpet] workline lifecycle update failed:", error);
      }
      showPetNote(summarizeWorklineLifecycleError(message), 5200);
      return false;
    } finally {
      setUpdatingWorklineCardId(null);
    }
  };

  const releaseRememberedThread = async (card: CardRecord) => {
    const updated = await updateWorklineLifecycle(card, "drop");
    if (updated && windowModeRef.current !== "mini") {
      await setWindowSize("mini", { revealPending: false });
    }
  };

  const skipDailyCloseLineToday = async () => {
    const cardIds = dailyCloseLineCards.map((card) => card.id);
    try {
      await window.driftpet.skipDailyCloseLine(cardIds);
      setDailyCloseLineCards([]);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
      showPetNote("好，今天先不问。", 3200);
    } catch (error) {
      console.error("[driftpet] daily close-line skip failed:", error);
      showPetNote("今天先不问刚才没记住。再点一次。", 4200);
    }
  };

  const chooseHotCapLater = async () => {
    if (hotCapChoice === null) {
      return;
    }
    await updateWorklineLifecycle(hotCapChoice.card, "later_today");
  };

  const chooseHotCapDrop = async () => {
    if (hotCapChoice === null) {
      return;
    }
    await updateWorklineLifecycle(hotCapChoice.card, "drop");
  };

  const chooseHotCapReplacement = async (replaceCard: CardRecord) => {
    if (hotCapChoice === null) {
      return;
    }
    const released = await updateWorklineLifecycle(replaceCard, "later_today");
    if (!released) {
      return;
    }
    await updateWorklineLifecycle(hotCapChoice.card, "continue_guarding");
  };

  const updateClaudeDispatchStatus = async (card: CardRecord, nextStatus: ClaudeDispatchUserStatus) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    setUpdatingDispatchCardId(card.id);
    setClaudeDispatchFeedback(null);
    try {
      const updatedDispatch = await window.driftpet.updateClaudeDispatchStatus(card.id, nextStatus);
      const message = nextStatus === "done" ? "Claude 派发已标记完成。" : "Claude 派发记录已收起。";
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "success",
        message,
      });
      showPetNote(message, 3000);
      setActiveCard((current) => current?.id === card.id
        ? { ...current, latestClaudeDispatch: updatedDispatch }
        : current);
      setPendingCard((current) => current?.id === card.id
        ? { ...current, latestClaudeDispatch: updatedDispatch }
        : current);
      const nextStatusSnapshot = await window.driftpet.getStatus();
      setStatus(nextStatusSnapshot);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } catch (error) {
      console.error("[driftpet] Claude dispatch status update failed:", error);
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: error instanceof Error
          ? `更新派发状态失败：${error.message}`
          : "更新派发状态失败。",
      });
      showPetNote("更新派发状态失败。", 4200);
    } finally {
      setUpdatingDispatchCardId(null);
    }
  };

  const captureClaudeDispatchResult = async (card: CardRecord, resultSummary: string) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null || updatingWorklineCardId !== null) {
      return;
    }

    setCapturingDispatchResultCardId(card.id);
    setClaudeDispatchFeedback(null);
    try {
      const updatedDispatch = await window.driftpet.captureClaudeDispatchResult(card.id, resultSummary);
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "success",
        message: "Claude 结果已记回这条线。",
      });
      showPetNote("Claude 结果已记回这条线。", 3200);
      setActiveCard((current) => current?.id === card.id
        ? { ...current, latestClaudeDispatch: updatedDispatch }
        : current);
      setPendingCard((current) => current?.id === card.id
        ? { ...current, latestClaudeDispatch: updatedDispatch }
        : current);
      const nextStatusSnapshot = await window.driftpet.getStatus();
      setStatus(nextStatusSnapshot);
      setFreshResolveCardId(nextStatusSnapshot.pet.rememberedThread?.cardId === card.id ? card.id : null);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } catch (error) {
      console.error("[driftpet] Claude dispatch result capture failed:", error);
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: error instanceof Error
          ? `记录 Claude 结果失败：${error.message}`
          : "记录 Claude 结果失败。",
      });
      showPetNote("记录 Claude 结果失败。", 4200);
    } finally {
      setCapturingDispatchResultCardId(null);
    }
  };

  const pokePet = () => {
    const notes = [
      "我在。",
      "啵。",
      "陪你待着。",
      pendingCard !== null ? "双击，我给你看。" : activeCard === null ? "有事再叫我。" : "卡片还在。"
    ];
    const nextNote = notes[Math.floor(Math.random() * notes.length)];
    showPetNote(nextNote, 2400);
  };

  const submitChaosReset = async () => {
    const nextValue = chaosText.trim();
    if (nextValue.length === 0 || isNestSubmitting) {
      return;
    }

    setIsNestSubmitting(true);
    setIsAsync(true);
    setHasError(false);
    showPetNote("我收下啦，慢慢帮你整理。", 3000);
    try {
      const card = await window.driftpet.ingestChaosReset(nextValue);
      setPendingCard(null);
      setActiveCard(card);
      clearChaosTextDraft();
      setEventVersion((v) => v + 1);
      showPetNote("整理好了，我叼着小卡片回来了。", 3600);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
    } catch (error) {
      console.error("[driftpet] nest submit failed:", error);
      setHasError(true);
      showPetNote("这次没收好，但内容还在。我们再试一次。", 5200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
    } finally {
      setIsNestSubmitting(false);
      setIsAsync(false);
    }
  };

  const refreshStatus = () => {
    void window.driftpet.getStatus().then(setStatus);
  };

  const changePetBudget = async (delta: number) => {
    if (status === null) {
      return;
    }

    const nextBudget = await window.driftpet.setPetHourlyBudget(status.pet.hourlyBudget + delta);
    showPetNote(delta > 0 ? "好，我可以多提醒你一点。" : "好，今天我少说一点。", 3000);
    setStatus({
      ...status,
      pet: {
        ...status.pet,
        hourlyBudget: nextBudget
      }
    });
    refreshStatus();
  };

  const setWindowSize = async (
    windowSize: WindowMode,
    options: { revealPending?: boolean } = {}
  ) => {
    const revealPending = options.revealPending ?? true;
    if (windowSize === "mini") {
      setHistoryOpen(false);
      clearPetNote();
    }
    if (windowSize !== "mini") {
      if (revealPending) {
        revealPendingCard();
      }
      // If a re-render happens during the awaited resize (e.g. clipboard offer
      // gets dismissed by acceptClipboardOffer), the mini-bubble effect would
      // otherwise see needsMiniBubbleWidth flip false vs ref still true and
      // fire setMiniBubbleVisible(false) — that IPC arrives at main behind
      // pet:set-window-size("expanded") and shrinks the just-expanded nest
      // back to mini dimensions. Drop the ref proactively so the effect bails.
      miniBubbleResizeActiveRef.current = false;
    }
    await window.driftpet.setWindowSize(windowSize);
    setWindowMode(windowSize);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") {
        return;
      }
      if (historyOpen) {
        setHistoryOpen(false);
        return;
      }

      if (surface.kind === "compact_card") {
        void closeCompactCard();
        return;
      }

      if (windowModeRef.current !== "mini") {
        void setWindowSize("mini");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCompactCard, historyOpen, surface.kind]);

  const handleCompactCardClose = () => {
    void closeCompactCard();
  };

  const handleExpandedResume = () => {
    void resurfaceRememberedThread();
  };

  const handleSelectRecentCard = (card: CardRecord) => {
    void openCompactCard(card);
  };

  return (
    <main className={`app-shell app-shell-${windowMode} ${needsMiniBubbleWidth ? "app-shell-mini-bubble" : ""}`}>
      {!isMini ? (
        <HistoryDrawer
          cards={history}
          isOpen={historyOpen}
          recentlyReleasedCardId={recentlyReleasedCardId}
          onClose={() => setHistoryOpen(false)}
          dispatchingCardId={isDispatchingCardId}
          deletingCardId={deletingCardId}
          updatingDispatchCardId={updatingDispatchCardId}
          capturingDispatchResultCardId={capturingDispatchResultCardId}
          claudeDispatchFeedback={claudeDispatchFeedback}
          onDeleteCard={deleteCard}
          onRecoverWorkline={(card) => {
            void updateWorklineLifecycle(card, "recover");
          }}
          onDispatchClaudeCode={dispatchClaudeCode}
          onUpdateClaudeDispatchStatus={updateClaudeDispatchStatus}
          onCaptureClaudeDispatchResult={captureClaudeDispatchResult}
          onSelectCard={(card) => {
            void openCompactCard(card);
          }}
        />
      ) : null}
      <section className="pet-stage">
        <PetShell
          onToggleHistory={() => {
            setHistoryOpen((open) => !open);
          }}
          onCompanionNote={showPetNote}
          onPoke={pokePet}
          onChaosTextChange={updateChaosText}
          isNestSubmitting={isNestSubmitting}
          onSubmitChaosReset={submitChaosReset}
          chaosText={chaosText}
          petHourlyBudget={status?.pet.hourlyBudget ?? 3}
          petNote={petNote}
          petShownThisHour={status?.pet.shownThisHour ?? 0}
          surface={surface}
          spritesheetUrl={spritesheetUrl}
          isAsync={isAsync}
          hasError={hasError}
          eventVersion={eventVersion}
          petdexRuntimeState={petdexRuntimeState}
          petdexBubble={petdexBubble}
          onSetWindowSize={setWindowSize}
          historyOpen={historyOpen}
          recentlyReleasedCardId={recentlyReleasedCardId}
          activeCardTitle={pendingCard?.title ?? activeCard?.title ?? null}
          hasPendingCard={pendingCard !== null}
          rememberedThread={rememberedThread}
          rememberedThreadCard={rememberedThreadCard}
          dailyCloseLineCards={dailyCloseLineCards}
          hotCapChoice={hotCapChoice}
          freshResolveCardId={freshResolveCardId}
          activeThreadBundle={activeThreadBundle}
          dispatchingCardId={isDispatchingCardId}
          updatingDispatchCardId={updatingDispatchCardId}
          capturingDispatchResultCardId={capturingDispatchResultCardId}
          onResurfaceRememberedThread={handleExpandedResume}
          recentCards={recentCards}
          onSelectRecentCard={handleSelectRecentCard}
          onDispatchClaudeThread={dispatchClaudeThread}
          onUpdateClaudeDispatchStatus={updateClaudeDispatchStatus}
          onCaptureClaudeDispatchResult={captureClaudeDispatchResult}
          clipboardOffer={clipboardOffer}
          onAcceptClipboardOffer={acceptClipboardOffer}
          onDismissClipboardOffer={dismissClipboardOffer}
          onReleaseRememberedThread={releaseRememberedThread}
          onUpdateWorklineLifecycle={(card, action) => {
            void updateWorklineLifecycle(card, action);
          }}
          onSkipDailyCloseLine={() => {
            void skipDailyCloseLineToday();
          }}
          onHotCapLater={() => {
            void chooseHotCapLater();
          }}
          onHotCapDrop={() => {
            void chooseHotCapDrop();
          }}
          onHotCapReplace={(card) => {
            void chooseHotCapReplacement(card);
          }}
          compactCardCloseLabel={compactCardCloseLabel}
          onCloseCompactCard={handleCompactCardClose}
        />
      </section>
    </main>
  );
}
