import test from "node:test";
import assert from "node:assert/strict";

import { getPetUiState } from "./pet-ui-state.ts";

test("getPetUiState prioritizes pending cards and async work over idle", () => {
  assert.equal(
    getPetUiState({
      activeCardTitle: null,
      isExpanded: false,
      isAsync: false,
      hasPendingCard: true,
      petHourlyBudget: 3,
      petShownThisHour: 0,
      dragging: false,
      hovered: false,
    }),
    "happy"
  );

  assert.equal(
    getPetUiState({
      activeCardTitle: null,
      isExpanded: false,
      isAsync: true,
      hasPendingCard: false,
      petHourlyBudget: 3,
      petShownThisHour: 0,
      dragging: false,
      hovered: false,
    }),
    "thinking"
  );
});

test("getPetUiState reacts to dragging and hover before idle", () => {
  assert.equal(
    getPetUiState({
      activeCardTitle: null,
      isExpanded: false,
      isAsync: false,
      hasPendingCard: false,
      petHourlyBudget: 3,
      petShownThisHour: 0,
      dragging: true,
      hovered: false,
    }),
    "curious"
  );

  assert.equal(
    getPetUiState({
      activeCardTitle: null,
      isExpanded: false,
      isAsync: false,
      hasPendingCard: false,
      petHourlyBudget: 3,
      petShownThisHour: 0,
      dragging: false,
      hovered: true,
    }),
    "curious"
  );
});
