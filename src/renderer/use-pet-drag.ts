import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const DRAG_START_THRESHOLD = 8;
const RUN_DIRECTION_THRESHOLD = 4;
const RUN_DIRECTION_SWITCH_DISTANCE = 28;
const RUN_DIRECTION_AXIS_RATIO = 1.25;
const FAST_RUN_THRESHOLD = 10;

type RunDirection = "center" | "left" | "right" | "up" | "down";

type UsePetDragOptions = {
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDragStart?: () => void;
  onHoverStart?: () => void;
};

const getPointerPosition = (event: ReactPointerEvent<HTMLButtonElement>) => {
  return {
    x: event.screenX,
    y: event.screenY
  };
};

const getRunDirectionFromDelta = (deltaX: number, deltaY: number): RunDirection => {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (Math.max(absX, absY) < RUN_DIRECTION_THRESHOLD) {
    return "center";
  }

  if (absX >= absY * RUN_DIRECTION_AXIS_RATIO) {
    return deltaX < 0 ? "left" : "right";
  }

  if (absY >= absX * RUN_DIRECTION_AXIS_RATIO) {
    return deltaY < 0 ? "up" : "down";
  }

  return "center";
};

const getDirectionDistance = (direction: RunDirection, deltaX: number, deltaY: number): number => {
  if (direction === "left" || direction === "right") {
    return Math.abs(deltaX);
  }

  if (direction === "up" || direction === "down") {
    return Math.abs(deltaY);
  }

  return 0;
};

