/**
 * User-tweakable settings, persisted to localStorage so a kit-specific
 * UUID/servo layout survives reloads. Everything here is editable from the
 * Settings panel in the UI.
 */

export interface Settings {
  /** BLE device name prefix used in the requestDevice filter. */
  namePrefix: string;
  /** Optional exact broadcast name (some controller boxes use a fixed string). */
  exactName: string;
  /** Primary GATT service UUID (reverse-engineered UBTECH default). */
  serviceUuid: string;
  /** Write characteristic UUID. */
  characteristicUuid: string;
  /** Servo bus IDs of the drive wheels. */
  leftWheelId: number;
  rightWheelId: number;
  /**
   * Wheels are mounted mirrored, so "forward" is CW on one side and CCW on
   * the other. When true, the right wheel's speed is negated automatically.
   */
  invertRightWheel: boolean;
  /** Drive speed 0–255 used by the D-pad and keyboard. */
  driveSpeed: number;
  /** Number of articulation servos to expose as test sliders. */
  servoCount: number;
  /** Sweep speed factor for the manual servo sliders (1–255). */
  servoSpeedFactor: number;
}

export const DEFAULT_SETTINGS: Settings = {
  namePrefix: "JIMU",
  exactName: "",
  serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
  characteristicUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
  leftWheelId: 1,
  rightWheelId: 2,
  invertRightWheel: true,
  driveSpeed: 160,
  servoCount: 6,
  servoSpeedFactor: 128,
};

const STORAGE_KEY = "jimu-controller-settings-v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Normalise a UUID the way Web Bluetooth expects: 16-bit shorthands like
 * "ffe0" or "0000ffe1" are expanded to the full 128-bit Bluetooth base UUID.
 */
export function normalizeUuid(input: string): string {
  const value = input.trim().toLowerCase();
  if (/^(0x)?[0-9a-f]{1,8}$/.test(value)) {
    const short = parseInt(value, 16);
    return `${short.toString(16).padStart(8, "0")}-0000-1000-8000-00805f9b34fb`;
  }
  return value;
}
