import { useEffect, useState } from "react";
import type { CardRecord } from "../main/types/card";
import type { AppStatus, PetMode } from "../main/types/status";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PetBubble } from "./components/PetBubble";
import { PetShell } from "./components/PetShell";
import { StatusPanel } from "./components/StatusPanel";

export default function App() {
  const [activeCard, setActiveCard] = useState<CardRecord | null>(null);
  const [history, setHistory] = useState<CardRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [chaosText, setChaosText] = useState("");
  const [status, setStatus] = useState<AppStatus | null>(null);

  useEffect(() => {
    void window.driftpet.listRecentCards().then((cards) => {
      setHistory(cards);
      setActiveCard(cards[0] ?? null);
    });
    void window.driftpet.getStatus().then(setStatus);

    return window.driftpet.onCardCreated((card) => {
      setActiveCard(card);
      setHistory((current) => [card, ...current.filter((entry) => entry.id !== card.id)].slice(0, 20));
      void window.driftpet.getStatus().then(setStatus);
    });
  }, []);

  const showDemoCard = async () => {
    const card = await window.driftpet.showDemo();
    setActiveCard(card);
    const nextStatus = await window.driftpet.getStatus();
    setStatus(nextStatus);
  };

  const submitChaosReset = async () => {
    const nextValue = chaosText.trim();
    if (nextValue.length === 0) {
      return;
    }

    const card = await window.driftpet.ingestChaosReset(nextValue);
    setActiveCard(card);
    setChaosText("");
    const nextStatus = await window.driftpet.getStatus();
    setStatus(nextStatus);
  };

  const refreshStatus = () => {
    void window.driftpet.getStatus().then(setStatus);
  };

  const setPetMode = async (mode: PetMode) => {
    await window.driftpet.setPetMode(mode);
    refreshStatus();
  };

  const changePetBudget = async (delta: number) => {
    if (status === null) {
      return;
    }

    await window.driftpet.setPetHourlyBudget(status.pet.hourlyBudget + delta);
    refreshStatus();
  };

  return (
    <main className="app-shell">
      <HistoryDrawer
        cards={history}
        isOpen={historyOpen}
        onSelectCard={setActiveCard}
      />
      <StatusPanel
        isOpen={statusOpen}
        onRefresh={refreshStatus}
        status={status}
      />
      <section className="pet-stage">
        <PetBubble
          card={activeCard}
          onClose={() => setActiveCard(null)}
        />
        <PetShell
          onToggleHistory={() => {
            setStatusOpen(false);
            setHistoryOpen((open) => !open);
          }}
          onToggleStatus={() => {
            setHistoryOpen(false);
            setStatusOpen((open) => !open);
          }}
          onShowDemo={showDemoCard}
          onChaosTextChange={setChaosText}
          onSubmitChaosReset={submitChaosReset}
          chaosText={chaosText}
          petMode={status?.pet.mode ?? "focus"}
          petHourlyBudget={status?.pet.hourlyBudget ?? 3}
          petShownThisHour={status?.pet.shownThisHour ?? 0}
          onSetPetMode={setPetMode}
          onChangePetBudget={changePetBudget}
          historyOpen={historyOpen}
          statusOpen={statusOpen}
        />
      </section>
    </main>
  );
}
