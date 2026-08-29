import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// The pure-logic modules under src/lib have no Vue or Wails dependency, so
// they run in plain node — no jsdom, no component mounting.
export default defineConfig({
  resolve: {
    alias: {
      "@bindings": fileURLToPath(new URL("./bindings", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
