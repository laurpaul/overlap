import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// v27: explicit manual chunks. The previous single 536-KB bundle was
// triggering Vite's chunk-size warning. Splitting into vendor / sim / app
// lets the browser cache React + socket.io between deploys.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",  // listen on all interfaces so LAN peers can reach it
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":    ["react", "react-dom"],
          "vendor-realtime": ["socket.io-client"],
          "vendor-gif":      ["gif.js"],
        },
      },
    },
  },
});
