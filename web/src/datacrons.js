// Motor PURO del planificador de datacrones (Fase 4.5). Sin DOM, sin dependencias fuertes →
// testeable y re-exportado desde engine.js. Cruza la GUÍA curada evergreen (datacron_db) con MI
// roster en vivo para priorizar QUÉ datacron construir (alineación L3 → facción L6 → personaje L9).
//
// HONESTIDAD: NO es un dato personal (tengo 0 datacrones) ni un set en vivo. El set concreto ROTA
// cada temporada; esto prioriza la ELECCIÓN, no cifras exactas. `usable` = poseo el personaje L9 y
// tengo unidades de esa facción. Determinista; nunca lanza.

const TIER_RANK = { S: 0, A: 1, B: 2, C: 3 };
const READY_RELIC = 5; // rl >= 5 → target "invertido" (umbral honesto, coherente con fleet.js)

// planDatacrons({ roster, datacronDb, meta }) -> { updated, note, paths:[…] }
// roster = RD {R,V}; meta = CHAR_META (fallback de nombre/lado si no poseo el target).
export function planDatacrons({ roster = {}, datacronDb, meta = {} } = {}) {
  const db = datacronDb || {};
  const paths = (Array.isArray(db) ? db : db.paths) || [];
  const R = (roster && roster.R) || [];
  const byId = new Map(R.map(u => [u.i, u]));

  // Recuento de facción sobre mi roster (excluye el pseudo-tag "Leader").
  const facCount = {};
  for (const u of R) for (const c of (u.c || [])) if (c !== "Leader") facCount[c] = (facCount[c] || 0) + 1;

  const out = paths.map(p => {
    const u = byId.get(p.target);
    const m = meta[p.target];
    const targetOwned = !!u;
    const targetName = u ? u.n : (m ? m.n : p.target);
    const side = u ? u.s : (m ? m.s : (p.align || "N"));
    const factionCount = facCount[p.faction] || 0;
    return {
      id: p.id, label: p.label, align: p.align, faction: p.faction, l6: p.l6,
      target: p.target, l9: p.l9, modes: p.modes || [], tier: p.tier || "B",
      note: p.note || "", source: p.source || "curado",
      targetOwned, targetName, side,
      relic: u ? u.rl : null, gear: u ? u.g : null,
      factionCount,
      usable: targetOwned && factionCount >= 1,
    };
  });

  // Orden: utilizables primero → por tier (S<A<B) → desempate estable por id.
  out.sort((a, b) =>
    ((b.usable ? 1 : 0) - (a.usable ? 1 : 0)) ||
    ((TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9)) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    updated: db._meta && db._meta.updated ? db._meta.updated : null,
    note: "Tienes 0 datacrones: esto es una guía CURADA por temporada (el set rota; en el juego eliges el más cercano). No modela cifras exactas.",
    paths: out,
  };
}

export const DATACRON_READY_RELIC = READY_RELIC;
