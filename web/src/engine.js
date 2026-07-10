// Lógica PURA (sin DOM): avatares, motor de ensamblado de equipos y fila de personaje.
// Testeable directamente con vitest. No importar nada de ui.js aquí.
import { IMGBYNAME, KEYMECH, ROLE_ES, SIDES } from "./data.js";

// Diff engine (Fase 2): vive en su propio módulo puro y sin dependencias (para que la ingesta
// en Node no arrastre data.js). Se re-exporta aquí para que la UI lo consuma desde engine.js.
export { diffSnapshots, compactSnapshot, snapshotHash, isEmptyDiff } from "./diff.js";
// Auto-marcado del roadmap de Lord Vader (Fase 2): también puro.
export { vaderProgress } from "./vader.js";
// Scout de counters (Fase 3): motor puro sin DOM; `genScout` recibe `assemble` inyectada.
export { THREAT_MAP, detectThreats, threatsToNeeds, matchArchetype, genScout, resolveUnit, teamDifficulty, genBoard } from "./counters.js";

// ---- avatares (devuelven strings HTML; no tocan el DOM) ----
const IMGPRE = "https://game-assets.swgoh.gg/textures/tex.charui_", IMGSUF = ".png";
export function unitImg(u) { return u && u.im ? IMGPRE + u.im + IMGSUF : ""; }
export function initials(n) { return n.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
export function portrait(u) {
  const src = unitImg(u);
  return `<div class="savw ${u.s}"><span class="savi">${initials(u.n)}</span>${src ? `<img class="sav" src="${src}" loading="lazy" alt="" onerror="this.remove()">` : ""}</div>`;
}
export function lookupByName(name) {
  const hit = IMGBYNAME[name];
  if (hit) return { n: name, s: hit.s, im: hit.im };
  const stripped = name.replace(/\s*\(GL\)\s*$/, "");
  const hit2 = stripped !== name ? IMGBYNAME[stripped] : null;
  if (hit2) return { n: name, s: hit2.s, im: hit2.im };
  return { n: name, s: "N", im: null };
}

// ---- núcleo compartido: motor de ensamblado de equipos ----
// size = tamaño del equipo (3 para 3v3, 5 para 5v5). Default 5 -> comportamiento histórico
// intacto (lo garantizan los snapshots de engine.test.js / snapshot.test.js).
export function assemble(pool, forced, needs, size = 5) {
  size = Math.max(1, size | 0);
  forced = (forced || []).slice(0, size);
  const universe = pool.slice(); forced.forEach(f => { if (!universe.includes(f)) universe.push(f); });
  if (!universe.length) return null;
  const maxP = Math.max(...universe.map(u => u.p)), norm = u => u.p / maxP;
  const needCov = u => needs && needs.length ? u.a.filter(a => needs.includes(a)).length / needs.length : 0;
  const tagFreq = {}; pool.forEach(u => u.c.forEach(c => { if (c !== "Leader") tagFreq[c] = (tagFreq[c] || 0) + 1; }));
  const lfit = u => u.c.reduce((s, c) => s + (c !== "Leader" ? (tagFreq[c] || 0) : 0), 0) / Math.max(pool.length, 1);
  const lscore = u => 0.5 * norm(u) + 0.3 * lfit(u) + (needs && needs.length ? 0.6 * needCov(u) : 0);
  let leader; const fLead = forced.filter(u => u.ld);
  if (fLead.length) leader = fLead.slice().sort((a, b) => lscore(b) - lscore(a))[0];
  else { const pLead = pool.filter(u => u.ld); leader = (pLead.length ? pLead : universe).slice().sort((a, b) => lscore(b) - lscore(a))[0]; }
  const team = [leader];
  // Restricción de juego: máximo UNA Leyenda Galáctica (gl:1) por equipo.
  const teamHasGL = () => team.some(u => u.gl);
  const covered = new Set(leader.a.filter(a => KEYMECH.includes(a)));
  const roleCnt = {}; roleCnt[leader.r] = 1;
  forced.forEach(f => { if (team.length < size && !team.includes(f) && !(f.gl && teamHasGL())) { team.push(f); f.a.forEach(a => { if (KEYMECH.includes(a)) covered.add(a); }); roleCnt[f.r] = (roleCnt[f.r] || 0) + 1; } });
  function marginal(u) {
    const strengthW = norm(u) * 1.0;
    let coh = 0; team.forEach(t => { coh += u.c.filter(c => c !== "Leader" && t.c.includes(c)).length; });
    coh = Math.min(coh / (team.length * 2), 1) * 0.7;
    let roleB; const rc = roleCnt[u.r] || 0;
    if (u.r === "Tank" && !roleCnt["Tank"]) roleB = 0.5;
    else if ((u.r === "Healer" || u.r === "Support") && !((roleCnt["Healer"] || 0) + (roleCnt["Support"] || 0))) roleB = 0.42;
    else roleB = Math.max(0, 0.26 - rc * 0.13);
    let cov = 0; u.a.forEach(a => { if (KEYMECH.includes(a) && !covered.has(a)) cov++; });
    cov = Math.min(cov / 4, 1) * 0.6;
    const needB = needs && needs.length ? needCov(u) * 1.5 : 0;
    return strengthW + coh + roleB + cov + needB;
  }
  while (team.length < size) {
    const rest = pool.filter(u => !team.includes(u) && !(teamHasGL() && u.gl)); if (!rest.length) break;
    const pick = rest.slice().sort((a, b) => marginal(b) - marginal(a))[0]; team.push(pick);
    pick.a.forEach(a => { if (KEYMECH.includes(a)) covered.add(a); }); roleCnt[pick.r] = (roleCnt[pick.r] || 0) + 1;
  }
  const subs = pool.filter(u => !team.includes(u) && !(teamHasGL() && u.gl)).sort((a, b) => (needs && needs.length ? (needCov(b) - needCov(a)) : 0) || (norm(b) - norm(a))).slice(0, 4);
  const avgStr = team.reduce((s, u) => s + norm(u), 0) / team.length;
  const covScore = [...covered].filter(m => KEYMECH.includes(m)).length / KEYMECH.length;
  const hasTank = team.some(u => u.r === "Tank"), hasSus = team.some(u => u.r === "Healer" || u.r === "Support");
  const roleScore = (hasTank ? .5 : 0) + (hasSus ? .5 : 0);
  let pairs = 0, shared = 0; for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) { pairs++; shared += team[i].c.filter(c => c !== "Leader" && team[j].c.includes(c)).length; }
  const cohScore = Math.min((shared / Math.max(pairs, 1)) / 3, 1);
  let needScore = 0; if (needs && needs.length) { const cov = new Set(); team.forEach(u => u.a.forEach(a => { if (needs.includes(a)) cov.add(a); })); needScore = cov.size / needs.length; }
  const score = needs && needs.length
    ? Math.round((0.30 * avgStr + 0.20 * cohScore + 0.10 * covScore + 0.10 * roleScore + 0.30 * needScore) * 100)
    : Math.round((0.32 * avgStr + 0.26 * cohScore + 0.22 * covScore + 0.20 * roleScore) * 100);
  return { leader, team, subs, covered, score, hasTank, hasSus, maxP, needScore };
}

