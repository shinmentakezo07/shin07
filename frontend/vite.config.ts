import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const backendTarget = process.env.FCC_ADMIN_PROXY || "http://127.0.0.1:8082"

// The FastAPI admin app serves /admin and /admin/assets/{filename} from
// src/free_claude_code/api/admin_static. Our index.html is emitted at the
// outDir root (served as /admin) and scripts/styles/chunks under assets/
// (served as /admin/assets/{filename}).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  base: "/admin/",
  server: {
    port: 5173,
    proxy: {
      "/admin/api": backendTarget,
    },
  },
  build: {
    outDir: "../src/free_claude_code/api/admin_static",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/admin.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (info) => {
          if (info.name?.endsWith(".css")) return "assets/admin.css"
          return "assets/[name]-[hash][extname]"
        },
      },
    },
  },
})