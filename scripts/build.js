// Build de un solo archivo: bundlea web/src/main.js con esbuild, inyecta CSS + JS
// en web/index.template.html y escribe web/dist/SWGOH_Consola_Yusepi.html.
// Uso: node scripts/build.js [--watch]
import { build, context } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB = resolve(ROOT, "web");
const OUT_DIR = resolve(WEB, "dist");
const OUT_FILE = resolve(OUT_DIR, "SWGOH_Consola_Yusepi.html");
const watch = process.argv.includes("--watch");

const esbuildOpts = {
  entryPoints: [resolve(WEB, "src/main.js")],
  bundle: true,
  format: "iife",
  charset: "utf8",
  write: false,
  logLevel: "info",
};

async function emit() {
  const [result, template, css] = await Promise.all([
    build(esbuildOpts),
    readFile(resolve(WEB, "index.template.html"), "utf8"),
    readFile(resolve(WEB, "src/styles.css"), "utf8"),
  ]);
  const js = result.outputFiles[0].text;
  const html = template
    .replace("<!--INJECT:CSS-->", () => css)
    .replace("<!--INJECT:JS-->", () => js);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, html, "utf8");
  console.log(`✓ ${OUT_FILE} (${(html.length / 1024).toFixed(1)} KB)`);
}

if (watch) {
  // Modo watch: rebuild ante cambios en src/.
  const ctx = await context({ ...esbuildOpts, plugins: [{ name: "reinject", setup(b) { b.onEnd(() => emit().catch(console.error)); } }] });
  await ctx.watch();
  console.log("watch: esperando cambios en web/src/…");
} else {
  await emit();
}
