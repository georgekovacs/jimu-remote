import "./style.css";

import { BluetoothManager, type ConnectionStatus } from "./bluetooth/BluetoothManager";
import { DriveController, type Direction } from "./control/drive";
import { attachKeyboardControls } from "./input/keyboard";
import { bindHoldButton } from "./input/holdButton";
import {
  EYE_ANIMATIONS,
  playEyeAnimation,
  setServoPosition,
  setServoPositions,
} from "./protocol/commands";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./config/settings";

/* ── State & services ───────────────────────────────────────────────── */

let settings: Settings = loadSettings();

const ble = new BluetoothManager(() => settings);
const drive = new DriveController(ble, () => settings);

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

/* ── Connection status UI ───────────────────────────────────────────── */

const connectBtn = $<HTMLButtonElement>("#connect-btn");
const statusDot = $("#status-dot");
const statusText = $("#status-text");

const STATUS_UI: Record<ConnectionStatus, { label: string; dot: string; button: string }> = {
  disconnected: { label: "Disconnected", dot: "bg-zinc-500", button: "Connect Robot" },
  pairing: { label: "Pairing…", dot: "bg-amber-400 animate-pulse", button: "Pairing…" },
  connected: { label: "Connected", dot: "bg-emerald-400", button: "Disconnect" },
};

ble.onStatus((status, detail) => {
  const ui = STATUS_UI[status];
  statusDot.className = `size-2 rounded-full ${ui.dot}`;
  statusText.textContent = status === "connected" && detail ? `Connected · ${detail}` : ui.label;
  connectBtn.textContent = ui.button;
  connectBtn.disabled = status === "pairing";
});

connectBtn.addEventListener("click", () => {
  if (ble.status === "connected") {
    drive.stop();
    ble.disconnect();
  } else {
    void ble.connect();
  }
});

if (!BluetoothManager.isSupported) {
  $("#unsupported-banner").classList.remove("hidden");
}

/* ── Packet console ─────────────────────────────────────────────────── */

const logEl = $("#packet-log");
const LOG_LIMIT = 200;

ble.onLog(({ kind, message }) => {
  const line = document.createElement("div");
  const time = new Date().toLocaleTimeString(undefined, { hour12: false });
  line.className =
    kind === "error" ? "text-red-400" : kind === "info" ? "text-zinc-300" : "text-cyan-400/80";
  line.textContent = `${time}  ${kind === "tx" ? "→ " : ""}${message}`;
  logEl.appendChild(line);
  while (logEl.childElementCount > LOG_LIMIT) logEl.firstElementChild?.remove();
  logEl.scrollTop = logEl.scrollHeight;
});

$("#clear-log").addEventListener("click", () => logEl.replaceChildren());

/* ── Drive controls: D-pad + keyboard ───────────────────────────────── */

document.querySelectorAll<HTMLElement>("[data-direction]").forEach((button) => {
  const direction = button.dataset.direction as Direction;
  bindHoldButton(button, {
    onPress: () => drive.drive(direction),
    onRelease: () => drive.stop(),
  });
});

bindHoldButton($("#stop-btn"), {
  onPress: () => drive.stop(),
  onRelease: () => {},
});

attachKeyboardControls({
  onDrive: (direction) => drive.drive(direction),
  onStop: () => drive.stop(),
});

const driveSpeedInput = $<HTMLInputElement>("#drive-speed");
const driveSpeedValue = $<HTMLOutputElement>("#drive-speed-value");

function syncDriveSpeed(): void {
  driveSpeedInput.value = String(settings.driveSpeed);
  driveSpeedValue.value = String(settings.driveSpeed);
}
driveSpeedInput.addEventListener("input", () => {
  settings.driveSpeed = Number(driveSpeedInput.value);
  driveSpeedValue.value = driveSpeedInput.value;
  saveSettings(settings);
});

/* ── Servo test sliders ─────────────────────────────────────────────── */

const servoList = $("#servo-list");

function renderServoSliders(): void {
  servoList.replaceChildren();
  for (let id = 1; id <= settings.servoCount; id++) {
    const row = document.createElement("label");
    row.className = "block";
    row.innerHTML = `
      <span class="flex items-baseline justify-between text-xs text-zinc-400">
        Servo ${id} <output class="font-mono text-cyan-400">0°</output>
      </span>
      <input type="range" min="-118" max="118" step="1" value="0" class="slider mt-1" />
    `;
    const slider = row.querySelector("input")!;
    const output = row.querySelector("output")!;
    slider.addEventListener("input", () => {
      const angle = Number(slider.value);
      output.value = `${angle}°`;
      if (ble.status !== "connected") return;
      // Coalesced per servo: dragging streams the latest angle only.
      ble.send(setServoPosition(id, angle, settings.servoSpeedFactor), {
        coalesceKey: `servo-${id}`,
      });
    });
    servoList.appendChild(row);
  }
}

$("#center-servos").addEventListener("click", () => {
  servoList.querySelectorAll("input").forEach((slider) => {
    slider.value = "0";
    slider.closest("label")!.querySelector("output")!.value = "0°";
  });
  if (ble.status !== "connected") return;
  const targets = Array.from({ length: settings.servoCount }, (_, i) => ({
    id: i + 1,
    angle: 0,
  }));
  ble.send(setServoPositions(targets, settings.servoSpeedFactor));
});

/* ── LED eyes ───────────────────────────────────────────────────────── */

const eyeColor = $<HTMLInputElement>("#eye-color");
const eyeGrid = $("#eye-animations");

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.replace("#", ""), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

for (const { index, label } of EYE_ANIMATIONS) {
  const button = document.createElement("button");
  button.className = "btn-ghost !py-2 text-sm";
  button.textContent = label;
  button.addEventListener("click", () => {
    if (ble.status !== "connected") return;
    ble.send(playEyeAnimation(index, hexToRgb(eyeColor.value)));
  });
  eyeGrid.appendChild(button);
}

/* ── Settings panel ─────────────────────────────────────────────────── */

type SettingsField = {
  key: keyof Settings;
  input: HTMLInputElement;
  kind: "string" | "number" | "boolean";
};

const settingsFields: SettingsField[] = (
  [
    ["namePrefix", "string"],
    ["exactName", "string"],
    ["serviceUuid", "string"],
    ["characteristicUuid", "string"],
    ["leftWheelId", "number"],
    ["rightWheelId", "number"],
    ["servoCount", "number"],
    ["invertRightWheel", "boolean"],
  ] as const
).map(([key, kind]) => ({ key, kind, input: $<HTMLInputElement>(`#set-${key}`) }));

function syncSettingsForm(): void {
  for (const { key, input, kind } of settingsFields) {
    if (kind === "boolean") input.checked = settings[key] as boolean;
    else input.value = String(settings[key]);
  }
}

for (const field of settingsFields) {
  field.input.addEventListener("change", () => {
    const { key, input, kind } = field;
    const target = settings as Record<keyof Settings, unknown>;
    if (kind === "boolean") target[key] = input.checked;
    else if (kind === "number") target[key] = Number(input.value) || 0;
    else target[key] = input.value.trim();
    saveSettings(settings);
    if (key === "servoCount") renderServoSliders();
  });
}

$("#reset-settings").addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  saveSettings(settings);
  syncSettingsForm();
  syncDriveSpeed();
  renderServoSliders();
});

/* ── Boot ───────────────────────────────────────────────────────────── */

syncSettingsForm();
syncDriveSpeed();
renderServoSliders();
