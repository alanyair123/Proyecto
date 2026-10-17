import type { Socket } from "socket.io-client";

export type InputMode = "touch" | "keyboard";
export type MoveDirection = "up" | "down" | "left" | "right";

export function detectInputMode(): InputMode {
  if (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0) {
    return "touch";
  }
  return "keyboard";
}

export interface InputController {
  mode: InputMode;
  startTouch(direction: MoveDirection, event: PointerEvent): void;
  stopTouch(pointerId: number): void;
  destroy(): void;
}

const KEY_DIRECTIONS: Record<string, MoveDirection> = {
  w: "up",
  ArrowUp: "up",
  s: "down",
  ArrowDown: "down",
  a: "left",
  ArrowLeft: "left",
  d: "right",
  ArrowRight: "right",
};

export function createInputController(socket: Socket, forceTouch = false): InputController {
  const mode = forceTouch ? "touch" : detectInputMode();
  const heldKeys = new Map<string, ReturnType<typeof setInterval>>();
  const heldPointers = new Map<number, ReturnType<typeof setInterval>>();
  const emitMove = (dir: MoveDirection): void => {
    socket.emit("game:input", { type: "move", dir });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direction = KEY_DIRECTIONS[key];
    if (!direction) return;
    event.preventDefault();
    if (mode !== "keyboard" || heldKeys.has(key)) return;
    emitMove(direction);
    heldKeys.set(key, setInterval(() => emitMove(direction), 100));
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const interval = heldKeys.get(key);
    if (interval) clearInterval(interval);
    heldKeys.delete(key);
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);

  return {
    mode,
    startTouch(direction, event) {
      event.preventDefault();
      if (mode !== "touch" || heldPointers.has(event.pointerId)) return;
      emitMove(direction);
      heldPointers.set(event.pointerId, setInterval(() => emitMove(direction), 100));
    },
    stopTouch(pointerId) {
      const interval = heldPointers.get(pointerId);
      if (interval) clearInterval(interval);
      heldPointers.delete(pointerId);
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      for (const interval of heldKeys.values()) clearInterval(interval);
      for (const interval of heldPointers.values()) clearInterval(interval);
      heldKeys.clear();
      heldPointers.clear();
    },
  };
}
