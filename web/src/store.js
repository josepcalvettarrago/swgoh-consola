// Persistencia LOCAL del War Room (Fase 3.1). Solo `localStorage` del navegador: cero Worker,
// cero Firestore. Puro y testeable — `storage` es inyectable y todo va en try/catch para no
// romper si el almacenamiento está capado (modo privado) o ausente (tests/SSR).
//
// Claves:
//   swgoh.gac.locked -> [base_id]         mis unidades SIEMPRE en defensa (fuera del pool de ataque)
//   swgoh.gac.board  -> { size, order, teams:[{defenseIds:[...]}] }   tablero en curso

const K_LOCKED = "swgoh.gac.locked";
const K_BOARD = "swgoh.gac.board";
const K_ENERGY = "swgoh.ascension.energy"; // energía diaria del planificador (Fase 4.2 → renombrada 4.6)
const K_ENERGY_OLD = "swgoh.vader.energy"; // clave vieja (Fase 4.2); se migra a K_ENERGY
const K_TW = "swgoh.tw.format";        // formato de TW del constructor de defensa (Fase 4.4)
const K_TARGET = "swgoh.ascension.target"; // id del objetivo de ascensión elegido (Fase 4.6)
const K_PLAN = "swgoh.ascension.plan";     // mapa targetId -> plan semanal editado a mano (Fase 4.6)
const K_PRIOS = "swgoh.ascension.prios";   // orden de tiers de prioridad de farmeo (Fase 4.7)
const K_PINS = "swgoh.ascension.pins";     // objetivos fijados al frente de la cola (Fase 4.7)

function store(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
function readJSON(storage, key, fallback) {
  const s = store(storage); if (!s) return fallback;
  try { const raw = s.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeJSON(storage, key, value) {
  const s = store(storage); if (!s) return false;
  try { s.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// --- bloqueo (mi defensa fija) ---
export function loadLocked(storage) {
  const v = readJSON(storage, K_LOCKED, []);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
}
export function saveLocked(ids, storage) {
  return writeJSON(storage, K_LOCKED, [...new Set((ids || []).filter(x => typeof x === "string"))]);
}

// --- tablero ---
export function loadBoard(storage) {
  const v = readJSON(storage, K_BOARD, null);
  if (!v || typeof v !== "object" || !Array.isArray(v.teams)) return null;
  const size = v.size === 3 ? 3 : 5;
  const order = v.order === "manual" ? "manual" : "auto";
  const teams = v.teams.slice(0, 6).map(t => ({ defenseIds: Array.isArray(t && t.defenseIds) ? t.defenseIds.filter(x => typeof x === "string") : [] }));
  return { size, order, teams };
}
export function saveBoard(board, storage) {
  if (!board || !Array.isArray(board.teams)) return false;
  const clean = {
    size: board.size === 3 ? 3 : 5,
    order: board.order === "manual" ? "manual" : "auto",
    teams: board.teams.slice(0, 6).map(t => ({ defenseIds: (t.defenseIds || []).filter(x => typeof x === "string") })),
  };
  return writeJSON(storage, K_BOARD, clean);
}
export function clearBoard(storage) {
  const s = store(storage); if (!s) return false;
  try { s.removeItem(K_BOARD); return true; } catch { return false; }
}

// --- energía diaria del planificador (Fase 4.2 → 4.6) ---
// Migración: si la clave nueva no existe pero sí la vieja (swgoh.vader.energy), se lee la vieja y
// se reescribe en la nueva → el usuario no pierde su valor guardado.
export function loadEnergy(storage) {
  const nv = Number(readJSON(storage, K_ENERGY, null));
  if (Number.isFinite(nv) && nv > 0) return nv;
  const ov = Number(readJSON(storage, K_ENERGY_OLD, null));
  if (Number.isFinite(ov) && ov > 0) { writeJSON(storage, K_ENERGY, Math.round(ov)); return Math.round(ov); }
  return null;
}
export function saveEnergy(energy, storage) {
  const v = Number(energy);
  if (!Number.isFinite(v) || v <= 0) return false;
  return writeJSON(storage, K_ENERGY, Math.round(v));
}

// --- objetivo de ascensión elegido (Fase 4.6) ---
export function loadTarget(storage) {
  const v = readJSON(storage, K_TARGET, null);
  return typeof v === "string" && v ? v : null;
}
export function saveTarget(id, storage) {
  if (typeof id !== "string" || !id) return false;
  return writeJSON(storage, K_TARGET, id);
}

// --- plan semanal editado a mano por objetivo (Fase 4.6): mapa targetId -> texto ---
export function loadPlan(targetId, storage) {
  const m = readJSON(storage, K_PLAN, null);
  if (!m || typeof m !== "object") return null;
  const v = m[targetId];
  return typeof v === "string" ? v : null;
}
export function savePlan(targetId, text, storage) {
  if (typeof targetId !== "string" || !targetId) return false;
  const m = readJSON(storage, K_PLAN, null) || {};
  if (typeof text === "string" && text.length) m[targetId] = text; else delete m[targetId];
  return writeJSON(storage, K_PLAN, m);
}

// --- orden de prioridades de tiers (Fase 4.7; se define ya) ---
export function loadPrios(storage) {
  const v = readJSON(storage, K_PRIOS, null);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : null;
}
export function savePrios(order, storage) {
  if (!Array.isArray(order)) return false;
  return writeJSON(storage, K_PRIOS, order.filter(x => typeof x === "string"));
}

// --- objetivos fijados (override individual) de la cola (Fase 4.7) ---
export function loadPins(storage) {
  const v = readJSON(storage, K_PINS, null);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
}
export function savePins(ids, storage) {
  if (!Array.isArray(ids)) return false;
  return writeJSON(storage, K_PINS, [...new Set(ids.filter(x => typeof x === "string"))]);
}

// --- formato de TW del constructor de defensa (Fase 4.4) ---
export function loadTW(storage) {
  const v = readJSON(storage, K_TW, null);
  if (!v || typeof v !== "object") return null;
  const clamp = (n, lo, hi, d) => { const x = Math.round(Number(n)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  return { zones: clamp(v.zones, 1, 12, 4), perZone: clamp(v.perZone, 1, 20, 5), size: v.size === 3 ? 3 : 5 };
}
export function saveTW(fmt, storage) {
  if (!fmt || typeof fmt !== "object") return false;
  return writeJSON(storage, K_TW, { zones: fmt.zones, perZone: fmt.perZone, size: fmt.size === 3 ? 3 : 5 });
}
