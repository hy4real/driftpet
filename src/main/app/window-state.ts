export type WindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MINI_WINDOW_WIDTH = 144;
export const MINI_WINDOW_HEIGHT = 156;
export const MINI_BUBBLE_WINDOW_WIDTH = 264;
export const COMPACT_WINDOW_WIDTH = 640;
export const COMPACT_WINDOW_HEIGHT = 612;
export const EXPANDED_WINDOW_WIDTH = 582;
export const EXPANDED_WINDOW_HEIGHT = 438;
export const WINDOW_WIDTH = MINI_WINDOW_WIDTH;
export const WINDOW_HEIGHT = MINI_WINDOW_HEIGHT;
export const MIN_WINDOW_WIDTH = MINI_WINDOW_WIDTH;
export const MIN_WINDOW_HEIGHT = MINI_WINDOW_HEIGHT;
export const EDGE_GAP = 18;

export const clampBoundsToDisplay = (
  state: WindowState,
  workArea: Rectangle
): WindowState => {
  const width = Math.min(Math.max(state.width, MIN_WINDOW_WIDTH), workArea.width);
  const height = Math.min(Math.max(state.height, MIN_WINDOW_HEIGHT), workArea.height);

  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    width,
    height,
    x: Math.min(Math.max(state.x, workArea.x), maxX),
    y: Math.min(Math.max(state.y, workArea.y), maxY),
  };
};

export const getDefaultWindowStateForWorkArea = (workArea: Rectangle): WindowState => {
  return {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round(workArea.x + workArea.width - WINDOW_WIDTH - EDGE_GAP),
    y: Math.round(workArea.y + workArea.height - WINDOW_HEIGHT - EDGE_GAP),
  };
};

export const calculateResizedBounds = (
  currentBounds: WindowState,
  nextSize: Pick<WindowState, "width" | "height">,
  workArea: Rectangle
): WindowState => {
  const currentCenterX = currentBounds.x + currentBounds.width / 2;
  const currentCenterY = currentBounds.y + currentBounds.height / 2;

  return clampBoundsToDisplay(
    {
      width: nextSize.width,
      height: nextSize.height,
      x: Math.round(currentCenterX - nextSize.width / 2),
      y: Math.round(currentCenterY - nextSize.height / 2),
    },
    workArea
  );
};

export const calculateMovedBounds = (
  currentBounds: WindowState,
  delta: Pick<WindowState, "x" | "y">,
  workArea: Rectangle
): WindowState => {
  return clampBoundsToDisplay(
    {
      ...currentBounds,
      x: Math.round(currentBounds.x + delta.x),
      y: Math.round(currentBounds.y + delta.y),
    },
    workArea
  );
};
