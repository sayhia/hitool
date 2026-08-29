import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wails from "@wailsio/runtime/plugins/vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@bindings": fileURLToPath(new URL("./bindings", import.meta.url)),
    },
  },
  // Some browser-shipped deps (@iarna/toml for YAML⇄TOML) probe Node's
  // `global`; define it to the web global so they load outside Node.
  define: {
    global: "globalThis",
  },
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Icon.vue resolves lucide names at runtime, so the whole icon set
        // ships; keep it (and other deps) out of the app chunk.
        manualChunks(id: string) {
          if (id.includes("lucide-vue-next")) return "vendor-icons";
          if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
          if (id.includes("pdf-lib")) return "vendor-pdflib";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  plugins: [vue(), wails("./bindings")],
});
