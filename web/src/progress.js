// Capa de PRESENTACIÓN de datos de progreso, pero PURA (sin DOM): decide el estado vacío y
// formatea los eventos a español. La ingesta guarda los diffs ya calculados (engine puro);
// aquí solo se traducen a titulares legibles. Testeable directamente.

export const EMPTY_MSG = "Aún no hay histórico. Vuelve tras la próxima ingesta.";

const fmt = n => Math.abs(n).toLocaleString("es-ES");

// ¿Hay algo que mostrar en la línea temporal? Con 0 o 1 snapshot no hay eventos (hace falta
// un anterior con qué comparar) -> estado vacío, nunca una excepción ni una consola en blanco.
export function progressView({ events, snapshots } = {}) {
  const evs = Array.isArray(events) ? events : [];
  if (!evs.length) return { empty: true, reason: EMPTY_MSG, events: [], snapshots: snapshots || [] };
  return { empty: false, events: evs, snapshots: snapshots || [] };
}

// "Arena 228 → 221" (o null si no hubo cambio de arena). from = curr - delta.
export function arenaText(ev) {
  const a = (ev && ev.account) || {};
  if (!a.arenaDelta || !ev.meta || ev.meta.arenaRank == null) return null;
  const curr = ev.meta.arenaRank, from = curr - a.arenaDelta;
  return `Arena ${from} → ${curr}`;
}

// Titulares del evento (array de trozos ya en español). El signo de arena respeta la semántica
// del juego: mejora = el número baja (▲), empeora = sube (▼).
export function eventHeadline(ev) {
  const s = (ev && ev.summary) || {}, a = (ev && ev.account) || {};
  const parts = [];
  if (s.relicsGanados) parts.push(`▲ +${s.relicsGanados} ${s.relicsGanados === 1 ? "reliquia" : "reliquias"}`);
  if (s.gearSubidos) parts.push(`+${s.gearSubidos} gear`);
  if (s.unidadesNuevas) parts.push(`✦ ${s.unidadesNuevas} ${s.unidadesNuevas === 1 ? "unidad nueva" : "unidades nuevas"}`);
  if (a.gpDelta) parts.push(`${a.gpDelta > 0 ? "+" : "−"}${fmt(a.gpDelta)} GP`);
  const at = arenaText(ev);
  if (at) parts.push(`${a.arenaImproved ? "▲" : "▼"} ${at}`);
  return parts;
}

// Descripción de un cambio concreto de unidad (para el detalle expandible).
export function unitChangeText(u) {
  switch (u.kind) {
    case "relic": return u.to > u.from ? `sube a Reliquia ${u.to}` : `baja a Reliquia ${u.to}`;
    case "gear": return `G${u.from} → G${u.to}`;
    case "stars": return `${u.from}★ → ${u.to}★`;
    case "power": return `${u.to > u.from ? "+" : "−"}${fmt(u.to - u.from)} power`;
    case "nuevo": return `nueva unidad · ${u.to}★`;
    default: return "";
  }
}

// Ordena los cambios de una unidad para el detalle: progresión (relic/gear/stars/nuevo) antes
// que el ruido de power.
const KIND_ORDER = { nuevo: 0, relic: 1, gear: 2, stars: 3, power: 4 };
export function sortedUnitChanges(units) {
  return (units || []).slice().sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
}

// Ranking de gremio por GP con la posición de Yusepi destacada. Puro.
export function guildRanking(guild, myAlly) {
  if (!guild || !Array.isArray(guild.members) || !guild.members.length) return null;
  const members = guild.members.slice().sort((a, b) => b.gp - a.gp);
  const myIndex = members.findIndex(m => String(m.ally) === String(myAlly));
  return { name: guild.name, memberCount: guild.memberCount || members.length, members, myIndex };
}
