// Ingesta swgoh.gg -> Firestore. Corre en GitHub Actions (runner datacenter normal, que SÍ
// obtiene 200 de swgoh.gg; el egress de un Cloudflare Worker recibiría el managed challenge).
// Reutiliza el normalizador y el cliente Firestore del Worker (ambos portables a Node).
//
// Uso:
//   node scripts/ingest.mjs            # ingesta real (necesita FIREBASE_SERVICE_ACCOUNT)
//   node scripts/ingest.mjs --dry      # solo fetch + normaliza + imprime (sin escribir)
//
// Env: ALLY_CODE (opcional), FIREBASE_SERVICE_ACCOUNT (JSON del service account, obligatorio salvo --dry).
import { buildCharMap, normalizeRoster, playerMeta, normalizeGuild, compactMods, compactShips } from "../worker/src/normalize.js";
import { setDoc, getDoc } from "../worker/src/firestore.js";
import { compactSnapshot, snapshotHash, diffSnapshots, isEmptyDiff } from "../web/src/diff.js";
// Cliente curl anti-fingerprint compartido con ingest-guild.mjs (Fase 5.2).
import { ggJSON } from "./gg-fetch.mjs";

const ALLY = process.env.ALLY_CODE || "355463284";
const DRY = process.argv.includes("--dry");
const env = { FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT };

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

  // --- Mods (Fase 4.1): compactar + escribir con DEDUP (patrón snapshots) ---
  // Cabe en 1 doc (~420 KB < 1 MB). Guarda: si el JSON de mods supera 900 KB, se pagina.
  const compact = compactMods(player);
  const modsJson = JSON.stringify(compact.mods), unitsJson = JSON.stringify(compact.units);
  const modsHash = snapshotHash({ m: modsJson, u: unitsJson });
  const modHead = DRY ? null : await getDoc(env, `mods/${ALLY}`).catch(() => null);
  if (modHead && modHead.hash === modsHash) {
    console.log(`  mods sin cambios (hash ${modsHash}) — no se escribe`);
  } else {
    const LIMIT = 900 * 1024;
    if (Buffer.byteLength(modsJson, "utf8") <= LIMIT) {
      await write(`mods/${ALLY}`, { mods: modsJson, units: unitsJson, count: compact.mods.length, hash: modsHash, paged: 0, updatedAt: now });
    } else {
      // Paginado: ~500 mods por página en mods/{ally}/pages/{000..}. El head guarda units + nº de páginas.
      const PER = 500, pages = Math.ceil(compact.mods.length / PER);
      for (let i = 0; i < pages; i++) {
        const chunk = compact.mods.slice(i * PER, (i + 1) * PER);
        await write(`mods/${ALLY}/pages/${String(i).padStart(3, "0")}`, { mods: JSON.stringify(chunk) });
      }
      await write(`mods/${ALLY}`, { units: unitsJson, count: compact.mods.length, hash: modsHash, paged: pages, updatedAt: now });
    }
    console.log(`  mods · ${compact.mods.length} compactos (${(Buffer.byteLength(modsJson, "utf8") / 1024).toFixed(0)} KB)`);
  }

  // --- Naves (Fase 4.3): posesión compacta con DEDUP (para el módulo de flota) ---
  const shipsOwned = compactShips(player);
  const shipsJson = JSON.stringify(shipsOwned);
  const shipsHash = snapshotHash({ s: shipsJson });
  const shipHead = DRY ? null : await getDoc(env, `ships/${ALLY}`).catch(() => null);
  if (shipHead && shipHead.hash === shipsHash) {
    console.log(`  naves sin cambios (hash ${shipsHash}) — no se escribe`);
  } else {
    await write(`ships/${ALLY}`, { owned: shipsJson, count: shipsOwned.length, hash: shipsHash, updatedAt: now });
    console.log(`  naves · ${shipsOwned.length} poseídas`);
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
