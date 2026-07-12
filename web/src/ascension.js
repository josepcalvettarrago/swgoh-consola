// Capa de SELECCIÓN + PRIORIDAD de objetivos de ascensión (Fase 4.6). PURA, sin DOM. Se apoya en
// los motores generalizados (vaderPlan/vaderProgress): NO recalcula ETA, solo elige el objetivo y
// ordena la cola. `db` = unlock_db (catálogo curado). Determinista; nunca lanza.
import { vaderPlan } from "./vaderplan.js";
import { vaderProgress } from "./vader.js";

const DEFAULT_ID = "LORDVADER";
// Orden de tiers por defecto = prioridad de farmeo (1 journey · 2 legendary · 3 GL).
export const TIER_ORDER = ["journey", "legendary", "galactic_legend"];

function targetsOf(db) { return (db && (Array.isArray(db) ? db : db.targets)) || []; }

// resolveTarget(db, id) -> entrada del objetivo (id válido → esa; inválido → LORDVADER → la primera).
export function resolveTarget(db, id) {
  const ts = targetsOf(db);
  if (!ts.length) return null;
  return ts.find(t => t.id === id) || ts.find(t => t.id === DEFAULT_ID) || ts[0];
}

// planFor(rd, target, opts) -> { progress, order, units, totals, plan }.
// Delega en los motores con lv=target (esquema nuevo: relic/gear = objetivo) y unlockName=target.name.
// `plan` (fases curadas) es opcional y solo alimenta `progress.phases`; [] = sin roadmap.
export function planFor(rd, target, { costs, dailyGearEnergy = 480, plan } = {}) {
  if (!target) return { progress: null, order: [], units: [], totals: null, plan: null };
  const lv = { units: target.units || [] };
  const unlockName = target.name;
  const vpOpts = { lv, unlockName, dailyGearEnergy };
  if (costs) vpOpts.costs = costs;
  const vp = vaderPlan(rd, vpOpts);
  const progress = vaderProgress(rd, { lv, plan: Array.isArray(plan) ? plan : [], unlockName });
  return { progress, order: vp.order, units: vp.units, totals: vp.totals, plan: plan || null };
}

// Gap total (relic + gear) de un objetivo contra el roster en vivo; cuántas unidades incompletas.
function gapOf(target, byName) {
  let gapTotal = 0, unitsMissing = 0;
  for (const u of (target.units || [])) {
    const live = byName.get(u.name);
    const cr = live ? live.rl : 0, cg = live ? live.g : 0;
    const rg = Math.max(0, (u.relic || 0) - cr);
    const gg = Math.max(0, (u.gear != null ? u.gear : 13) - cg);
    gapTotal += rg + gg;
    if (rg + gg > 0) unitsMissing++;
  }
  return { gapTotal, unitsMissing };
}

// priorityQueue(db, prios, rd) -> [{ tier, items:[{id,name,tier,gapTotal,unitsMissing,pct}] }].
// Por cada tier en el orden `prios`: objetivos NO desbloqueados (id ausente del roster), ordenados por
// gap total asc (desempate id). En 'galactic_legend' surface SOLO el primero (un GL a la vez).
export function priorityQueue(db, prios, rd) {
  const ts = targetsOf(db);
  const owned = new Set(((rd && rd.R) || []).map(u => u.i));
  const byName = new Map(((rd && rd.R) || []).map(u => [u.n, u]));
  const order = (Array.isArray(prios) && prios.length) ? prios : TIER_ORDER;
  const out = [];
  for (const tier of order) {
    let items = ts.filter(t => t.tier === tier && !owned.has(t.id)).map(t => {
      const { gapTotal, unitsMissing } = gapOf(t, byName);
      const total = (t.units || []).length;
      const pct = total ? Math.round((total - unitsMissing) / total * 100) : 0;
      return { id: t.id, name: t.name, tier, gapTotal, unitsMissing, pct };
    }).sort((a, b) => (a.gapTotal - b.gapTotal) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (tier === "galactic_legend") items = items.slice(0, 1); // un GL a la vez
    out.push({ tier, items });
  }
  return out;
}
