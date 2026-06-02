import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@gamedesign/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 8080,
    host: true,
  },
});
