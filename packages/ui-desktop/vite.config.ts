import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** Icons dir at repo root (data/raw/icons). Served at /icons in dev. */
const iconsDir = path.resolve(__dirname, "../../data/raw/icons");

/** Vite plugin: serve /icons/* from data/raw/icons in dev. */
function serveIconsPlugin() {
  return {
    name: "serve-icons",
    configureServer(server: { middlewares: { use: (req: unknown, res: unknown, next: () => void) => void } }) {
      server.middlewares.use((req: { url?: string; method?: string }, res: { setHeader: (k: string, v: string) => void; end: (b?: Buffer) => void; statusCode: number }, next: () => void) => {
        if (req.method !== "GET" || !req.url?.startsWith("/icons/")) {
          next();
          return;
        }
        const filename = req.url.slice("/icons/".length).replace(/\.\./g, "");
        if (!filename || filename.includes("/")) {
          next();
          return;
        }
        const filePath = path.join(iconsDir, filename);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", "image/png");
        res.end(fs.readFileSync(filePath));
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serveIconsPlugin()],
  root: ".",
  resolve: {
    alias: {
      "@powerlay/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
