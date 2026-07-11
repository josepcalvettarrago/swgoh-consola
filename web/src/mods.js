// Motor PURO del auditor de mods (Fase 4.1). Sin DOM, sin dependencias → testeable directo y
// re-exportado desde engine.js (patrón diff.js/counters.js).
//
// HONESTIDAD: esto es un AUDITOR de déficits OBJETIVOS del mod (sin subir, color bajo, sin
// velocidad, calidad de tirada), NO un optimizador de "fit" con el personaje (eso es Grandivory).
//
// GOTCHA verificado: secondary_stats[].value viene ESCALADO. Se usa SIEMPRE display_value
// (velocidad = stat_id 5, "7" no 70000). `parseDisp` lo normaliza a número humano.

// Sets de swgoh.gg (id 1..8) — VERIFICADO empíricamente contra units[].data.mod_set_ids
// (piezas: 4 = {Ofensiva, Velocidad, Daño Crítico}; 2 = resto). No adivinado.
export const SET_MAP = {
  1: { n: "Salud", pieces: 2 }, 2: { n: "Ofensiva", pieces: 4 }, 3: { n: "Defensa", pieces: 2 },
  4: { n: "Velocidad", pieces: 4 }, 5: { n: "Prob. Crítico", pieces: 2 }, 6: { n: "Daño Crítico", pieces: 4 },
  7: { n: "Potencia", pieces: 2 }, 8: { n: "Tenacidad", pieces: 2 },
};
export const COLOR_MAP = { 1: "gris", 2: "verde", 3: "azul", 4: "morado", 5: "dorado" };
export const SPEED_STAT = 5; // stat_id de la Velocidad

// Umbrales y pesos como DATO (ampliable sin tocar lógica).
export const MOD_RULES = {
  levelMax: 15,
  lowColorBelow: 4,      // tier < 4 = gris/verde/azul
  premiumSpeed: 15,      // velocidad secundaria >= 15 → candidata a reubicar
  speedNorm: 25,         // velocidad para normalizar el score a 1
  speedBuckets: [10, 15, 20, 25],
  invest: { relicGe: 5, gearGe: 13 }, // "alta inversión" (relic LEVEL o gear) para ofensores
  weights: { dots: 0.15, color: 0.20, level: 0.20, speed: 0.30, quality: 0.15 },
};

// display_value -> número humano. "8" -> 8, "0.63%" -> 0.63, "" / null -> 0.
export function parseDisp(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}
// Secundaria de velocidad (>0) de un mod, o null.
function speedSecondary(mod) {
  return (mod.sec || []).find(s => s.s === SPEED_STAT && parseDisp(s.v) > 0) || null;
}

// modQuality(mod) -> { score 0..100, flags[], spd }. OBJETIVO, determinista.
export function modQuality(mod) {
  const w = MOD_RULES.weights;
  const sp = speedSecondary(mod);
  const spd = sp ? parseDisp(sp.v) : 0;
  const q = sp ? (Number(sp.q) || 0) : 0;
  const dots = mod.d === 6 ? 1 : 0.6;
  const color = (mod.col || 0) / 5;
  const level = (mod.lv || 0) / MOD_RULES.levelMax;
  const speed = Math.min(spd / MOD_RULES.speedNorm, 1);
  const score = Math.round((w.dots * dots + w.color * color + w.level * level + w.speed * speed + w.quality * q) * 100);
  const flags = [];
  if ((mod.lv || 0) < MOD_RULES.levelMax) flags.push("unleveled");
  if ((mod.col || 0) < MOD_RULES.lowColorBelow) flags.push("lowColor");
  if (!sp) flags.push("noSpeed");
  if (mod.d === 6) flags.push("sixDot");
  if (spd >= MOD_RULES.premiumSpeed) flags.push("premiumSpeed");
  return { score, flags, spd };
}

const has = (flags, f) => flags.indexOf(f) >= 0;
const isKeyUnit = inv => inv && inv.ct === 1 && ((inv.g || 0) >= MOD_RULES.invest.gearGe || (inv.rl || 0) >= MOD_RULES.invest.relicGe);

