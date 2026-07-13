// Ingesta de gremio: baja el ROSTER (rd) de cada miembro del gremio a players/{ally} (Fase 5.2).
// Corre en LOCAL (IP residencial), igual que ingest.mjs — swgoh.gg bloquea el IP de Actions.
//
// Solo escribe players/{ally} (rd+meta). Mods/naves/snapshots/progreso siguen siendo solo de Yusepi
// (coste/tiempo). Reutiliza normalize.js + firestore.js + el curl anti-fingerprint de gg-fetch.mjs.
//
// Uso:
//   node scripts/ingest-guild.mjs               # ingesta real (necesita FIREBASE_SERVICE_ACCOUNT)
//   node scripts/ingest-guild.mjs --dry         # fetch + normaliza + imprime (sin escribir)
//   node scripts/ingest-guild.mjs --limit 3     # solo los 3 primeros miembros (pruebas)
//   node scripts/ingest-guild.mjs --only 123456 # un solo ally
//
// Env: ALLY_CODE (el admin, se SALTA — ya lo ingesta ingest.mjs), FIREBASE_SERVICE_ACCOUNT.
import { normalizeRoster, playerMeta } from "../worker/src/normalize.js";
import { setDoc, getDoc } from "../worker/src/firestore.js";
import { ggJSON, sleep } from "./gg-fetch.mjs";

// Núcleo PURO de orquestación: todas las dependencias externas (red + Firestore) inyectadas, para
// poder testearlo sin tocar swgoh.gg ni Firestore. Devuelve un resumen { ok, fallidos, saltados }.
// - deps.ggJSON(path)         -> respuesta cruda de swgoh.gg
// - deps.getDoc(env, path)    -> doc de Firestore (o null)
// - deps.setDoc(env, path, d) -> escribe (no se llama en --dry)
// - deps.sleep(ms)            -> rate limit entre fetches (inyectable = instantáneo en tests)
// - deps.log(msg)             -> traza (opcional)
export async function ingestGuild(env, { ggJSON, getDoc, setDoc, sleep = async () => {}, log = () => {} }, opts = {}) {
  const { allyCode = "355463284", dry = false, limit = 0, only = null, now = new Date().toISOString() } = opts;

  // 1) charMap: de meta/characters (ya escrito por la ingesta de Yusepi), no re-fetch de /characters/.
  const metaDoc = await getDoc(env, "meta/characters");
  const charMap = metaDoc && metaDoc.map ? JSON.parse(metaDoc.map) : null;
  if (!charMap) throw new Error("Falta meta/characters — corre antes la ingesta de Yusepi (ingest.mjs).");

  // 2) guildId del doc del admin; luego la lista de miembros del resumen de gremio.
  const adminDoc = await getDoc(env, `players/${allyCode}`);
  const adminMeta = adminDoc && adminDoc.meta ? JSON.parse(adminDoc.meta) : null;
  const guildId = adminMeta && adminMeta.guildId;
  if (!guildId) throw new Error(`Sin guildId en players/${allyCode} — corre antes ingest.mjs.`);
  const guildDoc = await getDoc(env, `guild/${guildId}`);
  const guild = guildDoc && guildDoc.data ? JSON.parse(guildDoc.data) : null;
  if (!guild || !Array.isArray(guild.members)) throw new Error(`Sin miembros en guild/${guildId}.`);

  // 3) miembros a ingestar: se salta al admin (ya ingestado); filtros --only / --limit.
  let members = guild.members.filter(m => m && m.ally != null && String(m.ally) !== String(allyCode));
  if (only) members = members.filter(m => String(m.ally) === String(only));
  if (limit > 0) members = members.slice(0, limit);
  log(`Gremio ${guildId}: ${members.length} miembros a ingestar (admin ${allyCode} saltado).`);

  const res = { ok: 0, fallidos: 0, saltados: guild.members.length - members.length, errores: [] };
  for (let i = 0; i < members.length; i++) {
    const ally = String(members[i].ally);
    try {
      const player = await ggJSON(`/player/${ally}/`);
      const rd = normalizeRoster(player, charMap);
      const meta = playerMeta(player);
      if (dry) log(`  [dry] setDoc players/${ally} · ${rd.R.length} unidades · ${meta.name}`);
      else { await setDoc(env, `players/${ally}`, { rd: JSON.stringify(rd), meta: JSON.stringify(meta), updatedAt: now }); log(`  setDoc players/${ally} · ${rd.R.length} unidades · ${meta.name}`); }
      res.ok++;
    } catch (e) {
      // Un miembro con perfil privado/404/timeout se SALTA y se registra — nunca aborta el run.
      res.fallidos++; res.errores.push({ ally, error: e.message });
      log(`  ⚠️ ${ally} saltado: ${e.message}`);
    }
    if (i < members.length - 1) await sleep(1100);
  }
  log(`Ingesta de gremio: ${res.ok} ok · ${res.fallidos} fallidos · ${res.saltados} saltados (admin/filtros).`);
  return res;
}

// --- shell: cablea las dependencias reales (no se ejecuta al importar en tests) ---
async function main() {
  const DRY = process.argv.includes("--dry");
  const only = argVal("--only");
  const limit = Number(argVal("--limit")) || 0;
  const env = { FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT };
  if (!DRY && !env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT (usa --dry para probar sin escribir).");
  const res = await ingestGuild(env, { ggJSON, getDoc, setDoc, sleep, log: console.log }, {
    allyCode: process.env.ALLY_CODE || "355463284", dry: DRY, limit, only,
  });
  if (res.fallidos) console.warn(`Fallidos: ${res.errores.map(e => e.ally).join(", ")}`);
  console.log(`OK · ${res.ok} rosters ingestados.`);
}
function argVal(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }

// Solo corre como script, no al importarse desde un test.
if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith("ingest-guild.mjs"))) {
  main().catch(e => { console.error("INGESTA DE GREMIO FALLIDA:", e.message); process.exit(1); });
}
