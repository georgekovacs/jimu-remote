/**
 * BluetoothManager — the single owner of the GATT connection.
 *
 * Responsibilities:
 *  - device discovery filtered on the Jimu name prefix / exact name
 *  - connect / graceful disconnect / unexpected-drop detection
 *  - a serialized write queue: Web Bluetooth rejects overlapping
 *    writeValue() calls ("GATT operation already in progress"), and rapid
 *    D-pad/slider input can easily outrun the ~20 ms BLE connection
 *    interval. Writes are chained; per-channel packets (e.g. slider drags)
 *    coalesce so only the latest value is flushed. Stop packets jump the
 *    queue and clear any pending motion packets behind them.
 */

import { toHex } from "../protocol/framing";
import { normalizeUuid, type Settings } from "../config/settings";

export type ConnectionStatus = "disconnected" | "pairing" | "connected";

export interface LogEntry {
  kind: "tx" | "info" | "error";
  message: string;
}

type StatusListener = (status: ConnectionStatus, detail?: string) => void;
type LogListener = (entry: LogEntry) => void;

interface QueuedPacket {
  packet: Uint8Array<ArrayBuffer>;
  /**
   * Packets sharing a coalesceKey overwrite each other while queued —
   * only the newest is actually transmitted (latest-wins).
   */
  coalesceKey?: string;
}

export class BluetoothManager {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private writeWithoutResponse = false;

  private queue: QueuedPacket[] = [];
  private flushing = false;

  private statusListeners = new Set<StatusListener>();
  private logListeners = new Set<LogListener>();
  private _status: ConnectionStatus = "disconnected";

  constructor(private getSettings: () => Settings) {}

  get status(): ConnectionStatus {
    return this._status;
  }

  get deviceName(): string {
    return this.device?.name ?? "";
  }

  static get isSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  onStatus(listener: StatusListener): void {
    this.statusListeners.add(listener);
  }

  onLog(listener: LogListener): void {
    this.logListeners.add(listener);
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this._status = status;
    this.statusListeners.forEach((l) => l(status, detail));
  }

  private log(kind: LogEntry["kind"], message: string): void {
    this.logListeners.forEach((l) => l({ kind, message }));
  }

  async connect(): Promise<void> {
    if (!BluetoothManager.isSupported) {
      this.log(
        "error",
        "Web Bluetooth is unavailable. Use Chrome/Edge on desktop or Android, or the Bluefy browser on iOS — and note it requires HTTPS or localhost.",
      );
      return;
    }
    if (this._status !== "disconnected") return;

    const settings = this.getSettings();
    const serviceUuid = normalizeUuid(settings.serviceUuid);
    const characteristicUuid = normalizeUuid(settings.characteristicUuid);

    const filters: BluetoothLEScanFilter[] = [];
    if (settings.namePrefix) filters.push({ namePrefix: settings.namePrefix });
    if (settings.exactName) filters.push({ name: settings.exactName });
    if (filters.length === 0) filters.push({ namePrefix: "JIMU" });

    this.setStatus("pairing");
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices: [serviceUuid],
      });
      this.device = device;
      device.addEventListener("gattserverdisconnected", this.handleDisconnect);

      this.log("info", `Pairing with "${device.name ?? "unknown"}"…`);
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);

      this.characteristic = characteristic;
      this.writeWithoutResponse = characteristic.properties.writeWithoutResponse;
      this.setStatus("connected", device.name);
      this.log(
        "info",
        `Connected (${this.writeWithoutResponse ? "write-without-response" : "write-with-response"}).`,
      );
    } catch (error) {
      this.teardown();
      const message = error instanceof Error ? error.message : String(error);
      // User dismissing the chooser is not an error worth shouting about.
      if (message.includes("User cancelled")) {
        this.log("info", "Pairing cancelled.");
      } else {
        this.log("error", `Connection failed: ${message}`);
      }
      this.setStatus("disconnected");
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    // gattserverdisconnected will fire and finish the cleanup, but if the
    // device was already gone, make sure state is consistent anyway.
    this.teardown();
    this.setStatus("disconnected");
  }

  private handleDisconnect = (): void => {
    this.log("info", "Device disconnected.");
    this.teardown();
    this.setStatus("disconnected");
  };

  private teardown(): void {
    this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    this.device = null;
    this.characteristic = null;
    this.queue = [];
  }

  /**
   * Queue a packet for transmission.
   *
   * @param coalesceKey packets with the same key replace each other in the
   *        queue (use for high-frequency streams like slider drags)
   * @param urgent      flush ahead of everything and drop queued motion
   *        packets (use for STOP so the robot can never "run away" behind
   *        a backlog of stale drive commands)
   */
  send(packet: Uint8Array<ArrayBuffer>, { coalesceKey, urgent = false }: { coalesceKey?: string; urgent?: boolean } = {}): void {
    if (!this.characteristic) {
      this.log("error", `Not connected — dropped packet ${toHex(packet)}`);
      return;
    }

    if (urgent) {
      this.queue = [{ packet }];
    } else if (coalesceKey) {
      const existing = this.queue.find((q) => q.coalesceKey === coalesceKey);
      if (existing) {
        existing.packet = packet;
      } else {
        this.queue.push({ packet, coalesceKey });
      }
    } else {
      this.queue.push({ packet });
    }

    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0 && this.characteristic) {
        const { packet } = this.queue.shift()!;
        try {
          if (this.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(packet);
          } else {
            await this.characteristic.writeValue(packet);
          }
          this.log("tx", toHex(packet));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.log("error", `Write failed: ${message}`);
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
