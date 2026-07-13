// Autenticación propia del Worker (Fase 5.1). Sin Firebase Auth: el flujo del gremio es
// código de invitación + nº de gremio + ally code + contraseña elegida por el miembro,
// y eso no encaja con email/password (ni queremos el SDK de Firebase en el bundle).
//
// Piezas (todas Web Crypto, sin dependencias):
//   - PBKDF2-SHA256 (100k iteraciones, salt aleatorio) para contraseñas y código de invitación.
//   - Sesión = JWT HS256 firmado con el secret AUTH_SECRET del Worker (30 días).
//   - Handlers puros-testables: la capa Firestore (`db = { getDoc, setDoc, deleteDoc }`) se
//     INYECTA, igual que `fetchImpl` en la web. index.js les pasa la real.
//
// Documentos:
//   auth/{guildId}  -> { inviteHash, inviteSalt, inviteIters, rotatedAt }   (invitación, hasheada)
//   users/{ally}    -> { ally, guildId, name, passHash, salt, iters, role, createdAt }
//   users/{ally}/data/config -> { config: JSON, updatedAt, savedAt }        (config por usuario)
//
// Bootstrap sin huevo-y-gallina: mientras NO exista auth/{guildId}, solo puede registrarse
// env.ADMIN_ALLY (sin invitación); una vez dentro, rota la invitación con /api/admin/invite.

const PBKDF2_ITERS = 100000;
const SESSION_TTL_S = 30 * 24 * 3600; // 30 días
const LOGIN_DELAY_MS = 300;           // retardo fijo anti fuerza-bruta básico (honesto: no es rate-limit)
const CONFIG_KEYS = ["locked", "board", "energy", "tw", "target", "plan", "prios", "pins"];
const CONFIG_MAX_BYTES = 32 * 1024;

// --- utilidades base64url (mismas que firestore.js; se duplican para mantener este módulo puro) ---
function b64url(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }
function fromB64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// --- PBKDF2 (contraseñas e invitación) ---
// hashSecret(secreto, salt?) -> { hash, salt, iters } (base64url). Salt aleatorio si no se pasa.
export async function hashSecret(secret, saltB64, iters = PBKDF2_ITERS) {
  const salt = saltB64 ? fromB64url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iters }, key, 256);
  return { hash: b64url(bits), salt: b64url(salt), iters };
}

