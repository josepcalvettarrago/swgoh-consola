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
 *   GET /api/fleet/:ally        -> naves poseídas (compacto) para el módulo de flota
 *
 * Fase 5.1 — auth propio (invitación + gremio + ally + contraseña; ver auth.js):
 *   POST /api/auth/register     -> alta con código de invitación (crea users/{ally} + JWT)
 *   POST /api/auth/login        -> sesión (JWT HS256, 30 días)
 *   GET  /api/me                -> claims de la sesión (Bearer)
 *   GET  /api/config            -> config remota del usuario (Bearer)
 *   PUT  /api/config            -> guarda la config del usuario (Bearer)
 *   POST /api/admin/invite      -> rota el código de invitación (Bearer admin)
 *   DELETE /api/admin/users/:a  -> reset de cuenta de un miembro (Bearer admin)
 *
 * Secrets: FIREBASE_SERVICE_ACCOUNT (Firestore) + AUTH_SECRET (firma de sesiones, Fase 5.1).
 */
import { getDoc, listDocs, setDoc, deleteDoc } from "./firestore.js";
import { authenticate, canReadAlly, handleRegister, handleLogin, handleGetConfig, handlePutConfig, handleRotateInvite, handleDeleteUser, handleAdminOverview } from "./auth.js";

// limit saneado de ?limit=N (1..100, por defecto 20).
function limitOf(url, def = 20) {
  const n = parseInt(url.searchParams.get("limit"), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : def;
}

function cors(env) {
  const origin = env.PAGES_ORIGIN || "*";
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "content-type, authorization" };
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

    const db = { getDoc, setDoc, deleteDoc, listDocs }; // capa Firestore inyectada en los handlers de auth
    const body = async () => { try { return await request.json(); } catch { return null; } };

    try {
      let m;

      // --- Fase 5.1: auth + config por usuario (auth.js) ---
      if (pathname === "/api/auth/register" && request.method === "POST") {
        const r = await handleRegister(env, await body(), db);
        return json(r.data, env, r.status);
      }
      if (pathname === "/api/auth/login" && request.method === "POST") {
        const r = await handleLogin(env, await body(), db);
        return json(r.data, env, r.status);
      }
      if (pathname === "/api/me" || pathname === "/api/config" || pathname.startsWith("/api/admin/")) {
        const claims = await authenticate(request, env);
        if (!claims) return json({ error: "sesión inválida o caducada" }, env, 401);
        if (pathname === "/api/me") return json({ ally: claims.sub, name: claims.name || "", guildId: claims.gid, role: claims.adm ? "admin" : "member", exp: claims.exp }, env);
        if (pathname === "/api/config" && request.method === "GET") {
          const r = await handleGetConfig(env, claims, db);
          return json(r.data, env, r.status);
        }
        if (pathname === "/api/config" && request.method === "PUT") {
          const r = await handlePutConfig(env, claims, await body(), db);
          return json(r.data, env, r.status);
        }
        // Gates admin: solo adm:1.
        if (claims.adm !== 1) return json({ error: "solo el admin del gremio" }, env, 403);
        if (pathname === "/api/admin/overview" && request.method === "GET") {
          const r = await handleAdminOverview(env, claims, db);
          return json(r.data, env, r.status);
        }
        if (pathname === "/api/admin/invite" && request.method === "POST") {
          const r = await handleRotateInvite(env, claims, await body(), db);
          return json(r.data, env, r.status);
        }
        if ((m = pathname.match(/^\/api\/admin\/users\/(\d+)$/)) && request.method === "DELETE") {
          const r = await handleDeleteUser(env, claims, m[1], db);
          return json(r.data, env, r.status);
        }
        return json({ error: "ruta admin desconocida" }, env, 404);
      }

      // --- Fase 5.2: las lecturas por-jugador y de gremio exigen sesión (solo TU ally, o admin).
      // /api/meta/characters queda público (mapa global, lo necesita el Scout incluso en demo).
      const perPlayer = pathname.match(/^\/api\/(?:roster|progress|snapshots|mods|fleet)\/(\d+)$/);
      const guildRead = pathname.match(/^\/api\/guild\/[\w-]+$/);
      if (perPlayer || guildRead) {
        const claims = await authenticate(request, env);
        if (!claims) return json({ error: "necesitas iniciar sesión" }, env, 401);
        if (perPlayer && !canReadAlly(claims, perPlayer[1])) return json({ error: "solo puedes ver tu propio roster" }, env, 403);
      }

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
      if ((m = pathname.match(/^\/api\/fleet\/(\d+)$/))) {
        const doc = await getDoc(env, `ships/${m[1]}`);
        if (!doc || !doc.owned) return json({ error: "sin naves todavía — ejecuta la ingesta local" }, env, 503);
        return json({ owned: safeParse(doc.owned) || [], updatedAt: doc.updatedAt || null }, env);
      }
      if (pathname === "/api/meta/characters") {
        const doc = await getDoc(env, "meta/characters");
        if (doc && doc.map) return raw(doc.map, env);
        return json({ error: "metadata no cacheada todavía" }, env, 503);
      }

      return json({ ok: true, phase: 5, role: "lectura + auth (ingesta local)", routes: ["/api/roster/:ally", "/api/guild/:id", "/api/meta/characters", "/api/progress/:ally", "/api/snapshots/:ally", "/api/mods/:ally", "/api/fleet/:ally", "/api/auth/register", "/api/auth/login", "/api/me", "/api/config", "/api/admin/overview", "/api/admin/invite", "/api/admin/users/:ally"] }, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, env, 500);
    }
  },
};
