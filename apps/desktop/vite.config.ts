import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({ base: "./", plugins: [react(), tailwindcss()], resolve: { alias: { "@": resolve(__dirname, "src") } }, build: { outDir: "dist", emptyOutDir: false, rollupOptions: { input: resolve(__dirname, "src/renderer-shadcn.html") } } });
