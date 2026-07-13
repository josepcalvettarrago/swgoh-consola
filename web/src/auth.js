// Cliente de autenticación (Fase 5.1). PURO: sin DOM; `fetchImpl` inyectable (patrón de main.js).
// Habla con los endpoints de auth del Worker (worker/src/auth.js). Ninguna función lanza:
// devuelven { ok, ... } o { ok:false, error } — la UI decide qué pintar.
//
// El token es un JWT HS256 firmado por el Worker. El cliente NO verifica la firma (no tiene el
// secret, y no hace falta: el Worker re-verifica en cada petición); aquí solo se decodifican los
// claims para saber quién eres y cuándo caduca la sesión.

function b64urlToStr(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  return atob(b64);
}

// parseToken(token) -> claims { sub, gid, adm, name, iat, exp } o null si está malformado/caducado.
export function parseToken(token, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(b64urlToStr(parts[1]));
    if (!claims || typeof claims.exp !== "number" || claims.exp <= now) return null;
    return claims;
  } catch { return null; }
}

async function post(apiBase, path, payload, fetchImpl, method = "POST", token = null) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return { ok: false, error: "sin backend configurado" };
  try {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await f(`${apiBase}/${path}`, { method, headers, body: payload != null ? JSON.stringify(payload) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: (data && data.error) || `error ${res.status}` };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "sin conexión con el servidor" };
  }
}

// Alta: invitación + nº de gremio + ally + contraseña. Devuelve { ok, token, ally, name, role }.
export function registerUser({ apiBase, invite, guildId, ally, password, fetchImpl } = {}) {
  return post(apiBase, "api/auth/register", { invite, guildId, ally, password }, fetchImpl);
}

// Entrar: ally + contraseña. Devuelve { ok, token, ally, name, guildId, role }.
export function loginUser({ apiBase, ally, password, fetchImpl } = {}) {
  return post(apiBase, "api/auth/login", { ally, password }, fetchImpl);
}

// Claims de la sesión según el SERVIDOR (verifica firma). Para validar un token guardado.
export function fetchMe({ apiBase, token, fetchImpl } = {}) {
  return post(apiBase, "api/me", null, fetchImpl, "GET", token);
}

// Config remota del usuario. Devuelve { ok, config|null, updatedAt }.
export function pullConfig({ apiBase, token, fetchImpl } = {}) {
  return post(apiBase, "api/config", null, fetchImpl, "GET", token);
}

// Sube la config local. Devuelve { ok, updatedAt }.
export function pushConfig({ apiBase, token, config, updatedAt, fetchImpl } = {}) {
  return post(apiBase, "api/config", { config, updatedAt }, fetchImpl, "PUT", token);
}

// --- admin (Bearer con adm:1) ---
export function rotateInvite({ apiBase, token, invite, fetchImpl } = {}) {
  return post(apiBase, "api/admin/invite", { invite }, fetchImpl, "POST", token);
}
export function resetUser({ apiBase, token, ally, fetchImpl } = {}) {
  return post(apiBase, `api/admin/users/${ally}`, null, fetchImpl, "DELETE", token);
}
