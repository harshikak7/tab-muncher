// Landing page build (deployed to Vercel). Separate from the Tauri overlay build in vite.config.ts,
// but shares the mascot art + rig from src/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "landing",
  envDir: "..",
  plugins: [react()],
  build: {
    outDir: "../dist-landing",
    emptyOutDir: true,
  },
  server: { port: 5173 },
});
