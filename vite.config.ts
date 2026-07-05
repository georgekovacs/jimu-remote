import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  // Relative asset paths so the built dist/ works when opened directly or
  // hosted under a subpath (e.g. GitHub Pages at /<repo>/). With the
  // default absolute "/assets/…" paths the stylesheet 404s and the page
  // renders completely unstyled.
  base: "./",
  server: {
    // Expose on the LAN so tablets/phones on the same network can reach the
    // dev server. NOTE: Web Bluetooth requires a secure context — plain
    // http://<lan-ip> will NOT expose navigator.bluetooth. Use `vite preview`
    // behind HTTPS, a tunnel (e.g. `npx vite --host` + mkcert), or open
    // http://localhost on the dev machine itself.
    host: true,
  },
});
