import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the frontend call /api/* during local dev without CORS pain;
      // in production the frontend calls the deployed backend URL directly
      // (see src/lib/api.ts).
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
