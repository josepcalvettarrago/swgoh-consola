// Entry de la app. Fase 1: intenta cargar el roster EN VIVO desde el Worker y, si falla
// (red caída, backend sin configurar, forma inesperada), cae al RD embebido del bundle.
// La consola nunca se queda en blanco. Los motores ya son agnósticos del roster.
import { init } from "./ui.js";
import { RD } from "./data.js";

// Configurable en build/deploy. Vacío = sin backend -> se usa directamente el embebido.
const API_BASE = "";
const ALLY = "355463284";

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

async function boot() { init(await loadRoster()); }

// Solo arranca en navegador (evita efectos secundarios al importar en tests).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
