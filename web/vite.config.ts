import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `pnpm dev:web` runs Vite with hot reload and forwards API calls to `pnpm dev` (wrangler) on its default port.
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
