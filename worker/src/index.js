/**
 * Cloudflare Worker — SWGOH Consola (Fase 1: pipeline swgoh.gg -> Firestore).
 *
 * Rutas:
 *   GET /api/roster/:ally      -> RD {R,V} desde players/{ally} en Firestore (503 si no hay dato)
 *   GET /api/guild/:id         -> guild/{id}
 *   GET /api/meta/characters   -> mapa de metadata cacheado
 *   GET /debug/raw?ally=NNN     -> proxy al endpoint público de swgoh.gg (captura de forma real)
 *   GET /debug/refresh          -> ejecuta el refresh manualmente (dev; poblar Firestore sin esperar al cron)
 *
 * cron `scheduled` (cada 8 h): refresca characters + Yusepi (+ gremio), encolando a ~1 req/seg,
 * normaliza y escribe en Firestore. Fuente: endpoint PÚBLICO de swgoh.gg (sin key; header UA).
 * Secrets: FIREBASE_SERVICE_ACCOUNT (obligatorio para escribir), SWGOH_GG_API_KEY (opcional).
 */
import { getDoc, setDoc } from "./firestore.js";
import { buildCharMap, normalizeRoster, playerMeta } from "./normalize.js";

const GG_BASE = "https://swgoh.gg/api";

function cors(env) {
  const origin = env.PAGES_ORIGIN || "*";
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" };
}
function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
}
function raw(str, env, status = 200) {
  return new Response(str, { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
}

// --- cola serie a ~1 req/seg (rate limit de swgoh.gg): nunca en paralelo ---
let _chain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function queue(fn, gapMs = 1100) {
  const run = _chain.then(async () => { const r = await fn(); await sleep(gapMs); return r; });
  _chain = run.catch(() => {});
  return run;
}
async function ggFetch(path, env) {
  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 swgoh-consola/1.0" };
  if (env.SWGOH_GG_API_KEY) headers["x-gg-bot-access"] = env.SWGOH_GG_API_KEY;
  return queue(() => fetch(`${GG_BASE}${path}`, { headers }));
}
async function ggJSON(path, env) {
  const res = await ggFetch(path, env);
  if (!res.ok) throw new Error(`swgoh.gg ${path} -> ${res.status}`);
  return res.json();
}

// --- pipeline: characters + player (+ gremio) -> normaliza -> Firestore ---
export async function refresh(env) {
  const ally = String(env.ALLY_CODE);
  const now = new Date().toISOString();

  const characters = await ggJSON("/characters/", env);
  const charMap = buildCharMap(characters);
  await setDoc(env, "meta/characters", { map: JSON.stringify(charMap), updatedAt: now });

  const player = await ggJSON(`/player/${ally}/`, env);
  const rd = normalizeRoster(player, charMap);
  const meta = playerMeta(player);
  const doc = { rd: JSON.stringify(rd), meta: JSON.stringify(meta), updatedAt: now };
  await setDoc(env, `players/${ally}`, doc);
  await setDoc(env, `snapshots/${ally}/history/${now.replace(/[:.]/g, "-")}`, doc);

  // Gremio: 1 sola llamada (resumen). Los rosters completos de los 50 son Fase 2.
  if (meta.guildId) {
    try {
      const g = await ggJSON(`/guild/${meta.guildId}/`, env);
      await setDoc(env, `guild/${meta.guildId}`, { data: JSON.stringify(g.data || g), updatedAt: now });
    } catch { /* el gremio no bloquea el refresh del jugador */ }
  }
  return { units: rd.R.length, updatedAt: now, meta };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    try {
      if (pathname === "/debug/raw") {
        const ally = url.searchParams.get("ally") || env.ALLY_CODE;
        const res = await ggFetch(`/player/${ally}/`, env);
        return raw(await res.text(), env, res.status);
      }
      if (pathname === "/debug/refresh") {
        return json(await refresh(env), env);
      }

      let m;
      if ((m = pathname.match(/^\/api\/roster\/(\d+)$/))) {
        const doc = await getDoc(env, `players/${m[1]}`);
        if (doc && doc.rd) return raw(doc.rd, env); // ya es el JSON {R,V}
        return json({ error: "sin snapshot todavía — ejecuta /debug/refresh o espera al cron" }, env, 503);
      }
      if ((m = pathname.match(/^\/api\/guild\/(\w+)$/))) {
        const doc = await getDoc(env, `guild/${m[1]}`);
        if (doc && doc.data) return raw(doc.data, env);
        return json({ error: "sin datos de gremio todavía" }, env, 503);
      }
      if (pathname === "/api/meta/characters") {
        const doc = await getDoc(env, "meta/characters");
        if (doc && doc.map) return raw(doc.map, env);
        return json({ error: "metadata no cacheada todavía" }, env, 503);
      }

      return json({ ok: true, phase: 1, routes: ["/api/roster/:ally", "/api/guild/:id", "/api/meta/characters", "/debug/raw?ally=", "/debug/refresh"] }, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, env, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env).catch(err => console.error("refresh cron:", err && err.message)));
  },
};
