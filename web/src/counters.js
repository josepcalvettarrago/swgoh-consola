// Motor PURO del Scout de counters (Fase 3). Sin DOM y sin dependencias de engine.js
// (para evitar el ciclo engine <-> counters): `assemble` se inyecta como parámetro en genScout.
// Se re-exporta desde engine.js igual que diff.js / vader.js.
//
// Idea central (ver PHASE3.md): el KIT de un personaje es FIJO por personaje, no por jugador,
// así que se pueden leer las AMENAZAS de cualquier defensa desde la metadata (ability_classes +
// categories) SIN el roster en vivo del rival. Esto resuelve la ELECCIÓN del counter, no la
// INVERSIÓN real del rival (estrellas/gear/relic/mods/velocidad) — de ahí el disclaimer en la UI.

// --- Tabla amenaza -> señal (kit) -> anti-needs (tags reales matcheables por assemble) ---
// Una amenaza se dispara si se cumple CUALQUIERA de sus condiciones:
//   any:   algún defensor tiene alguna de estas ability_classes.
//   all:   algún defensor tiene TODAS estas ability_classes (conjunción por unidad);
//          si además hay `role`, esa misma unidad debe tener ese rol.
//   count: al menos `n` defensores tienen el tag indicado (umbral de conjunto).
// `needs` son SOLO tags reales que aparecen en los rosters (no pseudo-tags descriptivos), para
// que assemble() los puntúe de verdad al montar el counter.
export const THREAT_MAP = {
  revive:   { any: ["Revive"], needs: ["Anti-Revive", "Buff Immunity", "Healing Immunity"] },
  tm_train: { any: ["Bonus Turn", "Speed Up"], count: { tag: "Gain Turn Meter", n: 2 }, needs: ["Remove Turn Meter", "Speed Down", "Daze"] },
  counter:  { any: ["Counter", "Retribution"], needs: ["Stun", "Ability Block", "Buff Immunity", "Daze"] },
  wall:     { all: ["Taunt", "Protection Up"], role: "Tank", needs: ["Defense Down", "Buff Immunity", "AoE"] },
  buffs:    { any: ["Offense Up", "Critical Damage Up", "Advantage", "Tenacity Up"], needs: ["Buff Immunity", "Dispel", "Tenacity Down"] },
  stealth:  { any: ["Stealth", "Foresight", "Evasion Up"], needs: ["Expose", "AoE", "Dispel"] },
  control:  { any: ["Stun", "Ability Block", "Daze", "Fear"], needs: ["Tenacity Up", "Dispel"] },
  dot:      { any: ["DoT", "Burning", "Plague", "Shock"], needs: ["Dispel", "Healing", "Damage Immunity"] },
  isolate:  { any: ["Fracture", "Deathmark", "Marked"], needs: ["Protection Up", "Tenacity Up", "Dispel"] },
  plague:   { any: ["Plague"], needs: ["Anti-Revive", "Buff Immunity", "Healing Immunity"] },
};
// Orden estable para salida determinista.
const THREAT_ORDER = ["revive", "plague", "tm_train", "counter", "wall", "buffs", "stealth", "control", "dot", "isolate"];

// Resuelve una entrada de defensa a un objeto-unidad {i,n,s,r,c,a,im,...}: acepta un base_id
// (se busca en `meta`) o un objeto ya resuelto (del roster o de la metadata). Devuelve null si
// es un id desconocido (defensor sin metadata) para que el llamador lo ignore sin romperse.
export function resolveUnit(u, meta) {
  if (!u) return null;
  if (typeof u === "string") {
    const m = meta && meta[u];
    return m ? { i: u, n: m.n, s: m.s, r: m.r, c: m.c || [], a: m.a || [], im: m.im, ld: m.ld, gl: m.gl ? 1 : 0 } : null;
  }
  return { i: u.i, n: u.n, s: u.s, r: u.r, c: u.c || [], a: u.a || [], im: u.im, ld: u.ld, gl: u.gl ? 1 : 0 };
}

function hasAll(unit, tags) { return tags.every(t => unit.a.includes(t)); }

// detectThreats: defensa (array de base_ids u objetos-unidad) -> [threatId] (únicos, ordenados).
export function detectThreats(defenseUnits, meta) {
  const units = (defenseUnits || []).map(u => resolveUnit(u, meta)).filter(Boolean);
  const fires = new Set();
  for (const [id, rule] of Object.entries(THREAT_MAP)) {
    let hit = false;
    if (rule.any && units.some(u => rule.any.some(t => u.a.includes(t)))) hit = true;
    if (!hit && rule.all && units.some(u => hasAll(u, rule.all) && (!rule.role || u.r === rule.role))) hit = true;
    if (!hit && rule.count && units.filter(u => u.a.includes(rule.count.tag)).length >= rule.count.n) hit = true;
    if (hit) fires.add(id);
  }
  return THREAT_ORDER.filter(t => fires.has(t));
}

