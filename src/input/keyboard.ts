/**
 * Keyboard drive system for desktop/laptop use.
 *
 *   W / ↑  forward      S / ↓  backward
 *   A / ←  turn left    D / →  turn right
 *
 * Design notes:
 *  - `event.repeat` keydowns are ignored, so holding a key fires the drive
 *    packet exactly once instead of flooding the BLE buffer at the OS
 *    key-repeat rate.
 *  - A pressed-key stack tracks overlapping presses: tapping D while
 *    holding W turns right, and releasing D resumes forward — releasing
 *    the *last* key always fires an immediate STOP.
 *  - Keys are ignored while an input/textarea/select has focus so the
 *    settings panel stays typable.
 */

import type { Direction } from "../control/drive";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: "forward",
  arrowup: "forward",
  s: "backward",
  arrowdown: "backward",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

export interface DriveHandlers {
  onDrive: (direction: Direction) => void;
  onStop: () => void;
}

export function attachKeyboardControls(handlers: DriveHandlers): () => void {
  /** Most-recently-pressed direction lives at the end of the stack. */
  const stack: Direction[] = [];

  const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable);

  const apply = (): void => {
    const current = stack[stack.length - 1];
    if (current) {
      handlers.onDrive(current);
    } else {
      handlers.onStop();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    const direction = KEY_TO_DIRECTION[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    // Ignore auto-repeat and re-entrant presses of a held key.
    if (event.repeat || stack.includes(direction)) return;
    stack.push(direction);
    apply();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const direction = KEY_TO_DIRECTION[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    const index = stack.indexOf(direction);
    if (index === -1) return;
    stack.splice(index, 1);
    apply(); // no keys left → immediate STOP packet
  };

  // Safety net: if the tab loses focus mid-drive we never see the keyup,
  // so treat blur/hidden as "all keys released" and stop the robot.
  const onBlur = (): void => {
    if (stack.length === 0) return;
    stack.length = 0;
    handlers.onStop();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
  };
}
