// Ingesta swgoh.gg -> Firestore. Corre en GitHub Actions (runner datacenter normal, que SÍ
// obtiene 200 de swgoh.gg; el egress de un Cloudflare Worker recibiría el managed challenge).
// Reutiliza el normalizador y el cliente Firestore del Worker (ambos portables a Node).
//
// Uso:
//   node scripts/ingest.mjs            # ingesta real (necesita FIREBASE_SERVICE_ACCOUNT)
//   node scripts/ingest.mjs --dry      # solo fetch + normaliza + imprime (sin escribir)
//
// Env: ALLY_CODE (opcional), FIREBASE_SERVICE_ACCOUNT (JSON del service account, obligatorio salvo --dry).
import { buildCharMap, normalizeRoster, playerMeta, normalizeGuild } from "../worker/src/normalize.js";
import { setDoc, getDoc } from "../worker/src/firestore.js";
import { compactSnapshot, snapshotHash, diffSnapshots, isEmptyDiff } from "../web/src/diff.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

const GG_BASE = "https://swgoh.gg/api";
// ⚠️ Se usa `curl`, NO el fetch de Node: Cloudflare hace fingerprinting TLS (JA3) y bloquea
// con 403 la huella de undici aunque las cabeceras sean de navegador. (Firestore sí va por
// fetch: Google no aplica este bloqueo.)
//
// Desde el IP de datacenter de GitHub Actions, `curl` normal también recibe 403; por eso el
// workflow instala `curl-impersonate` y pasa CURL_BIN=curl_chrome116 (replica la huella
// TLS/HTTP2 de Chrome). En ese modo NO añadimos cabeceras propias: el wrapper ya envía el
// juego de cabeceras coherente con Chrome (mezclarlas re-dispararía la detección). En local,
// sin CURL_BIN, se usa `curl` con cabeceras de navegador (tu IP de casa sí pasa).
const CURL_BIN = process.env.CURL_BIN || "curl";
const IMPERSONATE = CURL_BIN !== "curl";
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
  // En modo impersonate el wrapper ya pone las cabeceras de Chrome; solo añadimos el Referer.
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
  // players/{ally} siempre se sobrescribe con el último estado (lo sirve el Worker read-only).
  await write(`players/${ALLY}`, { rd: JSON.stringify(rd), meta: JSON.stringify(meta), updatedAt: now });

  // --- Snapshots históricos + eventos, con DEDUP ---
  // El doc "head" (snapshots/{ally}) guarda el último snapshot compacto + su hash. Una sola
  // lectura por run: si el hash coincide, NO escribimos ni snapshot ni evento (evita ensuciar
  // la línea temporal en los runs de 8 h sin cambios reales).
  const tsSafe = now.replace(/[:.]/g, "-");
  const snapshot = compactSnapshot(rd, { ...meta, ts: now });
  const hash = snapshotHash(snapshot);
  const head = DRY ? null : await getDoc(env, `snapshots/${ALLY}`).catch(() => null);

  if (head && head.hash === hash) {
    console.log(`  sin cambios (hash ${hash}) — no se escribe snapshot ni evento`);
  } else {
    // Retención: histórico completo por ahora (es ligero). Si crece, podar a los últimos N
    // borrando los docs más antiguos de snapshots/{ally}/history y /events.
    await write(`snapshots/${ALLY}/history/${tsSafe}`, { snapshot: JSON.stringify(snapshot), hash, ts: now });
    // Evento = diff vs el snapshot anterior (si lo hay y no es vacío). Se guarda ya calculado
    // para que la línea temporal se lea barata en cliente (no se recalcula en el navegador).
    const prev = head && head.snapshot ? JSON.parse(head.snapshot) : null;
    if (prev) {
      const diff = diffSnapshots(prev, snapshot);
      if (!isEmptyDiff(diff)) {
        await write(`snapshots/${ALLY}/events/${tsSafe}`, {
          diff: JSON.stringify(diff), ts: now,
          gpDelta: diff.account.gpDelta, arenaDelta: diff.account.arenaDelta,
          relics: diff.summary.relicsGanados, nuevas: diff.summary.unidadesNuevas,
          meta: JSON.stringify(snapshot.meta),
        });
        console.log(`  evento · +${diff.summary.relicsGanados} relic · ${diff.summary.gpGanado} GP · arena ${diff.account.arenaDelta}`);
      } else {
        console.log("  snapshot nuevo pero diff vacío — sin evento");
      }
    } else {
      console.log("  primer snapshot — sin evento (no hay anterior con qué comparar)");
    }
    // Actualiza el head para el próximo run.
    await write(`snapshots/${ALLY}`, { hash, snapshot: JSON.stringify(snapshot), ts: now });
  }

  if (meta.guildId) {
    try {
      // ⚠️ El path correcto es /api/guild-profile/{id}/ (descubierto con curl en Fase 2);
      // /api/guild/{id}/ daba 404. Guardamos un RESUMEN por miembro para la comparativa.
      console.log(`Fetch /guild-profile/${meta.guildId}/ …`);
      const g = await ggJSON(`/guild-profile/${meta.guildId}/`);
      const summary = normalizeGuild(g);
      await write(`guild/${meta.guildId}`, {
        data: JSON.stringify(summary),
        name: summary.name, gp: summary.gp, memberCount: summary.memberCount, updatedAt: now,
      });
      console.log(`  gremio · ${summary.memberCount} miembros · GP ${summary.gp}`);
    } catch (e) { console.warn("gremio (no bloquea):", e.message); }
  }

  console.log(`OK · ${rd.R.length} unidades · ${meta.name} · GP ${meta.gp} · arena ${meta.arena} · ${now}`);
}

main().catch(e => { console.error("INGESTA FALLIDA:", e.message); process.exit(1); });
