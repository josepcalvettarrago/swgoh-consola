// Acceso a Firestore desde el Worker vía REST API, autenticando con un service account
// (JWT RS256 firmado con Web Crypto -> access token OAuth2). Sin dependencias externas.
//
// El service account JSON va como secret: wrangler secret put FIREBASE_SERVICE_ACCOUNT
// (una sola línea). En Fase 1 solo se usa para lectura; las escrituras llegan post-gate
// con el normalizador.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

// --- utilidades base64url ---
function b64url(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }

// PEM (private_key del service account) -> CryptoKey RS256.
async function importPrivateKey(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

// Firma un JWT y lo canjea por un access token. Cachea el token en memoria del Worker.
let _tokenCache = { token: null, exp: 0 };
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return _tokenCache.token;
}

// Parsea el secret del service account (acepta objeto o string JSON).
function parseSA(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT no configurado");
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// La base Firestore del proyecto se llama "swgohapi" (no la "(default)"): se creó con nombre
// propio en la consola (europe-west3). Es configurable con FIRESTORE_DB por si cambia.
function dbId(env) { return (env && env.FIRESTORE_DB) || "swgohapi"; }
function docBase(sa, env) {
  return `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/${dbId(env)}/documents`;
}

// --- conversión valores Firestore <-> JS (subset suficiente para RD/meta) ---
function toFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestore) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestore(v)])) } };
  return { stringValue: String(value) };
}
function fromFirestore(field) {
  if (!field) return null;
  if ("nullValue" in field) return null;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("stringValue" in field) return field.stringValue;
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(fromFirestore);
  if ("mapValue" in field) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([k, v]) => [k, fromFirestore(v)]));
  if ("timestampValue" in field) return field.timestampValue;
  return null;
}

// Lee un documento. path relativo, p. ej. "players/355463284". Devuelve objeto plano o null.
export async function getDoc(env, path) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const res = await fetch(`${docBase(sa, env)}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getDoc ${res.status}: ${await res.text()}`);
  const doc = await res.json();
  return doc.fields ? Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFirestore(v)])) : {};
}

// Lista los documentos de una colección/subcolección, ordenados por nombre DESCENDENTE
// (los timestamps ISO como id ordenan lexicográficamente = cronológicamente, así que desc =
// más reciente primero). Devuelve [{ _id, ...campos }]. Usado por los endpoints de progreso.
export async function listDocs(env, collectionPath, { limit = 20 } = {}) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const url = `${docBase(sa, env)}/${collectionPath}?pageSize=300`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`listDocs ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.documents || []).map(doc => {
    const id = (doc.name || "").split("/").pop();
    const obj = doc.fields ? Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFirestore(v)])) : {};
    return { _id: id, ...obj };
  }).sort((a, b) => (a._id < b._id ? 1 : a._id > b._id ? -1 : 0)).slice(0, limit);
}

// Borra un documento (Fase 5.1: reset de cuenta por el admin). Las subcolecciones NO se borran
// (Firestore no cascada): la config de usuario sobrevive al reset — es intencionado (al
// re-registrarse recupera sus prioridades/tablero).
export async function deleteDoc(env, path) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const res = await fetch(`${docBase(sa, env)}/${path}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`deleteDoc ${res.status}: ${await res.text()}`);
  return true;
}

// Escribe (upsert) un documento. data = objeto plano. Usado post-gate por el normalizador.
export async function setDoc(env, path, data) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFirestore(v)]));
  const res = await fetch(`${docBase(sa, env)}/${path}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`setDoc ${res.status}: ${await res.text()}`);
  return res.json();
}
