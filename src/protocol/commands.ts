/**
 * High-level command builders for Jimu servos, wheels and LED eyes.
 *
 * ⚠️  Command IDs and payload layouts below follow the reverse-engineered
 * node-jimu architecture, but UBTECH shipped several firmware revisions.
 * If your kit ignores a command, this file is the single place to tweak:
 * every command byte is a named constant and every packet the app sends is
 * echoed as hex in the on-screen packet console so you can compare against
 * sniffed traffic from the official app.
 */

import { buildPacket, toByte } from "./framing";

/** Protocol command bytes (single source of truth — adjust per kit here). */
export const CMD = {
  /** Set a servo to an absolute angle (articulation joints). */
  SERVO_POSITION: 0x08,
  /** Continuous-rotation mode: spin a servo/wheel at a speed. */
  SERVO_ROTATE: 0x09,
  /** Emergency stop for all servos/motors. */
  STOP_ALL: 0x0c,
  /** LED eye matrix: colour + pre-made animation index. */
  EYE_ANIMATION: 0x79,
} as const;

/** Rotation direction byte for SERVO_ROTATE. */
export const ROTATE = {
  STOP: 0x00,
  CLOCKWISE: 0x01,
  COUNTER_CLOCKWISE: 0x02,
} as const;

/**
 * Jimu articulation servos travel −118°…+118°. On the wire the angle is
 * sent as an unsigned byte offset by 120 (so 0x02…0xEE, 0x78 = centred).
 */
export function angleToWire(angleDegrees: number): number {
  const clamped = Math.max(-118, Math.min(118, angleDegrees));
  return toByte(clamped + 120);
}

/**
 * STOP — immediately halt every wheel motor and servo.
 * Sent with an empty payload; the firmware treats it as a global halt.
 */
export function stopAll(): Uint8Array<ArrayBuffer> {
  return buildPacket(CMD.STOP_ALL);
}

/**
 * SET SPEED (continuous rotation) for one wheel servo.
 *
 * Payload: [ servoId, direction, speed ]
 *   servoId   1-based bus ID of the wheel servo
 *   direction ROTATE.CLOCKWISE / COUNTER_CLOCKWISE / STOP
 *   speed     0–255 (magnitude)
 *
 * `speed` may be signed: negative values flip the direction, 0 stops.
 */
export function setWheelSpeed(servoId: number, signedSpeed: number): Uint8Array<ArrayBuffer> {
  const magnitude = toByte(Math.abs(signedSpeed));
  const direction =
    magnitude === 0
      ? ROTATE.STOP
      : signedSpeed > 0
        ? ROTATE.CLOCKWISE
        : ROTATE.COUNTER_CLOCKWISE;
  return buildPacket(CMD.SERVO_ROTATE, [toByte(servoId), direction, magnitude]);
}

/** Convenience: stop a single wheel without halting the whole robot. */
export function stopWheel(servoId: number): Uint8Array<ArrayBuffer> {
  return setWheelSpeed(servoId, 0);
}

/**
 * SET POSITION (servo angle mode) for one or more articulation servos.
 *
 * Payload: [ count, id₁, angle₁, …, idₙ, angleₙ, speedFactor ]
 *   count       number of (id, angle) pairs that follow
 *   idᵢ         1-based servo bus ID
 *   angleᵢ      wire-encoded angle (see angleToWire)
 *   speedFactor 1 (slow) … 255 (fast) sweep speed
 */
export function setServoPositions(
  targets: ReadonlyArray<{ id: number; angle: number }>,
  speedFactor = 128,
): Uint8Array<ArrayBuffer> {
  const payload: number[] = [targets.length];
  for (const { id, angle } of targets) {
    payload.push(toByte(id), angleToWire(angle));
  }
  payload.push(toByte(Math.max(1, speedFactor)));
  return buildPacket(CMD.SERVO_POSITION, payload);
}

/** Single-servo convenience wrapper around setServoPositions. */
export function setServoPosition(id: number, angle: number, speedFactor = 128): Uint8Array<ArrayBuffer> {
  return setServoPositions([{ id, angle }], speedFactor);
}

/** Pre-made eye animations exposed in the UI. Indexes follow the official app order. */
export const EYE_ANIMATIONS = [
  { index: 0x00, label: "Blink" },
  { index: 0x01, label: "Shy" },
  { index: 0x02, label: "Tears" },
  { index: 0x03, label: "Flash" },
  { index: 0x04, label: "Sunglasses" },
  { index: 0x05, label: "Dizzy" },
  { index: 0x06, label: "Happy" },
  { index: 0x07, label: "Breathe" },
] as const;

/**
 * EYE ANIMATION — trigger a pre-made LED eye matrix animation.
 *
 * Payload: [ eyeMask, animationIndex, r, g, b, repeatCount ]
 *   eyeMask        bitmask of eye components on the bus (0x01 = eye #1,
 *                  0x03 = eyes #1 and #2, …)
 *   animationIndex entry from EYE_ANIMATIONS
 *   r / g / b      0–255 colour applied to the animation
 *   repeatCount    number of loops (0 = play once)
 */
export function playEyeAnimation(
  animationIndex: number,
  rgb: { r: number; g: number; b: number },
  { eyeMask = 0x01, repeat = 1 } = {},
): Uint8Array<ArrayBuffer> {
  return buildPacket(CMD.EYE_ANIMATION, [
    toByte(eyeMask),
    toByte(animationIndex),
    toByte(rgb.r),
    toByte(rgb.g),
    toByte(rgb.b),
    toByte(repeat),
  ]);
}
