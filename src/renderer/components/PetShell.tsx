import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { CardRecord } from "../../main/types/card";
import type { ClaudeDispatchUserStatus } from "../../main/types/claude";
import type { ClipboardOffer } from "../../main/clipboard/watcher";
import type { RememberedThread } from "../../main/types/status";
import type { ThreadBundle } from "../../main/types/thread";
import { PetAvatar } from "./PetAvatar";
import { PetBubble } from "./PetBubble";
import { PetControls } from "./PetControls";
import { PetPresence } from "./PetPresence";
import { PetWorkbench } from "./PetWorkbench";
import { ResumeThreadCard } from "./ResumeThreadCard";
import {
  clampGuardedThreadLabel,
  formatGuardedThreadActionLabel,
  getGuardedThreadAgeState,
  getGuardedThreadExpiresWhen,
  getGuardedThreadNextMove,
  getGuardedThreadTitle,
  guardedThreadVerbByAge,
} from "../guarded-thread";
import {
  getPetUiState,
  moodLabelByState,
  petExpressionByState,
  resolveExpression,
  statusLabelByState,
  type ExpressionTrigger,
  type PetExpression
} from "../pet-ui-state";
import { usePetDrag } from "../use-pet-drag";

type PetdexRuntimeState = {
  expression: PetExpression;
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

type PetShellProps = {
  windowMode: "mini" | "compact" | "expanded";
  historyOpen: boolean;
  chaosText: string;
  petHourlyBudget: number;
  petShownThisHour: number;
  isNestSubmitting: boolean;
  petNote: string | null;
  bubbleCard: CardRecord | null;
  showBubble: boolean;
  spritesheetUrl: string;
  isAsync: boolean;
  hasError: boolean;
  eventVersion: number;
  petdexRuntimeState: PetdexRuntimeState | null;
  petdexBubble: PetdexRuntimeBubble | null;
  onCloseBubble: () => void;
  onChaosTextChange: (value: string) => void;
  onSubmitChaosReset: () => void;
  onChangePetBudget: (delta: number) => void;
  onToggleHistory: () => void;
  onCompanionNote: (note: string, duration?: number) => void;
  onPoke: () => void;
  onSetWindowSize: (windowSize: "mini" | "compact" | "expanded") => void;
  activeCardTitle: string | null;
  hasPendingCard: boolean;
  rememberedThread: RememberedThread | null;
  rememberedThreadCard: CardRecord | null;
  activeThreadBundle: ThreadBundle | null;
  dispatchingCardId: number | null;
  updatingDispatchCardId: number | null;
  capturingDispatchResultCardId: number | null;
  onResurfaceRememberedThread: () => void;
  recentCards: CardRecord[];
  onSelectRecentCard: (card: CardRecord) => void;
  onDispatchClaudeThread: (card: CardRecord) => void;
  onUpdateClaudeDispatchStatus: (card: CardRecord, status: ClaudeDispatchUserStatus) => void;
  onCaptureClaudeDispatchResult: (card: CardRecord, resultSummary: string) => void;
  clipboardOffer: ClipboardOffer | null;
  onAcceptClipboardOffer: () => void;
  onDismissClipboardOffer: () => void;
  onReleaseRememberedThread: (card: CardRecord) => void;
};

export function PetShell({
  windowMode,
  historyOpen,
  chaosText,
  petHourlyBudget,
  petShownThisHour,
  isNestSubmitting,
  petNote,
  bubbleCard,
  showBubble,
  spritesheetUrl,
  isAsync,
  hasError,
  eventVersion,
  petdexRuntimeState,
  petdexBubble,
  onCloseBubble,
  onChaosTextChange,
  onSubmitChaosReset,
  onChangePetBudget,
  onToggleHistory,
  onCompanionNote,
  onPoke,
  onSetWindowSize,
  activeCardTitle,
  hasPendingCard,
  rememberedThread,
  rememberedThreadCard,
  activeThreadBundle,
  dispatchingCardId,
  updatingDispatchCardId,
  capturingDispatchResultCardId,
  onResurfaceRememberedThread,
  recentCards,
  onSelectRecentCard,
  onDispatchClaudeThread,
  onUpdateClaudeDispatchStatus,
  onCaptureClaudeDispatchResult,
  clipboardOffer,
  onAcceptClipboardOffer,
  onDismissClipboardOffer,
  onReleaseRememberedThread
}: PetShellProps) {
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reaction, setReaction] = useState<"idle" | "peek" | "nudge">("idle");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transientExpression, setTransientExpression] = useState<"review" | null>(null);
  const [clipboardOfferPreview, setClipboardOfferPreview] = useState<ClipboardOffer | null>(null);
  const transientScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [triggers, setTriggers] = useState<ExpressionTrigger[]>([]);
  const [, setTriggerVersion] = useState(0);
  const triggerCleanupRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const triggerIdRef = useRef(0);
  const prevEventVersionRef = useRef(eventVersion);
  const isMini = windowMode === "mini";
  const petdexBubbleText = petdexBubble?.text ?? null;
  const petdexBubbleSource = petdexBubble?.agentSource ?? null;
  const visiblePetNote = petdexBubbleText ?? petNote;
  const [collapsedResumeCardId, setCollapsedResumeCardId] = useState<number | null>(null);
  const resumeCardId = rememberedThreadCard !== null ? rememberedThreadCard.id : null;
  const isResumeCollapsed = resumeCardId !== null && collapsedResumeCardId === resumeCardId;

  const triggerExpression = (expression: PetExpression, durationMs: number) => {
    const id = ++triggerIdRef.current;
    const trigger: ExpressionTrigger = { expression, startedAt: Date.now(), durationMs };
    setTriggers((current) => [...current, trigger]);

    const timer = setTimeout(() => {
      setTriggers((current) => current.filter((t) => t !== trigger));
      triggerCleanupRefs.current.delete(id);
      setTriggerVersion((v) => v + 1);
    }, durationMs);
    triggerCleanupRefs.current.set(id, timer);
  };
  const isExpanded = windowMode === "expanded";

  useEffect(() => {
    if (clipboardOffer !== null) {
      setClipboardOfferPreview(clipboardOffer);
    }
  }, [clipboardOffer]);

  const triggerReaction = (nextReaction: "peek" | "nudge") => {
    if (reactionTimeoutRef.current !== null) {
      clearTimeout(reactionTimeoutRef.current);
    }

    setReaction(nextReaction);
    reactionTimeoutRef.current = setTimeout(() => {
      setReaction("idle");
      reactionTimeoutRef.current = null;
    }, 360);
  };

  const stopReaction = () => {
    if (reactionTimeoutRef.current !== null) {
      clearTimeout(reactionTimeoutRef.current);
      reactionTimeoutRef.current = null;
    }
    setReaction("idle");
  };

  const cancelPendingAvatarClick = () => {
    if (avatarClickTimeoutRef.current !== null) {
      clearTimeout(avatarClickTimeoutRef.current);
      avatarClickTimeoutRef.current = null;
    }
  };

  const handleAvatarClick = () => {
    cancelPendingAvatarClick();
    triggerReaction("nudge");
    avatarClickTimeoutRef.current = setTimeout(() => {
      avatarClickTimeoutRef.current = null;
      onPoke();
    }, 180);
  };

  const handleAvatarContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    cancelPendingAvatarClick();
    triggerReaction("peek");
    onSetWindowSize("expanded");
  };

  const {
    avatarHandlers,
    buttonRef,
    dragging,
    hovered,
    landing,
    runDirection,
    runFast
  } = usePetDrag({
    onClick: handleAvatarClick,
    onDragStart: stopReaction,
    onHoverStart: () => triggerReaction("peek")
  });

  const petUiState = getPetUiState({
    activeCardTitle,
    isExpanded,
    isAsync,
    hasPendingCard,
    petHourlyBudget,
    petShownThisHour,
    dragging,
    hovered
  });
  let baseExpression = petExpressionByState[petUiState];
  if (dragging) {
    baseExpression = "running";
  } else if (reaction === "peek") {
    baseExpression = "waving";
  } else if (reaction === "nudge") {
    baseExpression = "jumping";
  } else if (hasPendingCard && !isMini) {
    baseExpression = "waving";
  } else if (isAsync) {
    baseExpression = "waiting";
  }
  const now = Date.now();
  const petdexExpression =
    petdexRuntimeState !== null &&
    petdexRuntimeState.expression !== "idle" &&
    (
      petdexRuntimeState.durationMs === null ||
      petdexRuntimeState.updatedAt === null ||
      now - petdexRuntimeState.updatedAt < petdexRuntimeState.durationMs
    )
      ? petdexRuntimeState.expression
      : null;
  const petExpression = petdexExpression ?? transientExpression ?? resolveExpression(baseExpression, triggers, now);
  const moodLabel = moodLabelByState[petUiState];
  const statusLabel = statusLabelByState[petUiState];
  const canShowRememberedThread = activeCardTitle === null && rememberedThread !== null;
  const showResumeCard = !isMini && !isExpanded && !showBubble && rememberedThreadCard !== null && !isResumeCollapsed;
  // When the full resume card is on screen, suppress the presence-line memory hint
  // so the same thread does not echo in two places at once.
  const memoryActive = canShowRememberedThread && !showResumeCard;
  const isSleepy = transientExpression === "review" || petUiState === "sleepy";
  const guardedThreadTitle = getGuardedThreadTitle(rememberedThreadCard, rememberedThread);
  const guardedThreadNextMove = getGuardedThreadNextMove(rememberedThreadCard);
  const guardedThreadExpiresWhen = getGuardedThreadExpiresWhen(rememberedThreadCard);
  const guardedThreadAgeState = getGuardedThreadAgeState(rememberedThread?.createdAt ?? null, now);
  const guardedThreadVerb = guardedThreadVerbByAge[guardedThreadAgeState];
  const presenceTitle = memoryActive && guardedThreadTitle !== null
    ? `${guardedThreadVerb}：${clampGuardedThreadLabel(guardedThreadTitle)}`
    : activeCardTitle ?? (isSleepy ? "在桌面上打瞌睡" : "陪你待在桌面上");
  const presenceLabel = memoryActive ? "工作记忆" : moodLabel;
  const presenceActionLabel = memoryActive
    ? formatGuardedThreadActionLabel(guardedThreadAgeState, guardedThreadNextMove, guardedThreadExpiresWhen, 18)
    : "点击接回这条线";
  const miniRememberedTitle = guardedThreadTitle === null
    ? null
    : `${guardedThreadVerb}：${clampGuardedThreadLabel(guardedThreadTitle, 18)}`;
  const miniRememberedNextMove = memoryActive
    ? formatGuardedThreadActionLabel(guardedThreadAgeState, guardedThreadNextMove, guardedThreadExpiresWhen, 18)
    : null;
  const liveStatusLabel = dragging
    ? runDirection === "left"
      ? "往左跑，我跟着你。"
      : runDirection === "right"
        ? "往右跑，换个舒服的位置。"
        : runDirection === "up"
          ? "往上跳，我跟上。"
          : runDirection === "down"
            ? "往下挪，我跟上。"
            : "拖到你顺手的位置，我就趴这儿。"
    : statusLabel;

  useEffect(() => {
    return () => {
      if (reactionTimeoutRef.current !== null) {
        clearTimeout(reactionTimeoutRef.current);
      }
      if (avatarClickTimeoutRef.current !== null) {
        clearTimeout(avatarClickTimeoutRef.current);
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
      if (transientScheduleRef.current !== null) {
        clearTimeout(transientScheduleRef.current);
      }
      if (transientClearRef.current !== null) {
        clearTimeout(transientClearRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isMini || isExpanded || dragging || historyOpen) {
      if (transientScheduleRef.current !== null) {
        clearTimeout(transientScheduleRef.current);
        transientScheduleRef.current = null;
      }
      if (transientClearRef.current !== null) {
        clearTimeout(transientClearRef.current);
        transientClearRef.current = null;
      }
      setTransientExpression(null);
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      const interval = 90_000 + Math.random() * 60_000;
      transientScheduleRef.current = setTimeout(() => {
        if (cancelled) {
          return;
        }

        if (Math.random() < 0.3) {
          setTransientExpression("review");
          const duration = 4_000 + Math.random() * 1_000;
          transientClearRef.current = setTimeout(() => {
            if (cancelled) {
              return;
            }
            setTransientExpression(null);
            transientClearRef.current = null;
            scheduleNext();
          }, duration);
        } else {
          scheduleNext();
        }
      }, interval);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (transientScheduleRef.current !== null) {
        clearTimeout(transientScheduleRef.current);
        transientScheduleRef.current = null;
      }
      if (transientClearRef.current !== null) {
        clearTimeout(transientClearRef.current);
        transientClearRef.current = null;
      }
    };
  }, [dragging, historyOpen, isExpanded, isMini]);

  useEffect(() => {
    const shouldIdleReact = !isMini && !dragging && !historyOpen && !isExpanded;
    if (!shouldIdleReact) {
      return;
    }

    const idleNotes = [
      "我在～",
      "今天也陪你。",
      "别忘了喝水。",
      "我先趴一会儿。"
    ];

    idleTimerRef.current = setTimeout(() => {
      triggerReaction(Math.random() > 0.5 ? "peek" : "nudge");
      if (Math.random() > 0.58) {
        onCompanionNote(idleNotes[Math.floor(Math.random() * idleNotes.length)], 3200);
      }
    }, 9000 + Math.random() * 9000);

    return () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [dragging, historyOpen, isExpanded, isMini, onCompanionNote]);

  // Cleanup trigger timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of triggerCleanupRefs.current.values()) {
        clearTimeout(timer);
      }
      triggerCleanupRefs.current.clear();
    };
  }, []);

  // New card → jump
  useEffect(() => {
    if (eventVersion > prevEventVersionRef.current) {
      triggerExpression("jumping", 1400);
    }
    prevEventVersionRef.current = eventVersion;
  }, [eventVersion]);

  // Error → fail
  useEffect(() => {
    if (hasError) {
      triggerExpression("failed", 4000);
    }
  }, [hasError]);

  // Async → wait
  useEffect(() => {
    if (isAsync) {
      triggerExpression("waiting", 8000);
    }
  }, [isAsync]);

  const handlePoke = () => {
    triggerExpression("jumping", 900);
    triggerReaction("nudge");
    onPoke();
  };

  const openBench = () => {
    triggerExpression("waving", 1200);
    triggerReaction("peek");
    onSetWindowSize("expanded");
  };

  const acceptClipboardOffer = () => {
    if (clipboardOfferPreview === null) {
      return;
    }

    setClipboardOfferPreview(null);
    if (isExpanded) {
      onChaosTextChange(clipboardOfferPreview.text);
      onDismissClipboardOffer();
      return;
    }

    onAcceptClipboardOffer();
  };

  const dismissClipboardOffer = () => {
    if (clipboardOfferPreview === null) {
      return;
    }

    setClipboardOfferPreview(null);
    onDismissClipboardOffer();
  };

  return (
    <section className={`pet-shell pet-shell-${windowMode}`}>
      {!isMini && !isExpanded ? (
        <div className="pet-titlebar">
          <span>driftpet</span>
        </div>
      ) : null}

      {isMini && clipboardOfferPreview === null && visiblePetNote !== null ? (
        <div
          className={`pet-click-bubble ${petdexBubbleText !== null ? "pet-click-bubble-petdex" : ""}`}
          role="status"
        >
          {petdexBubbleText !== null && petdexBubbleSource !== null ? (
            <span className="pet-click-bubble-source">{petdexBubbleSource}</span>
          ) : null}
          {visiblePetNote}
        </div>
      ) : null}

      {isMini && clipboardOfferPreview === null && visiblePetNote === null && miniRememberedTitle !== null ? (
        <button
          className="pet-mini-resume-thread"
          onClick={onResurfaceRememberedThread}
          type="button"
        >
          <span>{miniRememberedNextMove ?? "正在守着的线"}</span>
          <strong>{miniRememberedTitle}</strong>
        </button>
      ) : null}

      {!isExpanded ? (
        <div className={`pet-avatar-shell pet-avatar-shell-${windowMode}`}>
          {showBubble ? (
            <div className="bubble-anchor">
              <PetBubble
                card={bubbleCard}
                note={visiblePetNote}
                onClose={onCloseBubble}
                windowMode={windowMode}
              />
            </div>
          ) : null}

          <PetAvatar
            buttonRef={buttonRef}
            dragging={dragging}
            hovered={hovered}
            landing={landing}
            petExpression={petExpression}
            reaction={reaction}
            runDirection={runDirection}
            runFast={runFast}
            spritesheetUrl={spritesheetUrl}
            windowMode={windowMode}
            onContextMenu={handleAvatarContextMenu}
            {...avatarHandlers}
          />

          {hasPendingCard && !isMini ? (
            <div className={`pet-pending-badge ${isSleepy ? "pet-pending-badge-sleepy" : ""}`} aria-label="有新的工作记忆缓存">
              <span>✦</span>
              新线
            </div>
          ) : null}

          {!isMini ? (
            <PetPresence
              actionLabel={presenceActionLabel}
              label={presenceLabel}
              memoryActive={memoryActive}
              title={presenceTitle}
              onMemoryClick={canShowRememberedThread ? onResurfaceRememberedThread : undefined}
            />
          ) : null}
        </div>
      ) : null}

      {showResumeCard && rememberedThreadCard !== null ? (
        <ResumeThreadCard
          card={rememberedThreadCard}
          onResume={onResurfaceRememberedThread}
          onRelease={() => {
            setCollapsedResumeCardId(rememberedThreadCard.id);
            onReleaseRememberedThread(rememberedThreadCard);
          }}
        />
      ) : null}

      {!isMini ? (
        <div className={`pet-actions pet-actions-${windowMode}`}>
          {isExpanded ? (
            <PetWorkbench
              chaosText={chaosText}
              clipboardOffer={clipboardOfferPreview}
              onChaosTextChange={onChaosTextChange}
              onAcceptClipboardOffer={acceptClipboardOffer}
              onDismissClipboardOffer={dismissClipboardOffer}
              onReturnToPet={() => onSetWindowSize("mini")}
              isSubmitting={isNestSubmitting}
              onSubmitChaosReset={onSubmitChaosReset}
              historyOpen={historyOpen}
              onToggleHistory={onToggleHistory}
              rememberedThread={rememberedThread}
              rememberedThreadCard={rememberedThreadCard}
              activeThreadBundle={activeThreadBundle}
              dispatchingCardId={dispatchingCardId}
              updatingDispatchCardId={updatingDispatchCardId}
              capturingDispatchResultCardId={capturingDispatchResultCardId}
              onResurfaceRememberedThread={onResurfaceRememberedThread}
              recentCards={recentCards}
              onSelectRecentCard={onSelectRecentCard}
              onDispatchClaudeThread={onDispatchClaudeThread}
              onUpdateClaudeDispatchStatus={onUpdateClaudeDispatchStatus}
              onCaptureClaudeDispatchResult={onCaptureClaudeDispatchResult}
            />
          ) : (
            <PetControls
              isExpanded={false}
              onMinimize={() => onSetWindowSize("mini")}
              onOpenBench={openBench}
              onPoke={handlePoke}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
