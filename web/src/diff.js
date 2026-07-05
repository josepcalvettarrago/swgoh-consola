// Diff engine PURO (sin DOM, sin dependencias): compara dos snapshots del roster y
// devuelve deltas estructurados. Se re-exporta desde engine.js (para la UI) y lo importa
// directamente scripts/ingest.mjs (Node) — por eso vive en su propio módulo sin imports:
// así el ingestor no arrastra el barril de datos del navegador (data.js).
//
// El FORMATEO a español ("Sube a Reliquia 7", "+184.000 GP", "Arena 228 → 221") es cosa de
// la capa UI. Aquí solo salen datos.
//
// ⚠️ Semántica de ARENA en SWGOH: un rango MENOR es mejor (228 → 221 = mejora). Por eso
// arenaImproved = (el número bajó). No se invierte el signo en ningún otro sitio.

// Snapshot compacto para diffear (lo escribe la ingesta). Solo lo que cambia con el progreso;
// nada de categorías/imágenes (no cambian). Incluye `n` (nombre) para que el evento sea
// autodescriptivo y la línea temporal se renderice sin necesitar el roster en vivo.
//   { ts, meta:{ gp, arenaRank, name }, units:[{ i, n, t, g, rl, p }] }
export function compactSnapshot(rd, meta, ts) {
  const units = ((rd && rd.R) || []).map(u => ({ i: u.i, n: u.n, t: u.t, g: u.g, rl: u.rl, p: u.p }));
  return {
    ts: ts || (meta && meta.ts) || null,
    meta: { gp: (meta && meta.gp) ?? null, arenaRank: (meta && (meta.arena ?? meta.arenaRank)) ?? null, name: (meta && meta.name) ?? null },
    units,
  };
}

// Hash determinista (FNV-1a 32-bit -> hex) de un snapshot compacto: meta + unidades ordenadas
// por id. Sirve para el DEDUP en la ingesta: si el hash coincide con el último, no se escribe
// snapshot ni evento (evita ensuciar la línea temporal en los runs de 8 h sin cambios).
export function snapshotHash(snap) {
  const m = (snap && snap.meta) || {};
  const units = ((snap && snap.units) || []).slice().sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));
  let s = `gp:${m.gp}|ar:${m.arenaRank}|nm:${m.name}`;
  for (const u of units) s += `|${u.i}:${u.t}:${u.g}:${u.rl}:${u.p}`;
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// diffSnapshots(prev, curr) -> deltas estructurados. prev/curr son snapshots compactos.
// Si prev es null/vacío, se trata TODO como estado inicial (sin unidades "nuevas" ni deltas):
// el primer snapshot no genera evento (de eso se encarga la ingesta comprobando prev).
export function diffSnapshots(prev, curr) {
  const cUnits = (curr && curr.units) || [];
  const pUnits = (prev && prev.units) || [];
  const cMeta = (curr && curr.meta) || {};
  const pMeta = (prev && prev.meta) || {};
  const prevById = new Map(pUnits.map(u => [u.i, u]));

  const units = [];
  let relicsGanados = 0, gearSubidos = 0, unidadesNuevas = 0;
  const mejoradas = new Set();

  for (const u of cUnits) {
    const p = prevById.get(u.i);
    if (!p) {
      // Unidad presente en curr y no en prev -> nueva. from=null, to=estrellas de desbloqueo.
      units.push({ i: u.i, n: u.n, kind: "nuevo", from: null, to: u.t });
      unidadesNuevas++;
      mejoradas.add(u.i);
      continue;
    }
    if (u.rl !== p.rl) {
      units.push({ i: u.i, n: u.n, kind: "relic", from: p.rl, to: u.rl });
      if (u.rl > p.rl) { relicsGanados += u.rl - p.rl; mejoradas.add(u.i); }
    }
    if (u.g !== p.g) {
      units.push({ i: u.i, n: u.n, kind: "gear", from: p.g, to: u.g });
      if (u.g > p.g) { gearSubidos += u.g - p.g; mejoradas.add(u.i); }
    }
    if (u.t !== p.t) {
      units.push({ i: u.i, n: u.n, kind: "stars", from: p.t, to: u.t });
      if (u.t > p.t) mejoradas.add(u.i);
    }
    if (u.p !== p.p) {
      units.push({ i: u.i, n: u.n, kind: "power", from: p.p, to: u.p });
    }
  }

  const gpDelta = num(cMeta.gp) - num(pMeta.gp);
  const arenaDelta = num(cMeta.arenaRank) - num(pMeta.arenaRank);
  const bothArena = cMeta.arenaRank != null && pMeta.arenaRank != null;

  return {
    account: {
      gpDelta,
      arenaDelta,
      arenaImproved: bothArena ? cMeta.arenaRank < pMeta.arenaRank : false,
    },
    units,
    summary: {
      relicsGanados,
      gearSubidos,
      unidadesNuevas,
      unidadesMejoradas: mejoradas.size,
      gpGanado: gpDelta,
    },
  };
}

// Un diff se considera VACÍO (no genera evento) si no cambió ninguna unidad ni el GP ni la arena.
export function isEmptyDiff(diff) {
  if (!diff) return true;
  const a = diff.account || {};
  return (diff.units || []).length === 0 && !a.gpDelta && !a.arenaDelta;
}

function num(v) { return typeof v === "number" ? v : 0; }
