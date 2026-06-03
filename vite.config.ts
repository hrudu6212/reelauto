import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    cors: true,
    proxy: {
      '/api-proxy/facebook': {
        target: 'https://graph.facebook.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/facebook/, '')
      },
      '/api-proxy/instagram': {
        target: 'https://graph.instagram.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/instagram/, '')
      }
    }
  }
});
