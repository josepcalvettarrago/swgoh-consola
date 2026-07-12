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

// priorityQueue(db, prios, rd, opts?) -> [{ tier, items:[{id,name,tier,gapTotal,unitsMissing,pct,pinned}] }].
// Por cada tier en el orden `prios`: objetivos NO desbloqueados (id ausente del roster). Orden dentro del
// tier: primero los FIJADOS (`opts.pins`, en su orden), luego el resto por gap total asc (desempate id).
// En 'galactic_legend' surface SOLO el primero DESPUÉS de aplicar pins (un GL a la vez, aunque esté fijado).
// Sin `opts` → comportamiento idéntico al de la Fase 4.6 (retrocompatible).
export function priorityQueue(db, prios, rd, opts = {}) {
  const ts = targetsOf(db);
  const owned = new Set(((rd && rd.R) || []).map(u => u.i));
  const byName = new Map(((rd && rd.R) || []).map(u => [u.n, u]));
  const order = (Array.isArray(prios) && prios.length) ? prios : TIER_ORDER;
  const pins = (opts && Array.isArray(opts.pins)) ? opts.pins : [];
  const pinRank = new Map(pins.map((id, i) => [id, i]));
  const rankOf = id => (pinRank.has(id) ? pinRank.get(id) : Infinity);
  const out = [];
  for (const tier of order) {
    let items = ts.filter(t => t.tier === tier && !owned.has(t.id)).map(t => {
      const { gapTotal, unitsMissing } = gapOf(t, byName);
      const total = (t.units || []).length;
      const pct = total ? Math.round((total - unitsMissing) / total * 100) : 0;
      return { id: t.id, name: t.name, tier, gapTotal, unitsMissing, pct, pinned: pinRank.has(t.id) };
    }).sort((a, b) => (rankOf(a.id) - rankOf(b.id)) || (a.gapTotal - b.gapTotal) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (tier === "galactic_legend") items = items.slice(0, 1); // un GL a la vez (tras pins)
    out.push({ tier, items });
  }
  return out;
}

// deriveProposals(state) -> [{ n, id, title, tag, why, adds, impact }] ordenado por impacto (desc).
// PURO: se alimenta de datos YA computados (nada de red). Sustituye el Top 5 hardcodeado de Yusepi.
export function deriveProposals(state = {}) {
  const { modsAudit, target, targetTotals, fleetFieldable = 0, datacronsUsable = 0, guild } = state;
  const g = (modsAudit && modsAudit.global) || {};
  const P = [];
  if (datacronsUsable > 0) P.push({ id: "datacrons", title: "Módulo de datacrones", tag: "Arena + GAC", impact: "Muy alto", why: `Tienes ${datacronsUsable} rutas de datacrón aprovechables para tus squads: +daño y +supervivencia gratis por temporada.`, adds: "Guía de reticle por facción y objetivo." });
  if ((g.unleveled || 0) > 150) P.push({ id: "mods", title: "Auditoría de mods", tag: "Global", impact: "Alto", why: `${g.unleveled} mods sin subir de nivel afectan a todos los modos.`, adds: "Ofensores por inversión + export a Grandivory." });
  if (target && targetTotals && !targetTotals.unlocked && ((targetTotals.relicGap || 0) + (targetTotals.gearGap || 0)) > 0) {
    const rem = (targetTotals.relicGap || 0) + (targetTotals.gearGap || 0);
    P.push({ id: "ascension", title: `Sigue tu ascensión — ${target.name}`, tag: "Objetivo", impact: "Alto", why: `Te faltan ${rem} niveles (relic+gear) para desbloquear a ${target.name}.`, adds: "Orden de farmeo y ETA en la pestaña Ascensión." });
  }
  if (fleetFieldable > 0) P.push({ id: "fleet", title: "Fleet Arena", tag: "Recursos", impact: "Medio", why: `Puedes montar ${fleetFieldable} flotas meta: vía barata de cristales F2P.`, adds: "Arranque y crew en la pestaña Flota." });
  if (guild && guild.rank) P.push({ id: "guild", title: "Seguimiento semanal + gremio", tag: "Progreso", impact: "Medio", why: `Vas ${guild.rank}/${guild.members || 50} en GP del gremio: mide el plan y a quién adelantar.`, adds: "Diff entre exports + ranking del gremio." });
  const w = { "Muy alto": 3, "Alto": 2, "Medio": 1 };
  P.sort((a, b) => (w[b.impact] || 0) - (w[a.impact] || 0));
  return P.map((p, i) => ({ n: i + 1, ...p }));
}
