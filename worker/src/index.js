/**
 * Cloudflare Worker — SWGOH Consola (Fase 1).
 *
 * Rutas:
 *   GET /api/roster/:ally      -> players/{ally} desde Firestore (503 si aún no hay dato)
 *   GET /api/guild/:id         -> guild/{id} desde Firestore
 *   GET /api/meta/characters   -> metadata de personajes (cacheada)
 *   GET /debug/raw?ally=NNN     -> proxy directo al endpoint público de swgoh.gg (captura de forma real)
 *
 * Notas Fase 1:
 *   - El normalizador, las escrituras a Firestore y el cron `scheduled` llegan POST-GATE
 *     (tras aprobar el mapeo campo-a-campo). Aquí solo lectura + captura de la forma real.
 *   - Rate limit swgoh.gg ~1 req/seg: usar queue() para encolar (nunca en paralelo).
 *   - Secrets: SWGOH_GG_API_KEY (opcional, header x-gg-bot-access), FIREBASE_SERVICE_ACCOUNT.
 */
import { getDoc } from "./firestore.js";

const GG_BASE = "https://swgoh.gg/api";

// --- CORS restringido al origen de Pages (env.PAGES_ORIGIN); "*" en dev si no se define ---
function cors(env) {
  const origin = env.PAGES_ORIGIN || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
}

// --- cola serie a ~1 req/seg para respetar el rate limit de swgoh.gg ---
let _chain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function queue(fn, gapMs = 1100) {
  const run = _chain.then(async () => { const r = await fn(); await sleep(gapMs); return r; });
  _chain = run.catch(() => {}); // no rompas la cadena si una falla
  return run;
}

// Llama al endpoint público de swgoh.gg (header con key solo si existe).
async function ggFetch(path, env) {
  const headers = { accept: "application/json", "user-agent": "swgoh-consola/1.0" };
  if (env.SWGOH_GG_API_KEY) headers["x-gg-bot-access"] = env.SWGOH_GG_API_KEY;
  return queue(() => fetch(`${GG_BASE}${path}`, { headers }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    try {
      // Captura de la forma real (gate). Ojo: retirar/proteger tras la Fase 1.
      if (pathname === "/debug/raw") {
        const ally = url.searchParams.get("ally") || env.ALLY_CODE;
        const res = await ggFetch(`/player/${ally}/`, env);
        const body = await res.text();
        return new Response(body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", ...cors(env) } });
      }

      let m;
      if ((m = pathname.match(/^\/api\/roster\/(\d+)$/))) {
        const doc = await getDoc(env, `players/${m[1]}`);
        return doc ? json(doc, env) : json({ error: "sin snapshot todavía (Fase 1: pendiente del cron)" }, env, 503);
      }
      if ((m = pathname.match(/^\/api\/guild\/(\w+)$/))) {
        const doc = await getDoc(env, `guild/${m[1]}`);
        return doc ? json(doc, env) : json({ error: "sin datos de gremio todavía" }, env, 503);
      }
      if (pathname === "/api/meta/characters") {
        const doc = await getDoc(env, "meta/characters");
        return doc ? json(doc, env) : json({ error: "metadata no cacheada todavía" }, env, 503);
      }

      return json({ ok: true, phase: 1, routes: ["/api/roster/:ally", "/api/guild/:id", "/api/meta/characters", "/debug/raw?ally="] }, env);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, env, 500);
    }
  },

  // Cron (post-gate): refrescar Yusepi + gremio encolando a ~1 req/seg y escribir snapshots.
  // async scheduled(event, env, ctx) { /* Fase 1 post-gate: normalize + setDoc */ },
};
