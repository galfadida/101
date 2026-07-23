import { defineConfig } from "vite";

export default defineConfig({
  assetsInclude: ["**/*.pdf"],
  build: {
    target: "es2019",
    chunkSizeWarningLimit: 1600, // מאגר הרחובות והטופס הריק גדולים במכוון
  },
  server: {
    host: true, // מאפשר בדיקה מהנייד באותה רשת
    port: 5173,
  },
});
