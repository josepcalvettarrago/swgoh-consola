// Persistencia LOCAL del War Room (Fase 3.1). Solo `localStorage` del navegador: cero Worker,
// cero Firestore. Puro y testeable — `storage` es inyectable y todo va en try/catch para no
// romper si el almacenamiento está capado (modo privado) o ausente (tests/SSR).
//
// Claves:
//   swgoh.gac.locked -> [base_id]         mis unidades SIEMPRE en defensa (fuera del pool de ataque)
//   swgoh.gac.board  -> { size, order, teams:[{defenseIds:[...]}] }   tablero en curso

const K_LOCKED = "swgoh.gac.locked";
const K_BOARD = "swgoh.gac.board";
const K_ENERGY = "swgoh.vader.energy"; // energía diaria para el planificador de Vader (Fase 4.2)

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

// --- energía diaria del planificador de Vader (Fase 4.2) ---
export function loadEnergy(storage) {
  const v = Number(readJSON(storage, K_ENERGY, null));
  return Number.isFinite(v) && v > 0 ? v : null;
}
export function saveEnergy(energy, storage) {
  const v = Number(energy);
  if (!Number.isFinite(v) || v <= 0) return false;
  return writeJSON(storage, K_ENERGY, Math.round(v));
}
