// Motor PURO del módulo de flota (Fase 4.3). Sin DOM, sin dependencias → testeable y re-exportado
// desde engine.js. Cruza la BD curada de flotas meta (fleet_db) con las naves que POSEO (owned) y
// mis PILOTOS en vivo (roster) para decir qué flotas puedo montar, cuáles están "casi", y el crew.
//
// HONESTIDAD: fleet_db es meta general CURADA (tiers/arranque cambian); el ownership sí es tuyo. La
// fuerza real depende de tus pilotos (relic/gear/mods), no solo de tener las naves. Determinista.

const TIER_RANK = { S: 0, A: 1, B: 2, C: 3 };
const CREW_READY_RELIC = 5; // rl >= 5 → piloto "listo" (umbral honesto, ajustable)

// planFleet({ owned, shipMeta, roster, fleetDb }) -> [flota…] ordenado: montables primero (por tier),
// luego "casi" (faltan pocas), luego el resto. owned = [{i,t,l,p}]; roster = RD {R,V}.
export function planFleet({ owned = [], shipMeta = {}, roster = {}, fleetDb } = {}) {
  const fleets = (fleetDb && (Array.isArray(fleetDb) ? fleetDb : fleetDb.fleets)) || [];
  const own = new Map((owned || []).map(o => [o.i, o]));
  const owned7 = id => { const o = own.get(id); return !!o && o.t === 7; };
  const shipName = id => (shipMeta[id] && shipMeta[id].n) || id;
  const byId = new Map(((roster && roster.R) || []).map(u => [u.i, u]));

  const out = fleets.map(f => {
    const roster3 = [f.capital, ...(f.starters || [])]; // capital + titulares = lo que exige "montable"
    const allShips = [f.capital, ...(f.starters || []), ...(f.reinforcements || [])];
    const ships = allShips.map(id => ({ id, name: shipName(id), owned7: owned7(id), capital: id === f.capital, s: (shipMeta[id] && shipMeta[id].s) || "N" }));
    const missing = roster3.filter(id => !owned7(id));
    const capitalOwned = owned7(f.capital);
    const canField = missing.length === 0;
    const ownedCount = allShips.filter(owned7).length;
    const crew = (f.crew || []).map(id => {
      const u = byId.get(id);
      return { id, name: u ? u.n : id, relic: u ? u.rl : null, gear: u ? u.g : null, owned: !!u, ready: !!u && u.rl >= CREW_READY_RELIC };
    });
    return {
      id: f.id, label: f.label, capital: f.capital, tier: f.tier || "B", role: f.role || "both",
      opener: f.opener || "", source: f.source || "curado",
      capitalOwned, ships, missing, ownedCount, totalCount: allShips.length,
      canField, crew,
      // estado: 2=montable, 1=casi (faltan 1-2 de titulares/capital), 0=bloqueada.
      status: canField ? 2 : (missing.length <= 2 ? 1 : 0),
    };
  });

  out.sort((a, b) =>
    (b.status - a.status) ||
    ((TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9)) ||
    (a.missing.length - b.missing.length) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
