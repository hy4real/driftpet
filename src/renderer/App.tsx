import { useCallback, useEffect, useRef, useState } from "react";
import type { CardRecord } from "../main/types/card";
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
  const [rememberedThreadTitle, setRememberedThreadTitle] = useState<string | null>(null);
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
  const petNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniBubbleResizeActiveRef = useRef(false);
  const windowModeRef = useRef<WindowMode>("mini");
  const skipRememberedForNextCardRef = useRef(false);
  const isMini = windowMode === "mini";
  const showBubble = windowMode === "compact";
  const showMiniClickBubble = isMini && petNote !== null;

  useEffect(() => {
    windowModeRef.current = windowMode;
  }, [windowMode]);

  useEffect(() => {
    if (showMiniClickBubble === miniBubbleResizeActiveRef.current) {
      return;
    }

    miniBubbleResizeActiveRef.current = showMiniClickBubble;
    void window.driftpet.setMiniBubbleVisible(showMiniClickBubble);
  }, [showMiniClickBubble]);

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
      setRememberedThreadTitle(cards[0]?.title ?? null);
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
      if (skipRememberedForNextCardRef.current) {
        skipRememberedForNextCardRef.current = false;
      } else {
        setRememberedThreadTitle(card.title);
      }
      setEventVersion((v) => v + 1);
      setHasError(false);
      void window.driftpet.getStatus().then(setStatus);
    });

    return () => {
      unsubscribe();
      unsubscribePet();
      if (petNoteTimerRef.current !== null) {
        clearTimeout(petNoteTimerRef.current);
      }
    };
  }, []);

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
      setRememberedThreadTitle(card.title);
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
    <main className={`app-shell app-shell-${windowMode} ${showMiniClickBubble ? "app-shell-mini-bubble" : ""}`}>
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
          rememberedThreadTitle={rememberedThreadTitle}
        />
      </section>
    </main>
  );
}
