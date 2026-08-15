import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Elev",
        short_name: "Elev",
        description: "Plataforma de gestão para assessoria de investimentos",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        // Splash: fundo brand-800 nos DOIS temas (tela 26)
        background_color: "#0E3729",
        theme_color: "#0E3729",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      devOptions: { enabled: true },
      workbox: {
        // sem .svg: a fonte de ícones SVG do Phosphor (3 MB) é fallback legado — o woff2 atende offline
        globPatterns: ["**/*.{js,css,html,woff2,png}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        importScripts: ["push-sw.js"], // handlers de push (tela 25)
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" }, // Worker local (wrangler dev)
  },
});
