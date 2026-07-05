# Jimu Remote 🤖

A minimalist single-page Web Bluetooth remote controller for UBTECH Jimu
robot kits — built for kids stuck with broken legacy apps.

**Live app: <https://georgekovacs.github.io/jimu-remote/>** — open it in
Chrome/Edge (desktop or Android) or Bluefy (iOS) and press *Connect Robot*.
Every push to `main` redeploys automatically via GitHub Actions.

## Quick start

```sh
npm install
npm run dev      # open http://localhost:5173 in Chrome/Edge
```

Web Bluetooth requires a **secure context**: `http://localhost` works for
development; anything else must be served over **HTTPS** (GitHub Pages,
Netlify, etc. all work).

| Platform          | Browser                                   |
| ----------------- | ----------------------------------------- |
| Desktop (Mac/Win) | Chrome, Edge                              |
| Android           | Chrome                                    |
| iOS / iPadOS      | [Bluefy](https://apps.apple.com/app/id1492822055) (Safari has no Web Bluetooth) |

## Controls

- **D-pad** — press-and-hold to drive; releasing fires an immediate STOP.
  Uses Pointer Events (zero tap delay on touch devices).
- **Keyboard** — `W A S D` or arrow keys; key release = STOP. Auto-repeat
  is suppressed so holding a key can't flood the BLE buffer.
- **Servo test** — sliders for each articulation servo (−118°…+118°).
- **LED eyes** — colour picker + pre-made animation buttons.

## Protocol notes

Packets follow the reverse-engineered node-jimu / UBTECH frame:

```
FB BF <LEN> <CMD> <payload…> <CHECK> ED
LEN   = payload length + 4
CHECK = (LEN + CMD + Σpayload) & 0xFF
```

Framing lives in [`src/protocol/framing.ts`](src/protocol/framing.ts);
command bytes and payload layouts in
[`src/protocol/commands.ts`](src/protocol/commands.ts).

> ⚠️ UBTECH shipped several firmware revisions and the protocol is
> reverse-engineered, not documented. If your kit ignores a command,
> tweak the `CMD` constants / payload layouts in `commands.ts` — every
> transmitted packet is echoed as hex in the on-screen **packet console**
> so you can compare against traffic sniffed from the official app
> (Android `btsnoop_hci.log` or Wireshark + a BLE sniffer).

The GATT **service/characteristic UUIDs, wheel servo IDs and servo count**
are editable in the in-app Settings panel (persisted to localStorage) —
defaults are the reverse-engineered UBTECH standard `0000ffe0` /
`0000ffe1`.

## Safety design

- STOP packets are **urgent**: they jump the write queue and discard any
  stale queued motion packets.
- High-frequency inputs (held keys, slider drags) **coalesce** in the
  queue — only the newest packet per wheel/servo is transmitted.
- Losing tab focus or visibility mid-drive fires a STOP automatically.