// auditMods({units, mods}) -> { global, offenders, quickWins }. Puro y determinista.
export function auditMods({ units = {}, mods = [] } = {}) {
  // --- global ---
  const byColor = { gris: 0, verde: 0, azul: 0, morado: 0, dorado: 0 };
  const byDots = { 5: 0, 6: 0 };
  const speedGe = {}; for (const b of MOD_RULES.speedBuckets) speedGe[b] = 0;
  let unleveled = 0, spdSum = 0, spdCount = 0;
  for (const m of mods) {
    if ((m.lv || 0) < MOD_RULES.levelMax) unleveled++;
    const cname = COLOR_MAP[m.col]; if (cname) byColor[cname]++;
    if (m.d === 6) byDots[6]++; else if (m.d === 5) byDots[5]++;
    const sp = speedSecondary(m);
    if (sp) { const v = parseDisp(sp.v); spdSum += v; spdCount++; for (const b of MOD_RULES.speedBuckets) if (v >= b) speedGe[b]++; }
  }
  const global = {
    total: mods.length, unleveled, byColor, byDots, speedGe,
    avgSpeed: spdCount ? Math.round(spdSum / spdCount) : 0,
  };

  // Índice de mods por personaje.
  const modsByChar = {};
  for (const m of mods) (modsByChar[m.c] = modsByChar[m.c] || []).push(m);

  // --- offenders: unidades de alta inversión con mods deficientes o casi sin velocidad de mods ---
  const offenders = [];
  for (const [id, inv] of Object.entries(units)) {
    if (!isKeyUnit(inv)) continue;
    const mine = modsByChar[id] || [];
    let unlev = 0, lowCol = 0; const worst = [];
    for (const m of mine) {
      const f = modQuality(m).flags;
      if (has(f, "unleveled")) unlev++;
      if (has(f, "lowColor")) lowCol++;
      if (has(f, "unleveled") || has(f, "lowColor")) worst.push(m.id);
    }
    const sm = inv.sm || 0;
    const deficit = unlev + lowCol + (sm < 10 ? 1 : 0);
    if (deficit === 0) continue; // sus mods están bien → no es ofensor
    const score = (inv.rl || 0) * 2 + ((inv.g || 0) >= MOD_RULES.invest.gearGe ? 3 : 0) + unlev + lowCol + Math.max(0, 10 - sm) * 0.5;
    const why = `R${inv.rl || 0} G${inv.g || 0} · +${sm} vel de mods · ${unlev} sin subir${lowCol ? `, ${lowCol} color bajo` : ""}`;
    offenders.push({ id, relic: inv.rl || 0, gear: inv.g || 0, spdMods: sm, spdFinal: inv.sf || 0, unleveled: unlev, lowColor: lowCol, worstMods: worst, score, why });
  }
  offenders.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // --- quickWins ---
  // level: mods sin subir en unidades CLAVE (barato, alto impacto). Agrupado por unidad.
  const levelByUnit = {};
  for (const [id, inv] of Object.entries(units)) {
    if (!isKeyUnit(inv)) continue;
    const n = (modsByChar[id] || []).filter(m => (m.lv || 0) < MOD_RULES.levelMax).length;
    if (n > 0) levelByUnit[id] = n;
  }
  const levelWins = Object.entries(levelByUnit)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id, count]) => ({ kind: "level", unit: id, count, gain: `${count} mod(s) a nivel 15`, cost: "barato (créditos)" }));

  // move: mod de velocidad PREMIUM (>=15) en banquillo (no clave) → reubicar a unidad clave con
  // poca velocidad de mods. Emparejado greedy determinista. Honesto: "candidata a reubicar".
  const premiumOnBench = [];
  for (const [id, inv] of Object.entries(units)) {
    if (inv.ct !== 1 || isKeyUnit(inv)) continue; // banquillo = no clave
    for (const m of (modsByChar[id] || [])) { const qk = modQuality(m); if (has(qk.flags, "premiumSpeed")) premiumOnBench.push({ modId: m.id, spd: qk.spd, from: id }); }
  }
  premiumOnBench.sort((a, b) => b.spd - a.spd || (a.modId < b.modId ? -1 : 1));
  const needy = Object.entries(units)
    .filter(([, inv]) => isKeyUnit(inv) && (inv.sm || 0) < MOD_RULES.premiumSpeed)
    .sort((a, b) => ((b[1].g || 0) - (a[1].g || 0)) || ((a[1].sm || 0) - (b[1].sm || 0)) || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const moveWins = [];
  for (let i = 0; i < premiumOnBench.length && i < needy.length; i++) {
    const p = premiumOnBench[i], to = needy[i];
    moveWins.push({ kind: "move", modId: p.modId, spd: p.spd, from: p.from, to, gain: `+${p.spd} vel → ${to}`, cost: "gratis (reasignar)" });
  }

  return { global, offenders, quickWins: { level: levelWins, move: moveWins } };
}
