// Cliente HTTP compartido para swgoh.gg (Fase 5.2). Extraído de ingest.mjs para que la ingesta
// de Yusepi y la de gremio (ingest-guild.mjs) usen EXACTAMENTE el mismo anti-fingerprint.
//
// ⚠️ Se usa `curl`, NO el fetch de Node: Cloudflare hace fingerprinting TLS (JA3) y bloquea con
// 403 la huella de undici aunque las cabeceras sean de navegador. (Firestore sí va por fetch:
// Google no aplica este bloqueo.)
//
// Desde el IP de datacenter de GitHub Actions, `curl` normal también recibe 403; por eso se pasa
// CURL_BIN=curl_chrome116 (curl-impersonate, replica la huella TLS/HTTP2 de Chrome). En ese modo
// NO se añaden cabeceras propias: el wrapper ya envía el juego coherente con Chrome (mezclarlas
// re-dispararía la detección). En local, sin CURL_BIN, se usa `curl` con cabeceras de navegador
// (la IP residencial sí pasa).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

export const GG_BASE = "https://swgoh.gg/api";
const CURL_BIN = process.env.CURL_BIN || "curl";
const IMPERSONATE = CURL_BIN !== "curl";
const CURL_HEADERS = [
  "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "-H", "Accept: application/json, text/plain, */*",
  "-H", "Accept-Language: es-ES,es;q=0.9",
  "-H", "Referer: https://swgoh.gg/",
];

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// GET a swgoh.gg (path relativo a /api). Lanza si el HTTP es >=400. Respeta el rate limit ~1 req/s.
export async function ggJSON(path) {
  // -f: falla (exit≠0) en HTTP>=400; -sS: silencioso pero muestra errores.
  const args = IMPERSONATE
    ? ["-fsS", "-m", "40", "-H", "Referer: https://swgoh.gg/", `${GG_BASE}${path}`]
    : ["-fsS", "-m", "40", ...CURL_HEADERS, `${GG_BASE}${path}`];
  let stdout;
  try {
    ({ stdout } = await pexec(CURL_BIN, args, { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }));
  } catch (e) {
    throw new Error(`swgoh.gg ${path} (${CURL_BIN}): ${e.message}`);
  }
  await sleep(1100); // respeta el rate limit ~1 req/seg
  return JSON.parse(stdout);
}
