import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "src");
const dist = path.join(__dirname, "dist");

await Promise.all([
  esbuild.build({
    entryPoints: [path.join(src, "main.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: path.join(dist, "main.js"),
    external: ["electron"],
    format: "cjs",
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: [path.join(src, "preload.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: path.join(dist, "preload.js"),
    external: ["electron"],
    format: "cjs",
    sourcemap: true,
  }),
]);

console.log("esbuild: main.js and preload.js written to dist/");