// Comparación en tiempo constante (mismo coste acierte o falle).
function timingSafeEq(a, b) {
  const A = new TextEncoder().encode(a), B = new TextEncoder().encode(b);
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

// verifySecret(secreto, { hash, salt, iters }) -> bool.
export async function verifySecret(secret, rec) {
  if (!rec || !rec.hash || !rec.salt) return false;
  const { hash } = await hashSecret(secret, rec.salt, rec.iters || PBKDF2_ITERS);
  return timingSafeEq(hash, rec.hash);
}

// --- sesión JWT HS256 ---
async function hmacKey(secret, usages) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

// signSession(claims, secret, opts?) -> token. claims mínimas: { sub: ally, gid, adm }.
export async function signSession(claims, secret, { now = Math.floor(Date.now() / 1000), ttl = SESSION_TTL_S } = {}) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...claims, iat: now, exp: now + ttl };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(body))}`;
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

// verifySession(token, secret, opts?) -> claims | null (firma inválida, malformado o caducado).
export async function verifySession(token, secret, { now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const key = await hmacKey(secret, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
    if (!claims || typeof claims.exp !== "number" || claims.exp <= now) return null;
    return claims;
  } catch { return null; }
}

// Extrae el Bearer token de una Request (o null).
export function bearerToken(request) {
  const h = request && request.headers && request.headers.get ? request.headers.get("authorization") : null;
  const m = h && h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// --- validaciones compartidas ---
const RE_ALLY = /^\d{5,15}$/;
const RE_GUILD = /^[\w-]+$/;
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
function nowIso() { return new Date().toISOString(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function sessionClaims(user) {
  return { sub: String(user.ally), gid: user.guildId, adm: user.role === "admin" ? 1 : 0, name: user.name || "" };
}

// --- handlers (devuelven { status, data }; index.js los envuelve en json()) ---

// POST /api/auth/register { invite, guildId, ally, password }
export async function handleRegister(env, body, db, opts = {}) {
  const invite = body && String(body.invite || "");
  const guildId = body && String(body.guildId || "");
  const ally = body && String(body.ally || "");
  const password = body && String(body.password || "");
  if (!RE_ALLY.test(ally) || !RE_GUILD.test(guildId)) return { status: 400, data: { error: "ally o gremio con formato inválido" } };
  if (password.length < 8) return { status: 400, data: { error: "la contraseña debe tener al menos 8 caracteres" } };

  // 1) el gremio existe y 2) el ally pertenece a él (lista real de miembros de la ingesta).
  const guildDoc = await db.getDoc(env, `guild/${guildId}`);
  const guild = guildDoc && guildDoc.data ? safeParse(guildDoc.data) : null;
  if (!guild) return { status: 404, data: { error: "gremio no encontrado — revisa el nº de gremio" } };
  const member = (guild.members || []).find(m => String(m.ally) === ally);
  if (!member) return { status: 403, data: { error: "ese código de aliado no está en el gremio" } };

  // 3) invitación vigente. Bootstrap: sin doc de invitación, solo el admin puede entrar.
  const auth = await db.getDoc(env, `auth/${guildId}`);
  if (auth && auth.inviteHash) {
    const ok = await verifySecret(invite, { hash: auth.inviteHash, salt: auth.inviteSalt, iters: auth.inviteIters });
    if (!ok) return { status: 403, data: { error: "código de invitación incorrecto" } };
  } else if (ally !== String(env.ADMIN_ALLY || "")) {
    return { status: 403, data: { error: "el gremio aún no tiene invitación activa — pide al admin que la genere" } };
  }

  // 4) sin cuenta previa (reset = el admin la borra y te re-registras).
  const existing = await db.getDoc(env, `users/${ally}`);
  if (existing) return { status: 409, data: { error: "ese aliado ya tiene cuenta — pide al admin un reset si olvidaste la contraseña" } };

  // 5) crear cuenta + sesión.
  const { hash, salt, iters } = await hashSecret(password);
  const role = ally === String(env.ADMIN_ALLY || "") ? "admin" : "member";
  const user = { ally, guildId, name: member.name || "", passHash: hash, salt, iters, role, createdAt: nowIso() };
  await db.setDoc(env, `users/${ally}`, user);
  const token = await signSession(sessionClaims(user), env.AUTH_SECRET, opts.session);
  return { status: 201, data: { token, ally, name: user.name, guildId, role } };
}

// POST /api/auth/login { ally, password }. 401 SIEMPRE genérico (no revela si el ally existe)
// y con retardo fijo para encarecer la fuerza bruta (sin KV/DO no hay rate-limit real por IP).
export async function handleLogin(env, body, db, opts = {}) {
  const ally = body && String(body.ally || "");
  const password = body && String(body.password || "");
  const delay = opts.delayMs != null ? opts.delayMs : LOGIN_DELAY_MS;
  const fail = async () => { if (delay) await sleep(delay); return { status: 401, data: { error: "aliado o contraseña incorrectos" } }; };
  if (!RE_ALLY.test(ally) || !password) return fail();
  const user = await db.getDoc(env, `users/${ally}`);
  if (!user || !user.passHash) return fail();
  const ok = await verifySecret(password, { hash: user.passHash, salt: user.salt, iters: user.iters });
  if (!ok) return fail();
  const token = await signSession(sessionClaims(user), env.AUTH_SECRET, opts.session);
  return { status: 200, data: { token, ally, name: user.name || "", guildId: user.guildId, role: user.role || "member" } };
}

// GET /api/config (Bearer) -> config remota del usuario (o vacía).
export async function handleGetConfig(env, claims, db) {
  const doc = await db.getDoc(env, `users/${claims.sub}/data/config`);
  if (!doc || !doc.config) return { status: 200, data: { config: null, updatedAt: 0 } };
  return { status: 200, data: { config: safeParse(doc.config), updatedAt: Number(doc.updatedAt) || 0 } };
}

// PUT /api/config (Bearer) { config, updatedAt }. Solo las claves conocidas y con tope de tamaño.
export async function handlePutConfig(env, claims, body, db) {
  const cfg = body && body.config;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return { status: 400, data: { error: "config debe ser un objeto" } };
  const clean = {};
  for (const k of CONFIG_KEYS) if (cfg[k] !== undefined) clean[k] = cfg[k];
  const raw = JSON.stringify(clean);
  if (raw.length > CONFIG_MAX_BYTES) return { status: 413, data: { error: "config demasiado grande" } };
  const updatedAt = Number(body.updatedAt) || Date.now();
  await db.setDoc(env, `users/${claims.sub}/data/config`, { config: raw, updatedAt, savedAt: nowIso() });
  return { status: 200, data: { ok: true, updatedAt } };
}

// POST /api/admin/invite (Bearer adm:1) { invite } -> rota el código del gremio del admin.
export async function handleRotateInvite(env, claims, body, db) {
  const invite = body && String(body.invite || "");
  if (invite.length < 6) return { status: 400, data: { error: "la invitación debe tener al menos 6 caracteres" } };
  const { hash, salt, iters } = await hashSecret(invite);
  await db.setDoc(env, `auth/${claims.gid}`, { inviteHash: hash, inviteSalt: salt, inviteIters: iters, rotatedAt: nowIso() });
  return { status: 200, data: { ok: true, rotatedAt: nowIso() } };
}

// DELETE /api/admin/users/:ally (Bearer adm:1) -> reset: borra la cuenta (la config sobrevive).
export async function handleDeleteUser(env, claims, ally, db) {
  if (!RE_ALLY.test(String(ally))) return { status: 400, data: { error: "ally inválido" } };
  await db.deleteDoc(env, `users/${ally}`);
  return { status: 200, data: { ok: true } };
}

// GET /api/admin/overview (Bearer adm:1) -> estado del gremio para el panel de administración (5.3).
// Cruza EN EL WORKER (una sola llamada, sin 50 fetches en cliente): miembros del gremio × cuentas
// registradas (users) × rosters ingestados (players). Necesita db.listDocs además de getDoc.
// SEGURIDAD: nunca devuelve passHash/salt — solo ally/role/createdAt de cada cuenta.
export async function handleAdminOverview(env, claims, db) {
  const guildDoc = await db.getDoc(env, `guild/${claims.gid}`);
  const guild = guildDoc && guildDoc.data ? safeParse(guildDoc.data) : null;
  if (!guild || !Array.isArray(guild.members)) return { status: 404, data: { error: "sin datos de gremio" } };

  // Cuentas registradas del gremio (filtradas por guildId; solo campos públicos).
  const users = (await db.listDocs(env, "users", { limit: 300 })) || [];
  const registered = new Map();
  for (const u of users) {
    if (u.guildId && u.guildId !== claims.gid) continue; // no filtrar por otros gremios
    registered.set(String(u.ally != null ? u.ally : u._id), { role: u.role === "admin" ? "admin" : "member", createdAt: u.createdAt || null });
  }
  // Rosters ingestados (players/{ally}.updatedAt).
  const players = (await db.listDocs(env, "players", { limit: 300 })) || [];
  const ingested = new Map();
  for (const p of players) ingested.set(String(p._id), p.updatedAt || null);

  const rows = guild.members
    .map(m => {
      const ally = String(m.ally);
      const reg = registered.get(ally);
      return { ally, name: m.name || "", gp: m.gp || 0, registered: !!reg, role: reg ? reg.role : null, createdAt: reg ? reg.createdAt : null, ingested: ingested.has(ally), updatedAt: ingested.get(ally) || null };
    })
    .sort((a, b) => b.gp - a.gp);

  const stats = { total: rows.length, registrados: rows.filter(r => r.registered).length, ingestados: rows.filter(r => r.ingested).length };
  return { status: 200, data: { guild: { name: guild.name || null, memberCount: guild.memberCount || rows.length }, stats, rows } };
}

// ¿Puede esta sesión leer los datos de `ally`? (Fase 5.2) Solo tu propio ally, o cualquiera si
// eres admin. Puro y testeable — lo usa el gate de los endpoints de lectura por-jugador.
export function canReadAlly(claims, ally) {
  return !!claims && (claims.adm === 1 || String(claims.sub) === String(ally));
}

// Autentica una request: devuelve claims o null. Para gates admin, comprobar claims.adm === 1.
export async function authenticate(request, env, opts = {}) {
  const token = bearerToken(request);
  if (!token || !env.AUTH_SECRET) return null;
  return verifySession(token, env.AUTH_SECRET, opts);
}
