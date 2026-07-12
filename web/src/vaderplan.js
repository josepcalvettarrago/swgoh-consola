// Planificador de energía / ETA hacia Lord Vader (Fase 4.2). PURO y determinista (sin DOM).
// Cruza el roster EN VIVO (rd.R[].rl/g) con los objetivos de Vader (DATA.lv.units: `need` relic,
// gear 13) y estima el trabajo restante en DÍAS + un ORDEN de farmeo priorizado.
//
// HONESTIDAD: es una ESTIMACIÓN, no un router de nodos. El GEAR se farmea con energía (modelable:
// energía→días con tu presupuesto). El material de RELIC no es pura energía (mats/créditos/GET), así
// que se modela en DÍAS/nivel curados, independientes de la energía. VADER_COSTS es transparente y
// editable; ajústalo si tu ritmo difiere.
import { DATA } from "./data.js";

// Costes curados (medias F2P). relicDaysPerLevel[n] = días para ALCANZAR el nivel de relic n.
export const VADER_COSTS = {
  gearEnergyPerLevel: 3600, // energía media para subir un nivel de gear (piezas farmables) hacia G13
  relicDaysPerLevel: { 1: 3, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10 },
  note: "Estimación F2P curada (medias). El relic depende de materiales/créditos, no solo de energía.",
};

function relicDaysBetween(from, to, table) {
  let d = 0;
  for (let n = from + 1; n <= to; n++) d += table[n] || table[Math.min(9, Math.max(1, n))] || 0;
  return d;
}

// vaderPlan(rd, opts) -> { units, order, totals }. opts.lv/costs/dailyGearEnergy inyectables (tests).
// GENERALIZADO (Fase 4.6): `lv` puede ser cualquier objetivo de ascensión (unlock_db) además de DATA.lv.
//   - target relic: `u.need` (esquema viejo DATA.lv) o `u.relic` (esquema nuevo unlock_db).
//   - target gear:  `u.gear ?? 13` (journeys/legendaries piden gear variable, no fijo a 13).
//   - actual: SOLO del roster en vivo; el fallback embebido a "actual" solo se conserva en el
//     esquema viejo (cuando existe `u.need`), para no romper los tests. En esquema nuevo, actual = 0.
//   - `unlockName`: nombre de la unidad que se desbloquea (default "Lord Vader") para `unlocked`.
// Sin `opts` → comportamiento idéntico al de la Fase 4.2 (default = entrada de Vader).
export function vaderPlan(rd, { costs = VADER_COSTS, dailyGearEnergy = 480, lv, unlockName } = {}) {
  const LV = lv || DATA.lv || { units: [] };
  const energy = Math.max(1, Number(dailyGearEnergy) || 0);
  const byName = new Map(((rd && rd.R) || []).map(u => [u.n, u]));

  const units = (LV.units || []).map(u => {
    const legacy = u.need != null;                       // esquema viejo (DATA.lv) vs nuevo (unlock_db)
    const live = byName.get(u.name);
    const curRelic = live ? live.rl : (legacy ? (u.relic || 0) : 0);
    const curGear = live ? live.g : (legacy ? (u.gear || 0) : 0);
    const tgtRelic = legacy ? u.need : (u.relic || 0);
    // Esquema viejo (DATA.lv): `gear` es el gear ACTUAL/máx (objetivo fijo G13). Esquema nuevo
    // (unlock_db): `gear` es el gear OBJETIVO (variable: journeys/legendaries piden G11/G12).
    const tgtGear = legacy ? 13 : (u.gear != null ? u.gear : 13);
    const relicGap = Math.max(0, tgtRelic - curRelic);
    const gearGap = Math.max(0, tgtGear - curGear);
    const gearDays = Math.round((gearGap * costs.gearEnergyPerLevel) / energy);
    const relicDays = relicDaysBetween(curRelic, tgtRelic, costs.relicDaysPerLevel);
    const days = gearDays + relicDays;
    return { name: u.name, curRelic, tgtRelic, relicGap, curGear, tgtGear, gearGap, gearDays, relicDays, days, done: relicGap === 0 && gearGap === 0 };
  });

  // Orden: primero las pendientes, dentro de ellas lo más barato (quick-wins); hechas al final.
  const order = units.slice().sort((a, b) => (a.done - b.done) || (a.days - b.days) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const relicGap = units.reduce((s, u) => s + u.relicGap, 0);
  const gearGap = units.reduce((s, u) => s + u.gearGap, 0);
  const days = units.reduce((s, u) => s + u.days, 0);
  return { units, order, totals: { relicGap, gearGap, days, weeks: Math.ceil(days / 7), unlocked: byName.has(unlockName || "Lord Vader"), dailyGearEnergy: energy } };
}
