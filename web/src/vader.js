// Auto-marcado del roadmap de Lord Vader (Fase 2). PURO: cruza el RD en vivo con los
// objetivos de reliquia que ya viven en DATA (DATA.lv.units + fases de DATA.plan con targets)
// y decide, por unidad y por fase, si está completada / en curso / pendiente.
//
// El roadmap estático de la pestaña 02 pasa a ser dinámico: la reliquia ACTUAL sale del roster
// en vivo (rd.R[].rl); si una unidad no está en el roster (no debería), cae al valor embebido
// de DATA.lv como fallback para no romper nada.
import { DATA } from "./data.js";

// Estado de una fase según sus objetivos de reliquia.
function phaseState(done, total, anyProgress) {
  if (total === 0) return "manual";       // fases sin objetivos de relic (arena / desbloqueo)
  if (done === total) return "completada";
  if (done > 0 || anyProgress) return "en curso";
  return "pendiente";
}

// vaderProgress(rd, opts?) — opts.lv / opts.plan permiten inyectar datos en los tests.
export function vaderProgress(rd, opts = {}) {
  const lv = opts.lv || DATA.lv;
  const plan = opts.plan || DATA.plan;
  const byName = new Map(((rd && rd.R) || []).map(u => [u.n, u]));
  const curRelic = (name, fallback) => {
    const u = byName.get(name);
    return u ? u.rl : (fallback ?? 0);
  };

  // Objetivo por unidad (lista canónica de 14 en DATA.lv.units: need = relic objetivo).
  const units = (lv.units || []).map(u => {
    const current = curRelic(u.name, u.relic);
    const target = u.need;
    return { name: u.name, current, target, done: current >= target, gap: Math.max(0, target - current) };
  });

  // Fases del plan: las que tienen `targets` se auto-marcan por reliquia.
  const vaderUnlocked = byName.has("Lord Vader");
  const phases = (plan || []).map(p => {
    const targets = (p.targets || []).map(t => {
      const current = curRelic(t.name, t.from);
      return { name: t.name, current, target: t.to, done: current >= t.to };
    });
    const done = targets.filter(t => t.done).length;
    const anyProgress = targets.some(t => t.current > 0 && !t.done);
    let state = phaseState(done, targets.length, anyProgress);
    // Fase de desbloqueo (kind unlock): completada si Lord Vader ya está en el roster.
    if (p.kind === "unlock") state = vaderUnlocked ? "completada" : "pendiente";
    return { n: p.n, title: p.title, kind: p.kind, weeks: p.weeks, state, done, total: targets.length, targets };
  });

  const need = units.reduce((a, u) => a + u.target, 0);
  const ach = units.reduce((a, u) => a + Math.min(u.current, u.target), 0);
  const pct = need ? Math.round(ach / need * 100) : 0;

  return { units, phases, pct, vaderUnlocked, unitsDone: units.filter(u => u.done).length, unitsTotal: units.length };
}
