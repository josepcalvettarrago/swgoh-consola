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
const K_AUTH = "swgoh.auth.session";       // sesión { token, ally, name, role } (Fase 5.1)
const K_CFG_TS = "swgoh.config.updatedAt"; // última modificación local de la config (Fase 5.1)

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

// --- notificación de cambios de config (Fase 5.1) ---
// Cada save* de config exitoso estampa K_CFG_TS y avisa al listener (el sync remoto debounced
// de main/ui). Durante importConfig se suprime (si no, cada pull dispararía un push en bucle).
let _onConfigChange = null;
let _importing = false;
export function onConfigChange(cb) { _onConfigChange = typeof cb === "function" ? cb : null; }
function touched(storage) {
  if (_importing) return;
  writeJSON(storage, K_CFG_TS, Date.now());
  if (_onConfigChange) { try { _onConfigChange(); } catch { /* el sync nunca rompe un save */ } }
}

// --- bloqueo (mi defensa fija) ---
export function loadLocked(storage) {
  const v = readJSON(storage, K_LOCKED, []);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
}
export function saveLocked(ids, storage) {
  const ok = writeJSON(storage, K_LOCKED, [...new Set((ids || []).filter(x => typeof x === "string"))]);
  if (ok) touched(storage);
  return ok;
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
  const ok = writeJSON(storage, K_BOARD, clean);
  if (ok) touched(storage);
  return ok;
}
export function clearBoard(storage) {
  const s = store(storage); if (!s) return false;
  try { s.removeItem(K_BOARD); touched(storage); return true; } catch { return false; }
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
  const ok = writeJSON(storage, K_ENERGY, Math.round(v));
  if (ok) touched(storage);
  return ok;
}

// --- objetivo de ascensión elegido (Fase 4.6) ---
export function loadTarget(storage) {
  const v = readJSON(storage, K_TARGET, null);
  return typeof v === "string" && v ? v : null;
}
export function saveTarget(id, storage) {
  if (typeof id !== "string" || !id) return false;
  const ok = writeJSON(storage, K_TARGET, id);
  if (ok) touched(storage);
  return ok;
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
  const ok = writeJSON(storage, K_PLAN, m);
  if (ok) touched(storage);
  return ok;
}

// --- orden de prioridades de tiers (Fase 4.7; se define ya) ---
export function loadPrios(storage) {
  const v = readJSON(storage, K_PRIOS, null);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : null;
}
export function savePrios(order, storage) {
  if (!Array.isArray(order)) return false;
  const ok = writeJSON(storage, K_PRIOS, order.filter(x => typeof x === "string"));
  if (ok) touched(storage);
  return ok;
}

// --- objetivos fijados (override individual) de la cola (Fase 4.7) ---
export function loadPins(storage) {
  const v = readJSON(storage, K_PINS, null);
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
}
export function savePins(ids, storage) {
  if (!Array.isArray(ids)) return false;
  const ok = writeJSON(storage, K_PINS, [...new Set(ids.filter(x => typeof x === "string"))]);
  if (ok) touched(storage);
  return ok;
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
  const ok = writeJSON(storage, K_TW, { zones: fmt.zones, perZone: fmt.perZone, size: fmt.size === 3 ? 3 : 5 });
  if (ok) touched(storage);
  return ok;
}

// --- sesión de usuario (Fase 5.1) ---
export function loadAuth(storage) {
  const v = readJSON(storage, K_AUTH, null);
  if (!v || typeof v !== "object" || typeof v.token !== "string" || !v.token) return null;
  return { token: v.token, ally: String(v.ally || ""), name: String(v.name || ""), role: v.role === "admin" ? "admin" : "member" };
}
export function saveAuth(session, storage) {
  if (!session || typeof session.token !== "string" || !session.token) return false;
  return writeJSON(storage, K_AUTH, { token: session.token, ally: String(session.ally || ""), name: String(session.name || ""), role: session.role === "admin" ? "admin" : "member" });
}
export function clearAuth(storage) {
  const s = store(storage); if (!s) return false;
  try { s.removeItem(K_AUTH); return true; } catch { return false; }
}

// --- export/import de la config por-usuario (Fase 5.1: sync con Firestore vía Worker) ---
// Las 8 claves de config viajan juntas como un objeto; `updatedAt` decide quién pisa a quién
// (last-write-wins). El import escribe con los MISMOS save* (validación intacta) pero suprime
// touched() para no re-disparar el push.
export function loadConfigTs(storage) {
  const v = Number(readJSON(storage, K_CFG_TS, 0));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
export function exportConfig(storage) {
  return {
    locked: loadLocked(storage),
    board: loadBoard(storage),
    energy: loadEnergy(storage),
    tw: loadTW(storage),
    target: loadTarget(storage),
    plan: readJSON(storage, K_PLAN, null),
    prios: loadPrios(storage),
    pins: loadPins(storage),
  };
}
export function importConfig(cfg, updatedAt, storage) {
  if (!cfg || typeof cfg !== "object") return false;
  _importing = true;
  try {
    if (Array.isArray(cfg.locked)) saveLocked(cfg.locked, storage);
    if (cfg.board) saveBoard(cfg.board, storage);
    if (cfg.energy != null) saveEnergy(cfg.energy, storage);
    if (cfg.tw) saveTW(cfg.tw, storage);
    if (typeof cfg.target === "string" && cfg.target) saveTarget(cfg.target, storage);
    if (cfg.plan && typeof cfg.plan === "object") writeJSON(storage, K_PLAN, cfg.plan);
    if (Array.isArray(cfg.prios)) savePrios(cfg.prios, storage);
    if (Array.isArray(cfg.pins)) savePins(cfg.pins, storage);
    writeJSON(storage, K_CFG_TS, Number(updatedAt) || Date.now());
    return true;
  } finally { _importing = false; }
}
