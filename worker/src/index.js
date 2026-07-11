/**
 * Cloudflare Worker — SWGOH Consola (Fase 1: API de LECTURA).
 *
 * La INGESTA (fetch a swgoh.gg + normalizado + escritura en Firestore) NO vive aquí:
 * el egress de un Worker hacia swgoh.gg (también en Cloudflare) recibe el managed challenge.
 * La ingesta corre en GitHub Actions (scripts/ingest.mjs, cron). Ver README / docs/CHANGELOG.
 *
 * Este Worker solo lee de Firestore y sirve el RD al frontend con CORS:
 *   GET /api/roster/:ally      -> RD {R,V} desde players/{ally}
 *   GET /api/guild/:id         -> guild/{id} (resumen de miembros)
 *   GET /api/meta/characters   -> mapa de metadata
 *   GET /api/progress/:ally     -> últimos N eventos (diffs ya calculados) + meta más reciente
 *   GET /api/snapshots/:ally    -> últimos N snapshots compactos (para gráficas futuras)
 *   GET /api/mods/:ally         -> inventario de mods compacto + inversión por unidad (auditoría)
 *
 * Secret: FIREBASE_SERVICE_ACCOUNT (solo lectura de Firestore).
 */
import { getDoc, listDocs } from "./firestore.js";

// limit saneado de ?limit=N (1..100, por defecto 20).
function limitOf(url, def = 20) {
  const n = parseInt(url.searchParams.get("limit"), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : def;
}

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
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    try {
      let m;
      if ((m = pathname.match(/^\/api\/roster\/(\d+)$/))) {
        const doc = await getDoc(env, `players/${m[1]}`);
        if (doc && doc.rd) return raw(doc.rd, env); // ya es el JSON {R,V}
        return json({ error: "sin snapshot todavía — ejecuta la ingesta (GitHub Actions)" }, env, 503);
      }
      if ((m = pathname.match(/^\/api\/guild\/([\w-]+)$/))) {
        const doc = await getDoc(env, `guild/${m[1]}`);
        if (doc && doc.data) return raw(doc.data, env);
        return json({ error: "sin datos de gremio todavía" }, env, 503);
      }
      if ((m = pathname.match(/^\/api\/progress\/(\d+)$/))) {
        const limit = limitOf(url);
        const docs = await listDocs(env, `snapshots/${m[1]}/events`, { limit });
        // Cada evento guarda el diff ya calculado (JSON string) -> lo devolvemos parseado para
        // que el cliente lo pinte sin recalcular nada.
        const events = docs.map(d => ({ ts: d.ts || d._id, meta: d.meta ? safeParse(d.meta) : null, ...(d.diff ? safeParse(d.diff) : {}) }));
        const player = await getDoc(env, `players/${m[1]}`).catch(() => null);
        const latest = { meta: player && player.meta ? safeParse(player.meta) : null };
        return json({ events, latest }, env);
      }
      if ((m = pathname.match(/^\/api\/snapshots\/(\d+)$/))) {
        const limit = limitOf(url);
        const docs = await listDocs(env, `snapshots/${m[1]}/history`, { limit });
        // Solo la meta (gp/arena/name) + ts: suficiente para gráficas, sin arrastrar unidades.
        const snapshots = docs.map(d => {
          const s = d.snapshot ? safeParse(d.snapshot) : null;
          return { ts: d.ts || d._id, meta: s && s.meta ? s.meta : null };
        });
        return json({ snapshots }, env);
      }
      if ((m = pathname.match(/^\/api\/mods\/(\d+)$/))) {
        const doc = await getDoc(env, `mods/${m[1]}`);
        if (!doc) return json({ error: "sin mods todavía — ejecuta la ingesta local" }, env, 503);
        const units = doc.units ? safeParse(doc.units) : {};
        let mods;
        if (doc.paged && Number(doc.paged) > 0) {
          // Reensambla las páginas mods/{ally}/pages/{000..} en orden.
          const pages = await listDocs(env, `mods/${m[1]}/pages`, { limit: 100 });
          const byId = pages.slice().sort((a, b) => (a._id < b._id ? -1 : 1));
          mods = byId.flatMap(p => (p.mods ? safeParse(p.mods) || [] : []));
        } else {
          mods = doc.mods ? safeParse(doc.mods) : [];
        }
        return json({ mods: mods || [], units, updatedAt: doc.updatedAt || null }, env);
      }
      if (pathname === "/api/meta/characters") {
        const doc = await getDoc(env, "meta/characters");
        if (doc && doc.map) return raw(doc.map, env);
        return json({ error: "metadata no cacheada todavía" }, env, 503);
      }

      return json({ ok: true, phase: 4, role: "read-only (ingesta local)", routes: ["/api/roster/:ally", "/api/guild/:id", "/api/meta/characters", "/api/progress/:ally", "/api/snapshots/:ally", "/api/mods/:ally"] }, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, env, 500);
    }
  },
};
