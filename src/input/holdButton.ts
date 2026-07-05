/**
 * bindHoldButton — press-and-hold semantics for on-screen controls.
 *
 * Pointer Events unify mouse + touch + pen and are supported by mobile
 * Chrome and iOS WebViews (Bluefy et al.), so they are the primary path;
 * a touchstart/touchend fallback covers anything ancient. Crucially we act
 * on *down*, never on click, so there is zero 300 ms tap delay, and every
 * possible "finger went away" event (up, cancel, capture loss) releases —
 * a D-pad that sticks means a robot in the furniture.
 */

export interface HoldHandlers {
  onPress: () => void;
  onRelease: () => void;
}

export function bindHoldButton(el: HTMLElement, handlers: HoldHandlers): void {
  let pressed = false;

  const press = (): void => {
    if (pressed) return;
    pressed = true;
    el.dataset.pressed = "true";
    handlers.onPress();
  };

  const release = (): void => {
    if (!pressed) return;
    pressed = false;
    delete el.dataset.pressed;
    handlers.onRelease();
  };

  if (window.PointerEvent) {
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      // Keep receiving this pointer even if the finger drifts off the
      // button, so the matching pointerup always reaches us.
      el.setPointerCapture(event.pointerId);
      press();
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
  } else {
    // Legacy touch fallback. passive:false lets preventDefault suppress
    // the synthetic delayed click/scroll.
    el.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        press();
      },
      { passive: false },
    );
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("mouseleave", release);
  }

  // Long-press on iOS tries to open the context menu / magnifier.
  el.addEventListener("contextmenu", (event) => event.preventDefault());
}
