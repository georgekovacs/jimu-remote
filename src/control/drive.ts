/**
 * DriveController — turns high-level directions into left/right wheel
 * speed packets, and guarantees a hard STOP is always deliverable.
 */

import type { BluetoothManager } from "../bluetooth/BluetoothManager";
import type { Settings } from "../config/settings";
import { setWheelSpeed, stopAll } from "../protocol/commands";

export type Direction = "forward" | "backward" | "left" | "right";

export class DriveController {
  constructor(
    private ble: BluetoothManager,
    private getSettings: () => Settings,
  ) {}

  /** Differential mix: returns signed [left, right] speeds for a direction. */
  private mix(direction: Direction): [number, number] {
    const { driveSpeed } = this.getSettings();
    switch (direction) {
      case "forward":
        return [driveSpeed, driveSpeed];
      case "backward":
        return [-driveSpeed, -driveSpeed];
      case "left":
        return [-driveSpeed, driveSpeed];
      case "right":
        return [driveSpeed, -driveSpeed];
    }
  }

  drive(direction: Direction): void {
    const { leftWheelId, rightWheelId, invertRightWheel } = this.getSettings();
    const [left, right] = this.mix(direction);
    const rightSigned = invertRightWheel ? -right : right;
    // Coalesce per wheel so holding a key streams at most one pending
    // packet per motor instead of flooding the BLE buffer.
    this.ble.send(setWheelSpeed(leftWheelId, left), { coalesceKey: "wheel-left" });
    this.ble.send(setWheelSpeed(rightWheelId, rightSigned), { coalesceKey: "wheel-right" });
  }

  /** Emergency halt: jumps the queue and discards stale motion packets. */
  stop(): void {
    this.ble.send(stopAll(), { urgent: true });
  }
}
