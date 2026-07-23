import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2019",
    chunkSizeWarningLimit: 1200, // מאגר הרחובות הוא קובץ גדול במכוון
  },
  server: {
    host: true, // מאפשר בדיקה מהנייד באותה רשת
    port: 5173,
  },
});
