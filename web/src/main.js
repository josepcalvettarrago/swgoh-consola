// Entry de la app. Fase 1: intenta cargar el roster EN VIVO desde el Worker y, si falla
// (red caída, backend sin configurar, forma inesperada), cae al RD embebido del bundle.
// La consola nunca se queda en blanco. Los motores ya son agnósticos del roster.
//
// Fase 5.1 — puerta de acceso del gremio: sin sesión válida se muestra el overlay de login
// (con "ver demo" como salida honesta); con sesión, la config por-usuario se sincroniza con
// Firestore vía el Worker (last-write-wins por updatedAt) y localStorage queda de caché offline.
import { init, initLogin, showLogin } from "./ui.js";
import { RD, CHAR_META, MODS_EMBED, SHIPS_EMBED } from "./data.js";
import { auditMods } from "./engine.js";
import { parseToken, loginUser, registerUser, pullConfig, pushConfig } from "./auth.js";
import { loadAuth, saveAuth, clearAuth, exportConfig, importConfig, loadConfigTs, onConfigChange } from "./store.js";

// Configurable en build/deploy. Vacío = sin backend -> se usa directamente el embebido.
const API_BASE = "swgoh-consola.josep-calvet-tarrago.workers.dev";
const ALLY = "355463284";
const GUILD_ID = "U6tWH0WuSDyl_g7lmgZm-w"; // Catalonian Republic (descubierto en Fase 2).

