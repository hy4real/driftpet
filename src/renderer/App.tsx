import { useCallback, useEffect, useRef, useState } from "react";
import type { CardRecord } from "../main/types/card";
import type { ClipboardOffer } from "../main/clipboard/watcher";
import type { AppStatus } from "../main/types/status";
import type { ClaudeDispatchUserStatus } from "../main/types/claude";
import { buildThreadBundle } from "../shared/thread-bundle";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PetShell } from "./components/PetShell";
import bobaSpritesheet from "./assets/boba-spritesheet.webp";

type WindowMode = "mini" | "compact" | "expanded";

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
  const [claudeDispatchFeedback, setClaudeDispatchFeedback] = useState<ClaudeDispatchFeedback | null>(null);
  const petNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniBubbleResizeActiveRef = useRef(false);
  const windowModeRef = useRef<WindowMode>("mini");
  const rememberedThread = status?.pet.rememberedThread ?? null;
  const rememberedThreadCard = rememberedThread !== null
    ? history.find((card) => card.id === rememberedThread.cardId) ?? null
    : null;
  const activeThreadBundle = buildThreadBundle(rememberedThreadCard, history);
  const isMini = windowMode === "mini";
  const showBubble = windowMode === "compact" && activeCard !== null;
  const showMiniClickBubble = isMini && petNote !== null;
  const recentCards = history.slice(0, 5);
  const showMiniResumeThread = isMini && petNote === null && rememberedThread !== null;
  const needsMiniBubbleWidth = showMiniClickBubble || showMiniResumeThread;

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

  const selectRecentCard = (card: CardRecord) => {
    setActiveCard(card);
  };

  const acceptClipboardOffer = async () => {
    if (clipboardOffer === null) {
      return;
    }
    const text = clipboardOffer.text;
    dismissClipboardOffer();
    setChaosText(text);
    await setWindowSize("expanded");
  };

  const resurfaceRememberedThread = async () => {
    if (rememberedThread === null) {
      return;
    }
    const fromHistory = history.find((card) => card.id === rememberedThread.cardId) ?? null;
    if (fromHistory !== null) {
      setActiveCard(fromHistory);
      setPendingCard(null);
      setHistoryOpen(false);
      if (windowModeRef.current !== "compact") {
        await setWindowSize("compact", { revealPending: false });
      }
      return;
    }
    const cards = await window.driftpet.listRecentCards();
    setHistory(cards);
    const refetched = cards.find((card) => card.id === rememberedThread.cardId) ?? null;
    if (refetched !== null) {
      setActiveCard(refetched);
      setPendingCard(null);
      setHistoryOpen(false);
      if (windowModeRef.current !== "compact") {
        await setWindowSize("compact", { revealPending: false });
      }
      return;
    }
    showPetNote("这张线我还守着，但卡片要去历史里翻一翻。", 4200);
  };

  const dispatchClaudeCode = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null) {
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
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: error instanceof Error
          ? `派发失败：${error.message}`
          : "派发失败了。先检查 Claude / 终端配置。",
      });
      showPetNote("派发失败了。先检查 Claude / 终端配置。", 5200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } finally {
      setIsDispatchingCardId(null);
    }
  };

  const dispatchClaudeThread = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null) {
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
      setClaudeDispatchFeedback({
        cardId: card.id,
        tone: "error",
        message: error instanceof Error
          ? `整条线派发失败：${error.message}`
          : "整条线派发失败了。先检查 Claude / 终端配置。",
      });
      showPetNote("整条线派发失败了。先检查 Claude / 终端配置。", 5200);
      const nextStatus = await window.driftpet.getStatus();
      setStatus(nextStatus);
      const nextHistory = await window.driftpet.listRecentCards();
      setHistory(nextHistory);
    } finally {
      setIsDispatchingCardId(null);
    }
  };

  const deleteCard = async (card: CardRecord) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null) {
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

  const updateClaudeDispatchStatus = async (card: CardRecord, nextStatus: ClaudeDispatchUserStatus) => {
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null) {
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
    if (isDispatchingCardId !== null || updatingDispatchCardId !== null || capturingDispatchResultCardId !== null || deletingCardId !== null) {
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
      setChaosText("");
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
      if (windowModeRef.current !== "mini") {
        setWindowSize("mini");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [historyOpen]);

  return (
    <main className={`app-shell app-shell-${windowMode} ${needsMiniBubbleWidth ? "app-shell-mini-bubble" : ""}`}>
      {!isMini ? (
        <HistoryDrawer
          cards={history}
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          dispatchingCardId={isDispatchingCardId}
          deletingCardId={deletingCardId}
          updatingDispatchCardId={updatingDispatchCardId}
          capturingDispatchResultCardId={capturingDispatchResultCardId}
          claudeDispatchFeedback={claudeDispatchFeedback}
          onDeleteCard={deleteCard}
          onDispatchClaudeCode={dispatchClaudeCode}
          onUpdateClaudeDispatchStatus={updateClaudeDispatchStatus}
          onCaptureClaudeDispatchResult={captureClaudeDispatchResult}
          onSelectCard={(card) => {
            setActiveCard(card);
            setHistoryOpen(false);
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
          onChaosTextChange={setChaosText}
          isNestSubmitting={isNestSubmitting}
          onSubmitChaosReset={submitChaosReset}
          chaosText={chaosText}
          petHourlyBudget={status?.pet.hourlyBudget ?? 3}
          petNote={petNote}
          petShownThisHour={status?.pet.shownThisHour ?? 0}
          bubbleCard={activeCard}
          showBubble={showBubble}
          spritesheetUrl={spritesheetUrl}
          isAsync={isAsync}
          hasError={hasError}
          eventVersion={eventVersion}
          petdexRuntimeState={petdexRuntimeState}
          petdexBubble={petdexBubble}
          onCloseBubble={() => setActiveCard(null)}
          onChangePetBudget={changePetBudget}
          onSetWindowSize={setWindowSize}
          windowMode={windowMode}
          historyOpen={historyOpen}
          activeCardTitle={pendingCard?.title ?? activeCard?.title ?? null}
          hasPendingCard={pendingCard !== null}
          rememberedThread={rememberedThread}
          rememberedThreadCard={rememberedThreadCard}
          activeThreadBundle={activeThreadBundle}
          dispatchingCardId={isDispatchingCardId}
          updatingDispatchCardId={updatingDispatchCardId}
          capturingDispatchResultCardId={capturingDispatchResultCardId}
          onResurfaceRememberedThread={resurfaceRememberedThread}
          recentCards={recentCards}
          onSelectRecentCard={selectRecentCard}
          onDispatchClaudeThread={dispatchClaudeThread}
          onUpdateClaudeDispatchStatus={updateClaudeDispatchStatus}
          onCaptureClaudeDispatchResult={captureClaudeDispatchResult}
          clipboardOffer={clipboardOffer}
          onAcceptClipboardOffer={acceptClipboardOffer}
          onDismissClipboardOffer={dismissClipboardOffer}
        />
      </section>
    </main>
  );
}
