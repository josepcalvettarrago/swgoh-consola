// Constructor de defensa de TW (Fase 4.4). PURO y determinista (sin DOM). Monta N escuadrones
// defensivos FUERTES desde TU roster SIN solapar personajes, y los reparte por zonas de TW.
// `assemble` se inyecta (evita ciclo con engine.js), igual que en counters/fleet.
//
// HONESTIDAD: monta por sinergia/fuerza desde tu roster (que sí conocemos); TÚ los colocas. No simula
// combates ni conoce los rosters del gremio (la API solo da GP por miembro). Solo escuadrones de
// personajes: las zonas de flota se cubren en la pestaña Flota.

// planTWDefense(roster, opts) -> { zones, totalWanted, built, ranOut, usedCount, poolTotal }
export function planTWDefense(roster, { zones = 4, perZone = 5, size = 5, assemble } = {}) {
  const R = (roster && roster.R) || [];
  const nZones = Math.max(1, zones | 0), nPer = Math.max(1, perZone | 0), sz = Math.max(1, size | 0);
  const wanted = nZones * nPer;
  const pool = R.slice();
  const squads = [];

  if (typeof assemble === "function") {
    for (let i = 0; i < wanted; i++) {
      if (pool.length < sz) break;                 // no quedan unidades para un escuadrón completo
      const res = assemble(pool, [], null, sz);
      if (!res || !res.team || res.team.length < sz) break;
      squads.push(res);
      const used = new Set(res.team.map(u => u.i));
      for (let k = pool.length - 1; k >= 0; k--) if (used.has(pool[k].i)) pool.splice(k, 1);
    }
  }

  const zonesOut = [];
  for (let z = 0; z < nZones; z++) zonesOut.push({ i: z, squads: squads.slice(z * nPer, (z + 1) * nPer) });
  const usedCount = squads.reduce((s, r) => s + r.team.length, 0);
  return { zones: zonesOut, totalWanted: wanted, built: squads.length, ranOut: squads.length < wanted, usedCount, poolTotal: R.length };
}
