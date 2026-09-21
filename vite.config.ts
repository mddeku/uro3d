import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // Relative asset URLs work both on localhost and under /<repo>/ on Pages.
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  test: { include: ["tests/**/*.test.ts"] },
});
