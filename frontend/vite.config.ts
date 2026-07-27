import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.png"],
      manifest: {
        id: "/",
        name: "תכנון טיול באמצעות AI — AppMyTrip",
        short_name: "AppMyTrip",
        description: "תכנון טיולים והפיכתם לאפליקציית מובייל באמצעות AI",
        lang: "he",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f9fafb",
        theme_color: "#2563eb",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Include font files so self-hosted @fontsource faces stay available
        // offline with the rest of the app shell.
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy vendors out of the main entry chunk so first paint
        // doesn't download Firebase/Leaflet/React-DOM until they're needed
        // (lazy routes + dynamic imports below still decide *when*).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase")) return "firebase";
          if (id.includes("leaflet") || id.includes("react-leaflet")) return "leaflet";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("@fontsource")) return "fonts";
        },
      },
    },
  },
});
