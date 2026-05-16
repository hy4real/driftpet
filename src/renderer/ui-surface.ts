import type { CardRecord } from "../main/types/card";
import type { RememberedThread } from "../main/types/status";

export type WindowMode = "mini" | "compact" | "expanded";

export type PetShellSurface =
  | { kind: "mini_idle"; windowMode: "mini" }
  | { kind: "mini_note"; windowMode: "mini" }
  | { kind: "mini_remembered"; windowMode: "mini" }
  | { kind: "compact_card"; windowMode: "compact"; card: CardRecord }
  | { kind: "compact_remembered"; windowMode: "compact"; card: CardRecord }
  | { kind: "compact_idle"; windowMode: "compact" }
  | { kind: "expanded_workbench"; windowMode: "expanded" };

type ResolvePetShellSurfaceArgs = {
  windowMode: WindowMode;
  activeCard: CardRecord | null;
  rememberedThread: RememberedThread | null;
  rememberedThreadCard: CardRecord | null;
  miniVisibleNote: string | null;
};

export const resolvePetShellSurface = ({
  windowMode,
  activeCard,
  rememberedThread,
  rememberedThreadCard,
  miniVisibleNote,
}: ResolvePetShellSurfaceArgs): PetShellSurface => {
  if (windowMode === "expanded") {
    return { kind: "expanded_workbench", windowMode };
  }

  if (windowMode === "mini") {
    if (miniVisibleNote !== null) {
      return { kind: "mini_note", windowMode };
    }

    if (rememberedThread !== null) {
      return { kind: "mini_remembered", windowMode };
    }

    return { kind: "mini_idle", windowMode };
  }

  if (activeCard !== null) {
    return { kind: "compact_card", windowMode, card: activeCard };
  }

  if (rememberedThreadCard !== null) {
    return { kind: "compact_remembered", windowMode, card: rememberedThreadCard };
  }

  return { kind: "compact_idle", windowMode };
};

export const surfaceNeedsMiniBubbleWidth = (surface: PetShellSurface): boolean =>
  surface.kind === "mini_note" || surface.kind === "mini_remembered";