// Fila de personaje (HTML string) usada por Conquest y Counters.
export function teamRow(u, i, R, ctx, sub) {
  const chip = (t, l) => `<span class="rc rc-${t}">${l}</span>`;
  const rs = []; if (u.i === R.leader.i) rs.push(["lead", "★ Líder"]);
  rs.push(["role", ROLE_ES[u.r] || u.r]);
  if (ctx && ctx.forcedIds && ctx.forcedIds.includes(u.i)) rs.push(["forced", "📌 Obligatorio"]);
  if (ctx && ctx.reqTags) ctx.reqTags.forEach(t => { if (u.c.includes(t)) rs.push(["fac", t]); });
  if (ctx && ctx.needs) { u.a.filter(a => ctx.needs.includes(a)).slice(0, 3).forEach(m => rs.push(["need", m])); }
  else { u.a.filter(a => KEYMECH.includes(a)).slice(0, 2).forEach(m => rs.push(["mech", m])); }
  if (u.p === R.maxP) rs.push(["pillar", "◆ Pilar"]);
  return `<div class="simrow ${sub ? "sub" : ""}"><div class="pos ${u.i === R.leader.i ? "lead" : ""}">${sub ? "S" + (i + 1) : i + 1}</div>
   ${portrait(u)}
   <div><div class="sn">${u.n}</div><div class="rchips">${rs.map(([t, l]) => chip(t, l)).join("")}</div>
     <div class="smeta">${SIDES[u.s]} · ${u.t}★ G${u.g} R${u.rl}</div></div>
   <div class="sp">${(u.p / 1000).toFixed(1)}k</div></div>`;
}
