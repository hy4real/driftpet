import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPACT_WINDOW_HEIGHT,
  COMPACT_WINDOW_WIDTH,
  EDGE_GAP,
  EXPANDED_WINDOW_HEIGHT,
  EXPANDED_WINDOW_WIDTH,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  calculateMovedBounds,
  calculateResizedBounds,
  clampBoundsToDisplay,
  getDefaultWindowStateForWorkArea,
} from "./window-state.ts";

const workArea = {
  x: 0,
  y: 0,
  width: 1440,
  height: 900,
};

const displayBounds = {
  x: 0,
  y: 0,
  width: 1440,
  height: 932,
};

test("getDefaultWindowStateForWorkArea anchors the first launch to the lower-right corner", () => {
  const state = getDefaultWindowStateForWorkArea(workArea);

  assert.deepEqual(state, {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: workArea.width - WINDOW_WIDTH - EDGE_GAP,
    y: workArea.height - WINDOW_HEIGHT - EDGE_GAP,
  });
});

test("expanded workbench defaults to the preferred compact desktop size", () => {
  assert.deepEqual(
    {
      width: EXPANDED_WINDOW_WIDTH,
      height: EXPANDED_WINDOW_HEIGHT,
    },
    {
      width: 582,
      height: 438,
    }
  );
});

test("compact thread view defaults to the wider reading layout", () => {
  assert.deepEqual(
    {
      width: COMPACT_WINDOW_WIDTH,
      height: COMPACT_WINDOW_HEIGHT,
    },
    {
      width: 640,
      height: 612,
    }
  );
});

test("calculateResizedBounds preserves the current center instead of snapping back to the corner", () => {
  const draggedBounds = {
    x: 280,
    y: 190,
    width: 224,
    height: 220,
  };

  const next = calculateResizedBounds(draggedBounds, { width: 420, height: 560 }, workArea);

  assert.deepEqual(next, {
    x: 182,
    y: 20,
    width: 420,
    height: 560,
  });
});

test("calculateResizedBounds clamps oversized or off-screen bounds back into the visible work area", () => {
  const next = calculateResizedBounds(
    {
      x: 1300,
      y: 760,
      width: 224,
      height: 220,
    },
    {
      width: 520,
      height: 760,
    },
    workArea
  );

  assert.deepEqual(next, {
    x: 920,
    y: 140,
    width: 520,
    height: 760,
  });
});

test("clampBoundsToDisplay keeps manual positions inside the target display", () => {
  const clamped = clampBoundsToDisplay(
    {
      x: -120,
      y: -80,
      width: 2000,
      height: 40,
    },
    workArea
  );

  assert.deepEqual(clamped, {
    x: 0,
    y: 0,
    width: 1440,
    height: 156,
  });
});

test("calculateMovedBounds translates the current window while keeping it inside the work area", () => {
  const moved = calculateMovedBounds(
    {
      x: 300,
      y: 220,
      width: 224,
      height: 220,
    },
    {
      x: 180,
      y: -90,
    },
    displayBounds
  );

  assert.deepEqual(moved, {
    x: 480,
    y: 130,
    width: 224,
    height: 220,
  });
});

test("calculateMovedBounds clamps drag movement that would push the pet off-screen", () => {
  const moved = calculateMovedBounds(
    {
      x: 1300,
      y: 820,
      width: 224,
      height: 220,
    },
    {
      x: 300,
      y: 120,
    },
    displayBounds
  );

  assert.deepEqual(moved, {
    x: 1216,
    y: 712,
    width: 224,
    height: 220,
  });
});