export function usePetDrag({ onClick, onDragStart, onHoverStart }: UsePetDragOptions) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const landingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef({ x: 0, y: 0 });
  const committedRunDirectionRef = useRef<RunDirection>("center");
  const pendingRunDirectionRef = useRef<RunDirection>("center");
  const pendingRunDistanceRef = useRef(0);
  const dragStateRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragging: false,
    suppressClick: false
  });
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [landing, setLanding] = useState(false);
  const [runDirection, setRunDirection] = useState<RunDirection>("center");
  const [runFast, setRunFast] = useState(false);

  const flushPendingWindowMove = () => {
    const { x, y } = pendingMoveRef.current;
    pendingMoveRef.current = { x: 0, y: 0 };
    if (moveFrameRef.current !== null) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }

    if (x !== 0 || y !== 0) {
      window.driftpet.moveWindowBy(x, y);
    }
  };

  const scheduleWindowMove = (deltaX: number, deltaY: number) => {
    pendingMoveRef.current.x += deltaX;
    pendingMoveRef.current.y += deltaY;

    if (moveFrameRef.current !== null) {
      return;
    }

    moveFrameRef.current = requestAnimationFrame(() => {
      flushPendingWindowMove();
    });
  };

  const triggerLanding = () => {
    if (landingTimeoutRef.current !== null) {
      clearTimeout(landingTimeoutRef.current);
    }

    setLanding(true);
    landingTimeoutRef.current = setTimeout(() => {
      setLanding(false);
      landingTimeoutRef.current = null;
    }, 420);
  };

  const finishDrag = () => {
    const { pointerId, dragging: wasDragging, suppressClick } = dragStateRef.current;
    dragStateRef.current = {
      ...dragStateRef.current,
      pointerId: null,
      dragging: false,
      suppressClick
    };

    if (
      buttonRef.current !== null &&
      pointerId !== null &&
      buttonRef.current.hasPointerCapture(pointerId)
    ) {
      buttonRef.current.releasePointerCapture(pointerId);
    }

    if (wasDragging) {
      flushPendingWindowMove();
      setDragging(false);
      committedRunDirectionRef.current = "center";
      pendingRunDirectionRef.current = "center";
      pendingRunDistanceRef.current = 0;
      setRunDirection("center");
      setRunFast(false);
      triggerLanding();
    }
  };

  useEffect(() => {
    return () => {
      if (landingTimeoutRef.current !== null) {
        clearTimeout(landingTimeoutRef.current);
      }
      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = null;
      }
      const { pointerId } = dragStateRef.current;
      if (buttonRef.current !== null && pointerId !== null && buttonRef.current.hasPointerCapture(pointerId)) {
        buttonRef.current.releasePointerCapture(pointerId);
      }
    };
  }, []);

  const handlePointerEnter = () => {
    if (dragStateRef.current.dragging) {
      return;
    }

    setHovered(true);
    onHoverStart?.();
  };

  const handlePointerLeave = () => {
    if (dragStateRef.current.dragging) {
      return;
    }

    setHovered(false);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const pointerPosition = getPointerPosition(event);
    buttonRef.current = event.currentTarget;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: pointerPosition.x,
      startY: pointerPosition.y,
      lastX: pointerPosition.x,
      lastY: pointerPosition.y,
      dragging: false,
      suppressClick: false
    };
    committedRunDirectionRef.current = "center";
    pendingRunDirectionRef.current = "center";
    pendingRunDistanceRef.current = 0;
    setRunDirection("center");
    setRunFast(false);
    setLanding(false);
    setHovered(true);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }

    const pointerPosition = getPointerPosition(event);
    const travelX = pointerPosition.x - dragState.startX;
    const travelY = pointerPosition.y - dragState.startY;
    const deltaX = pointerPosition.x - dragState.lastX;
    const deltaY = pointerPosition.y - dragState.lastY;

    if (!dragState.dragging && Math.hypot(travelX, travelY) >= DRAG_START_THRESHOLD) {
      dragState.dragging = true;
      dragState.suppressClick = true;
      onDragStart?.();
      setDragging(true);
      setHovered(false);
    }

    dragState.lastX = pointerPosition.x;
    dragState.lastY = pointerPosition.y;

    if (!dragState.dragging) {
      return;
    }

    const nextDirection = getRunDirectionFromDelta(deltaX, deltaY);
    if (nextDirection !== "center") {
      const directionDistance = getDirectionDistance(nextDirection, deltaX, deltaY);
      const committedDirection = committedRunDirectionRef.current;

      if (committedDirection === "center" || nextDirection === committedDirection) {
        committedRunDirectionRef.current = nextDirection;
        pendingRunDirectionRef.current = "center";
        pendingRunDistanceRef.current = 0;
        setRunDirection(nextDirection);
      } else {
        if (pendingRunDirectionRef.current === nextDirection) {
          pendingRunDistanceRef.current += directionDistance;
        } else {
          pendingRunDirectionRef.current = nextDirection;
          pendingRunDistanceRef.current = directionDistance;
        }

        if (pendingRunDistanceRef.current >= RUN_DIRECTION_SWITCH_DISTANCE) {
          committedRunDirectionRef.current = nextDirection;
          pendingRunDirectionRef.current = "center";
          pendingRunDistanceRef.current = 0;
          setRunDirection(nextDirection);
        }
      }
    }
    setRunFast(Math.hypot(deltaX, deltaY) >= FAST_RUN_THRESHOLD);

    if (deltaX !== 0 || deltaY !== 0) {
      scheduleWindowMove(deltaX, deltaY);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const wasDragging = dragStateRef.current.dragging;
    finishDrag();
    setHovered(event.currentTarget.matches(":hover"));

    if (wasDragging) {
      setTimeout(() => {
        dragStateRef.current.suppressClick = false;
      }, 0);
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current.suppressClick = false;
    finishDrag();
    setHovered(false);
  };

  const handleLostPointerCapture = () => {
    if (dragStateRef.current.pointerId === null) {
      return;
    }

    finishDrag();
    setTimeout(() => {
      dragStateRef.current.suppressClick = false;
    }, 0);
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.suppressClick) {
      dragStateRef.current.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onClick(event);
  };

  return {
    buttonRef,
    dragging,
    hovered,
    landing,
    runDirection,
    runFast,
    avatarHandlers: {
      onClick: handleClick,
      onLostPointerCapture: handleLostPointerCapture,
      onPointerCancel: handlePointerCancel,
      onPointerDown: handlePointerDown,
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp
    }
  };
}
