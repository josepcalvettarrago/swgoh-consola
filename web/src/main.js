// Entry de la app. Fase 1: intenta cargar el roster EN VIVO desde el Worker y, si falla
// (red caída, backend sin configurar, forma inesperada), cae al RD embebido del bundle.
// La consola nunca se queda en blanco. Los motores ya son agnósticos del roster.
import { init } from "./ui.js";
import { RD, CHAR_META, MODS_EMBED, SHIPS_EMBED } from "./data.js";
import { auditMods } from "./engine.js";

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

async function boot() {
  const [rd, progress, guild, charMeta, mods, fleet] = await Promise.all([loadRoster(), loadProgress(), loadGuild(), loadCharMeta(), loadMods(), loadFleet()]);
  init(rd, { progress, guild, charMeta, mods, fleet });
}

// Solo arranca en navegador (evita efectos secundarios al importar en tests).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