// threatsToNeeds: unión de anti-needs de las amenazas, sin duplicados, en orden estable.
export function threatsToNeeds(threats) {
  const out = [];
  for (const t of threats || []) {
    const rule = THREAT_MAP[t];
    if (!rule) continue;
    for (const n of rule.needs) if (!out.includes(n)) out.push(n);
  }
  return out;
}

// matchArchetype: puntúa cada arquetipo de counterDb contra la defensa y devuelve el mejor por
// encima de umbral, o null. Determinista: recorre en orden y ante empate conserva el primero.
// counterDb acepta el JSON completo ({archetypes:[...]}) o directamente el array.
export function matchArchetype(defenseUnits, counterDb) {
  const list = Array.isArray(counterDb) ? counterDb : (counterDb && counterDb.archetypes) || [];
  const units = (defenseUnits || []).map(u => resolveUnit(u, null) || u).filter(Boolean);
  const ids = new Set(units.map(u => (typeof u === "string" ? u : u.i)));
  const cats = units.map(u => (u && u.c) || []);
  let best = null, bestScore = 0;
  for (const a of list) {
    const m = a.match || {};
    const leaderPresent = (m.leader || []).some(id => ids.has(id));
    const factionCount = m.faction && m.faction.length
      ? cats.filter(cs => m.faction.some(f => cs.includes(f))).length : 0;
    const anyOfCount = (m.anyOf || []).filter(id => ids.has(id)).length;
    const minFaction = m.minFaction || 2;
    const factionOk = factionCount >= minFaction;
    if (!leaderPresent && !factionOk) continue; // no cualifica
    const score = (leaderPresent ? 4 : 0) + (factionOk ? 2 + factionCount * 0.5 : 0) + anyOfCount;
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return best;
}

// genScout: orquesta todo. `assemble` se inyecta (evita ciclo con engine.js).
//   opts = { defenseIds:[base_id], roster:{R,V}, meta:CHAR_META, counterDb, assemble }
// Devuelve un objeto plano y determinista para que la UI lo pinte y los tests lo comparen.
export function genScout({ defenseIds, roster, meta, counterDb, assemble } = {}) {
  const R = (roster && roster.R) || [];
  const byId = {};
  for (const u of R) byId[u.i] = u;
  // Resuelve la defensa: mis unidades traen kit en RD; el resto, desde la metadata. Ids sin
  // metadata se listan aparte (unknown) y no rompen nada.
  const defense = [], unknown = [];
  for (const id of defenseIds || []) {
    const u = byId[id] ? resolveUnit(byId[id], meta) : resolveUnit(id, meta);
    if (u) defense.push(u); else unknown.push(id);
  }
  const threats = detectThreats(defense, meta);
  const archetype = matchArchetype(defense, counterDb) || null;

  // needs = anti-mecánicas de las amenazas + (si hay arquetipo) sus needs curados, sin duplicados.
  const needs = threatsToNeeds(threats).slice();
  if (archetype) for (const n of archetype.needs || []) if (!needs.includes(n)) needs.push(n);

  // Del mejor team curado, fijo como `forced` los base_ids que SÍ poseo; assemble rellena el resto.
  let forced = [];
  if (archetype && archetype.counters && archetype.counters[0]) {
    forced = archetype.counters[0].team.map(id => byId[id]).filter(Boolean);
  }
  const heuristic = typeof assemble === "function" ? assemble(R, forced, needs) : null;

  // curated: por cada team del arquetipo, qué % poseo (para avisar si me faltan unidades).
  const curated = archetype ? (archetype.counters || []).map(c => {
    const owned = c.team.filter(id => byId[id]);
    return { team: c.team, note: c.note, owned, ownedPct: c.team.length ? Math.round(owned.length / c.team.length * 100) : 0 };
  }) : [];

  // neutralized/missing: por cada amenaza, qué unidades de mi counter la contrarrestan (por tag anti).
  const team = (heuristic && heuristic.team) || [];
  const neutralized = [], missing = [];
  for (const t of threats) {
    const need = (THREAT_MAP[t] && THREAT_MAP[t].needs) || [];
    const by = team.filter(u => u.a.some(a => need.includes(a))).map(u => u.i);
    if (by.length) neutralized.push({ threat: t, byUnitIds: by });
    else missing.push(t);
  }

  return { defense, unknown, threats, archetype, curated, needs, heuristic, neutralized, missing };
}
