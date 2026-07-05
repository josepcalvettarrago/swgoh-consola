/**
 * Cloudflare Worker — SWGOH Consola (Fase 1: API de LECTURA).
 *
 * La INGESTA (fetch a swgoh.gg + normalizado + escritura en Firestore) NO vive aquí:
 * el egress de un Worker hacia swgoh.gg (también en Cloudflare) recibe el managed challenge.
 * La ingesta corre en GitHub Actions (scripts/ingest.mjs, cron). Ver README / docs/CHANGELOG.
 *
 * Este Worker solo lee de Firestore y sirve el RD al frontend con CORS:
 *   GET /api/roster/:ally      -> RD {R,V} desde players/{ally}
 *   GET /api/guild/:id         -> guild/{id}
 *   GET /api/meta/characters   -> mapa de metadata
 *
 * Secret: FIREBASE_SERVICE_ACCOUNT (solo lectura de Firestore).
 */
import { getDoc } from "./firestore.js";

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

      return json({ ok: true, phase: 1, role: "read-only (ingesta en GitHub Actions)", routes: ["/api/roster/:ally", "/api/guild/:id", "/api/meta/characters"] }, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, env, 500);
    }
  },
};
