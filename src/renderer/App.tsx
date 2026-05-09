import { useCallback, useEffect, useRef, useState } from "react";
import type { CardRecord } from "../main/types/card";
import type { ClipboardOffer } from "../main/clipboard/watcher";
import type { AppStatus } from "../main/types/status";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PetShell } from "./components/PetShell";
import bobaSpritesheet from "./assets/boba-spritesheet.webp";

type WindowMode = "mini" | "compact" | "expanded";

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
  const [isNestSubmitting, setIsNestSubmitting] = useState(false);
  const [isAsync, setIsAsync] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [eventVersion, setEventVersion] = useState(0);
  const [clipboardOffer, setClipboardOffer] = useState<ClipboardOffer | null>(null);
  const petNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardOfferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniBubbleResizeActiveRef = useRef(false);
  const windowModeRef = useRef<WindowMode>("mini");
  const rememberedThread = status?.pet.rememberedThread ?? null;
  const isMini = windowMode === "mini";
  const showBubble = windowMode === "compact";
  const showMiniOffer = isMini && pendingCard === null && clipboardOffer !== null;
  const showMiniClickBubble = isMini && !showMiniOffer && petNote !== null;
  const needsMiniBubbleWidth = showMiniClickBubble || showMiniOffer;

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
      unsubscribeClipboard();
      if (petNoteTimerRef.current !== null) {
        clearTimeout(petNoteTimerRef.current);
      }
      if (clipboardOfferTimerRef.current !== null) {
        clearTimeout(clipboardOfferTimerRef.current);
      }
    };
  }, []);

  // Auto-dismiss a clipboard offer after 12s so the bubble doesn't camp the pet.
  useEffect(() => {
    if (clipboardOffer === null) {
      return;
    }
    if (clipboardOfferTimerRef.current !== null) {
      clearTimeout(clipboardOfferTimerRef.current);
    }
    clipboardOfferTimerRef.current = setTimeout(() => {
      setClipboardOffer(null);
      clipboardOfferTimerRef.current = null;
    }, 12_000);
    return () => {
      if (clipboardOfferTimerRef.current !== null) {
        clearTimeout(clipboardOfferTimerRef.current);
        clipboardOfferTimerRef.current = null;
      }
    };
  }, [clipboardOffer]);

  const showPetNote = useCallback((note: string, duration = 4200) => {
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
    if (clipboardOfferTimerRef.current !== null) {
      clearTimeout(clipboardOfferTimerRef.current);
      clipboardOfferTimerRef.current = null;
    }
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
      return;
    }
    const cards = await window.driftpet.listRecentCards();
    setHistory(cards);
    const refetched = cards.find((card) => card.id === rememberedThread.cardId) ?? null;
    if (refetched !== null) {
      setActiveCard(refetched);
      return;
    }
    showPetNote("这张线我还守着，但卡片要去历史里翻一翻。", 4200);
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

  const setWindowSize = async (windowSize: WindowMode) => {
    if (windowSize === "mini") {
      setHistoryOpen(false);
      clearPetNote();
    }
    if (windowSize !== "mini") {
      revealPendingCard();
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
          onCloseBubble={() => setActiveCard(null)}
          onChangePetBudget={changePetBudget}
          onSetWindowSize={setWindowSize}
          windowMode={windowMode}
          historyOpen={historyOpen}
          activeCardTitle={pendingCard?.title ?? activeCard?.title ?? null}
          hasPendingCard={pendingCard !== null}
          rememberedThread={rememberedThread}
          onResurfaceRememberedThread={resurfaceRememberedThread}
          clipboardOffer={showMiniOffer ? clipboardOffer : null}
          onAcceptClipboardOffer={acceptClipboardOffer}
          onDismissClipboardOffer={dismissClipboardOffer}
        />
      </section>
    </main>
  );
}
