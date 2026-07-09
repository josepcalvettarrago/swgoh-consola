// Entry de la app. Fase 1: intenta cargar el roster EN VIVO desde el Worker y, si falla
// (red caída, backend sin configurar, forma inesperada), cae al RD embebido del bundle.
// La consola nunca se queda en blanco. Los motores ya son agnósticos del roster.
import { init } from "./ui.js";
import { RD } from "./data.js";

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

async function boot() {
  const [rd, progress, guild] = await Promise.all([loadRoster(), loadProgress(), loadGuild()]);
  init(rd, { progress, guild });
}

// Solo arranca en navegador (evita efectos secundarios al importar en tests).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