// Devuelve un roster con forma RD ({R, V}). Nunca lanza: ante cualquier fallo -> embebido.
export async function loadRoster({ apiBase = API_BASE, ally = ALLY, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return RD;
  try {
    const res = await f(`${apiBase}/api/roster/${ally}`);
    if (!res || !res.ok) throw new Error(`status ${res && res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.R) && data.V) return data; // forma RD válida
    throw new Error("forma inesperada");
  } catch {
    return RD; // fallback embebido
  }
}

// Progreso (eventos ya diffeados + snapshots). Nunca lanza: ante cualquier fallo -> vacío,
// y la pestaña muestra su estado vacío (la consola nunca se queda en blanco).
export async function loadProgress({ apiBase = API_BASE, ally = ALLY, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return { events: [], snapshots: [] };
  try {
    const [pr, sn] = await Promise.all([
      f(`${apiBase}/api/progress/${ally}`).then(r => (r && r.ok ? r.json() : null)).catch(() => null),
      f(`${apiBase}/api/snapshots/${ally}`).then(r => (r && r.ok ? r.json() : null)).catch(() => null),
    ]);
    return { events: (pr && pr.events) || [], snapshots: (sn && sn.snapshots) || [] };
  } catch { return { events: [], snapshots: [] }; }
}

// Resumen de gremio. Nunca lanza: ante cualquier fallo -> null (el bloque de gremio se oculta).
export async function loadGuild({ apiBase = API_BASE, guildId = GUILD_ID, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f || !guildId) return null;
  try {
    const res = await f(`${apiBase}/api/guild/${guildId}`);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data && Array.isArray(data.members) ? data : null;
  } catch { return null; }
}

// Metadata GLOBAL de personajes para el Scout de counters (Fase 3): intenta el endpoint en vivo
// del Worker y cae SIEMPRE al CHAR_META embebido si falla (datalist del Scout nunca vacío).
export async function loadCharMeta({ apiBase = API_BASE, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return CHAR_META;
  try {
    const res = await f(`${apiBase}/api/meta/characters`);
    if (!res || !res.ok) throw new Error(`status ${res && res.status}`);
    const data = await res.json();
    // Forma esperada: mapa base_id -> {n,s,r,c,a,im,ld}. Si viene raro, usa el embebido.
    return data && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length ? data : CHAR_META;
  } catch {
    return CHAR_META; // fallback embebido
  }
}

// Mods (Fase 4.1): inventario compacto + inversión → auditoría calculada en cliente. Si el endpoint
// falla, cae al resumen embebido (MODS_EMBED) ya calculado. Nunca lanza; la pestaña nunca en blanco.
export async function loadMods({ apiBase = API_BASE, ally = ALLY, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return { audit: MODS_EMBED, live: false };
  try {
    const res = await f(`${apiBase}/api/mods/${ally}`);
    if (!res || !res.ok) throw new Error(`status ${res && res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.mods) && data.units) {
      return { audit: auditMods({ units: data.units, mods: data.mods }), mods: data.mods, units: data.units, live: true };
    }
    throw new Error("forma inesperada");
  } catch {
    return { audit: MODS_EMBED, live: false };
  }
}

// Naves poseídas (Fase 4.3): para el módulo de flota. Fallback al snapshot embebido. Nunca lanza.
export async function loadFleet({ apiBase = API_BASE, ally = ALLY, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!apiBase || !f) return { owned: SHIPS_EMBED, live: false };
  try {
    const res = await f(`${apiBase}/api/fleet/${ally}`);
    if (!res || !res.ok) throw new Error(`status ${res && res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.owned) && data.owned.length) return { owned: data.owned, live: true };
    throw new Error("forma inesperada");
  } catch {
    return { owned: SHIPS_EMBED, live: false };
  }
}

// --- sync de config por-usuario (Fase 5.1) ---
// Al entrar: pull → si el remoto es más nuevo pisa el local; si no, push del local. Después,
// cada save* de store.js dispara un push debounced (~2 s). Nunca lanza; sin red, la config
// sigue viviendo en localStorage como siempre.
let _pushTimer = null;
function wireConfigSync(session, apiBase = API_BASE) {
  onConfigChange(() => {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      pushConfig({ apiBase, token: session.token, config: exportConfig(), updatedAt: loadConfigTs() || Date.now() });
    }, 2000);
  });
}
export async function syncConfig(session, { apiBase = API_BASE, fetchImpl } = {}) {
  const remote = await pullConfig({ apiBase, token: session.token, fetchImpl });
  if (!remote.ok) return { mode: "offline" };
  if (remote.config && (remote.updatedAt || 0) > loadConfigTs()) {
    importConfig(remote.config, remote.updatedAt);
    return { mode: "pulled" };
  }
  await pushConfig({ apiBase, token: session.token, config: exportConfig(), updatedAt: loadConfigTs() || Date.now(), fetchImpl });
  return { mode: "pushed" };
}

// Arranca la consola (con o sin sesión). En 5.1 solo el roster de Yusepi está ingestado: si el
// miembro autenticado no tiene snapshot (el loader cae al embebido), se dice honestamente.
async function startConsole(session) {
  let demoNote = "";
  if (session) {
    await syncConfig(session);
    wireConfigSync(session);
  } else {
    demoNote = "Modo demo — datos de Yusepi. Entra con tu cuenta del gremio para guardar tu configuración.";
  }
  const ally = session && session.ally ? session.ally : ALLY;
  const [rd, progress, guild, charMeta, mods, fleet] = await Promise.all([loadRoster({ ally }), loadProgress({ ally }), loadGuild(), loadCharMeta(), loadMods({ ally }), loadFleet({ ally })]);
  if (session && ally !== ALLY && rd === RD) {
    demoNote = "Tu roster aún no está ingestado (llega en la Fase 5.2) — viendo los datos de demostración de Yusepi. Tu configuración sí es tuya.";
  }
  init(rd, { progress, guild, charMeta, mods, fleet, session, demoNote, onLogout: () => { clearAuth(); location.reload(); } });
}

async function boot() {
  // Sesión guardada y aún vigente → directo a la consola.
  const saved = loadAuth();
  if (saved && parseToken(saved.token)) return startConsole(saved);
  if (saved) clearAuth(); // caducada

  // Sin sesión: puerta de acceso (si el HTML no la tiene — tests antiguos — arranca en demo).
  const gated = initLogin({
    onLogin: async ({ ally, password }) => {
      const r = await loginUser({ apiBase: API_BASE, ally, password });
      if (r.ok) { saveAuth(r); showLogin(false); startConsole(loadAuth()); }
      return r;
    },
    onRegister: async ({ invite, guildId, ally, password }) => {
      const r = await registerUser({ apiBase: API_BASE, invite, guildId, ally, password });
      if (r.ok) { saveAuth(r); showLogin(false); startConsole(loadAuth()); }
      return r;
    },
    onDemo: () => { showLogin(false); startConsole(null); },
  });
  if (!gated) return startConsole(null);
  showLogin(true);
}

// Solo arranca en navegador (evita efectos secundarios al importar en tests).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
