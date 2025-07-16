import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  build: {
    target: "es2020",
    outDir: "../electron-app/services/web",
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    proxy: {
      "/socket.io": {
        target: "ws://localhost:3002",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@minecraft-bedrock-minimap/shared": resolve(__dirname, "../shared/src"),
    },
  },
  optimizeDeps: {
    include: ["socket.io-client"],
  },
});