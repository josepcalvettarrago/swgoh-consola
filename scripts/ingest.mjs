// Ingesta swgoh.gg -> Firestore. Corre en GitHub Actions (runner datacenter normal, que SÍ
// obtiene 200 de swgoh.gg; el egress de un Cloudflare Worker recibiría el managed challenge).
// Reutiliza el normalizador y el cliente Firestore del Worker (ambos portables a Node).
//
// Uso:
//   node scripts/ingest.mjs            # ingesta real (necesita FIREBASE_SERVICE_ACCOUNT)
//   node scripts/ingest.mjs --dry      # solo fetch + normaliza + imprime (sin escribir)
//
// Env: ALLY_CODE (opcional), FIREBASE_SERVICE_ACCOUNT (JSON del service account, obligatorio salvo --dry).
import { buildCharMap, normalizeRoster, playerMeta } from "../worker/src/normalize.js";
import { setDoc } from "../worker/src/firestore.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

const GG_BASE = "https://swgoh.gg/api";
// ⚠️ Se usa `curl`, NO el fetch de Node: Cloudflare hace fingerprinting TLS (JA3) y bloquea
// con 403 la huella de undici aunque las cabeceras sean de navegador; curl sí pasa (200).
// Los runners de GitHub Actions traen curl preinstalado. (Firestore sí va por fetch: Google
// no aplica este bloqueo.)
const CURL_HEADERS = [
  "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "-H", "Accept: application/json, text/plain, */*",
  "-H", "Accept-Language: es-ES,es;q=0.9",
  "-H", "Referer: https://swgoh.gg/",
];
const ALLY = process.env.ALLY_CODE || "355463284";
const DRY = process.argv.includes("--dry");
const env = { FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ggJSON(path) {
  // -f: falla (exit≠0) en HTTP>=400; -sS: silencioso pero muestra errores.
  const args = ["-fsS", "-m", "40", ...CURL_HEADERS, `${GG_BASE}${path}`];
  let stdout;
  try {
    ({ stdout } = await pexec("curl", args, { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }));
  } catch (e) {
    throw new Error(`swgoh.gg ${path} (curl): ${e.message}`);
  }
  await sleep(1100); // respeta el rate limit ~1 req/seg
  return JSON.parse(stdout);
}
async function write(path, data) {
  if (DRY) { console.log(`  [dry] setDoc ${path}`); return; }
  await setDoc(env, path, data);
  console.log(`  setDoc ${path}`);
}

async function main() {
  if (!DRY && !env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT (usa --dry para probar sin escribir).");
  const now = new Date().toISOString();

  console.log("Fetch /characters/ …");
  const characters = await ggJSON("/characters/");
  const charMap = buildCharMap(characters);
  await write("meta/characters", { map: JSON.stringify(charMap), updatedAt: now });

  console.log(`Fetch /player/${ALLY}/ …`);
  const player = await ggJSON(`/player/${ALLY}/`);
  const rd = normalizeRoster(player, charMap);
  const meta = playerMeta(player);
  const doc = { rd: JSON.stringify(rd), meta: JSON.stringify(meta), updatedAt: now };
  await write(`players/${ALLY}`, doc);
  await write(`snapshots/${ALLY}/history/${now.replace(/[:.]/g, "-")}`, doc);

  if (meta.guildId) {
    try {
      console.log(`Fetch /guild/${meta.guildId}/ …`);
      const g = await ggJSON(`/guild/${meta.guildId}/`);
      await write(`guild/${meta.guildId}`, { data: JSON.stringify(g.data || g), updatedAt: now });
    } catch (e) { console.warn("gremio (no bloquea):", e.message); }
  }

  console.log(`OK · ${rd.R.length} unidades · ${meta.name} · GP ${meta.gp} · arena ${meta.arena} · ${now}`);
}

main().catch(e => { console.error("INGESTA FALLIDA:", e.message); process.exit(1); });
