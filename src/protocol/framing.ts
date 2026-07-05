/**
 * Low-level packet framing for the UBTECH Jimu BLE protocol.
 *
 * Frame layout (as used by node-jimu and the UBTECH Alpha/Jimu family):
 *
 *   ┌──────┬──────┬─────┬─────┬───────────┬───────┬──────┐
 *   │ 0xFB │ 0xBF │ LEN │ CMD │ PAYLOAD…  │ CHECK │ 0xED │
 *   └──────┴──────┴─────┴─────┴───────────┴───────┴──────┘
 *
 *   LEN   = number of bytes from LEN through the 0xED trailer
 *           (payload.length + 4)
 *   CHECK = (LEN + CMD + sum(PAYLOAD)) & 0xFF
 */

export const HEADER_1 = 0xfb;
export const HEADER_2 = 0xbf;
export const TRAILER = 0xed;

/** Clamp any number into a single unsigned byte. */
export function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value))) & 0xff;
}

export function checksum(len: number, cmd: number, payload: readonly number[]): number {
  const sum = payload.reduce((acc, b) => acc + b, len + cmd);
  return sum & 0xff;
}

/**
 * Wrap a command + payload into a fully framed, checksummed packet ready
 * for `characteristic.writeValue()`.
 */
export function buildPacket(cmd: number, payload: readonly number[] = []): Uint8Array<ArrayBuffer> {
  const bytes = payload.map(toByte);
  const len = bytes.length + 4;
  return new Uint8Array([
    HEADER_1,
    HEADER_2,
    len,
    toByte(cmd),
    ...bytes,
    checksum(len, toByte(cmd), bytes),
    TRAILER,
  ]);
}

/** Pretty hex dump for the on-screen packet console, e.g. "FB BF 06 09 …". */
export function toHex(packet: Uint8Array): string {
  return [...packet].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
