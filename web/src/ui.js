// Capa de presentación (DOM). Toda la lógica pura vive en engine.js.
// init() se llama desde main.js cuando el DOM está listo.
import { DATA, RD as EMBEDDED_RD, ENEMIES, SIDES, CHAR_META as EMBEDDED_META, MODS_EMBED, SHIP_META, SHIPS_EMBED } from "./data.js";
import { assemble, teamRow, portrait, unitImg, lookupByName, vaderProgress, genBoard, modQuality, parseDisp, SET_MAP, COLOR_MAP, vaderPlan, planFleet, planTWDefense, planDatacrons, resolveTarget, planFor, priorityQueue, deriveProposals, TIER_ORDER } from "./engine.js";
import { progressView, eventHeadline, unitChangeText, sortedUnitChanges, guildRanking } from "./progress.js";
import { loadLocked, saveLocked, loadBoard, saveBoard, clearBoard, loadEnergy, saveEnergy, loadTW, saveTW, loadTarget, saveTarget, loadPlan, savePlan, loadPrios, savePrios, loadPins, savePins } from "./store.js";
import COUNTER_DB from "./data/counter_db.json";
import FLEET_DB from "./data/fleet_db.json";
import DATACRON_DB from "./data/datacron_db.json";
import UNLOCK_DB from "./data/unlock_db.json";

// Roster activo: por defecto el embebido; init(rd) lo sustituye por el que venga en vivo.
let RD = EMBEDDED_RD;

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => n.toLocaleString("es-ES");

// ---- estado de módulo ----
let lvpct = 0, ringDone = false, rmIO = null;
const rm = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion:reduce)").matches : false;
const rxState = { q: "", side: "", role: "", fac: "", ab: "", sort: "p" };
let NAME2ID = {}, ID2U = {}; // se (re)construyen en init() a partir del roster activo.
let PROGRESS = { events: [], snapshots: [] }; // datos de la pestaña Progreso (o vacío -> estado vacío).
let GUILD = null;                              // resumen del gremio (o null -> bloque oculto).
let pgRingDone = false;
let cqCons = [];
const CQTYPE_ES = { fac: "Facción", side: "Lado", role: "Rol", ab: "Mecánica", char: "Personaje" };
const ROLE_ES = { Tank: "Tanque", Healer: "Sustain", Support: "Apoyo", Attacker: "Daño" };
const KEYMECH = ["Taunt", "Dispel", "Revive", "Gain Turn Meter", "Remove Turn Meter", "Stun", "Ability Block", "Offense Up", "Assist", "Buff Immunity", "Defense Down", "AoE"];
const cxState = { q: "", side: "", fac: "" };
// War Room de counters (Fase 3.1): metadata global (live o embebida) + tablero multi-equipo.
let META = EMBEDDED_META;         // mapa base_id -> {n,s,r,c,a,im,ld} (se refresca en init desde extra.charMeta)
let PICK_ALL = [], PICK_ROSTER = []; // índices del selector: todos los personajes / solo mi roster
let FACETS = { all: { fac: [], mech: [] }, roster: { fac: [], mech: [] } }; // listas de facetas por contexto
// Filtros avanzados del selector (tipo Conquest), combinados con Y. Persisten durante la SESIÓN
// (no en localStorage). "all" lo comparten todas las zonas enemigas; "roster" es del bloqueo.
const pickState = { all: { side: "", role: "", fac: "", mech: "" }, roster: { side: "", role: "", fac: "", mech: "" } };
const PICK_SIDES = [["L", "Luz"], ["D", "Oscuro"], ["N", "Neutral"]];
const PICK_ROLES = [["Tank", "Tanque"], ["Attacker", "Daño"], ["Support", "Apoyo"], ["Healer", "Sustain"]];
// Estado del tablero: tamaño uniforme (3/5), orden de reparto, 2-6 equipos enemigos, bloqueo de mi
// defensa fija y el último plan generado. Se persiste en localStorage (store.js).
const boardState = { size: 5, order: "auto", teams: [{ defenseIds: [] }, { defenseIds: [] }], locked: [], plan: null };
const THREAT_ES = { revive: "Revive", plague: "Plaga", tm_train: "Turn-Meter train", counter: "Contraataque", wall: "Muro / Taunt", buffs: "Buffs", stealth: "Sigilo", control: "Control (aturde/bloqueo)", dot: "DoT / veneno", isolate: "Aislamiento" };

// ===== header + mods + Lord Vader + roadmap + legends + proposals =====
function renderStatic() {
  const P = DATA.player, G = DATA.guild;
  $("#pname").textContent = P.name; $("#pguild").textContent = P.guild; $("#pally").textContent = "#" + P.ally;
  $("#pgp").textContent = (P.gp / 1e6).toFixed(2) + "M"; $("#prank").textContent = P.arena; $("#pskill").textContent = fmt(P.skill);
  $("#pguildrank").textContent = G.rank + "/" + G.members;
  if (P.arena <= 230) $("#rankchip").classList.add("near");
  $("#foot-updated").textContent = "Datos: " + P.updated;

  // La pestaña "Arena / Mods" la pinta renderMods() (Fase 4.1) con datos en vivo o embebidos.
  // La pestaña "Ascensión" (antes Vader) la pinta renderAscension() (Fase 4.6), objetivo configurable.
  // La pestaña GL la deriva renderGL(); la pestaña "Mejoras" la deriva renderMejoras() (Fase 4.7).
}

// ===== animaciones (meters, roadmap, ring) =====
function animateMeters(root = document) { $$(".meter[data-pct]", root).filter(m => !m.dataset.done).forEach(m => { m.dataset.done = "1"; const i = $("i", m); requestAnimationFrame(() => i.style.width = m.dataset.pct + "%"); }); }
function initRoadmapMeters() {
  const els = $$("#tl .rmeter"); if (rm) { els.forEach(m => $("i", m).style.width = m.dataset.p + "%"); return; }
  if (rmIO) return; rmIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $("i", e.target).style.width = e.target.dataset.p + "%"; rmIO.unobserve(e.target); } }), { threshold: .35 }); els.forEach(m => rmIO.observe(m));
}
function animateRing() {
  const r = $("#lvring"); if (rm) { r.style.setProperty("--p", lvpct); $("#lvpct").textContent = lvpct + "%"; return; }
  const t0 = performance.now(); (function step(t) { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3), c = Math.round(lvpct * e); r.style.setProperty("--p", c); $("#lvpct").textContent = c + "%"; if (k < 1) requestAnimationFrame(step); })(t0);
}

// ===== Roster explorer =====
function rxRender() {
  let list = RD.R.filter(u =>
    (!rxState.q || u.n.toLowerCase().includes(rxState.q)) &&
    (!rxState.side || u.s === rxState.side) &&
    (!rxState.role || u.r === rxState.role) &&
    (!rxState.fac || u.c.includes(rxState.fac)) &&
    (!rxState.ab || u.a.includes(rxState.ab)));
  list.sort((a, b) => rxState.sort === "n" ? a.n.localeCompare(b.n) : rxState.sort === "rl" ? (b.rl - a.rl || b.p - a.p) : (b.p - a.p));
  $("#rx-count").textContent = list.length + " de " + RD.R.length + " personajes";
  const g = $("#rx-grid");
  if (!list.length) { g.innerHTML = '<div class="rx-empty">Ningún personaje cumple esos filtros.</div>'; return; }
  g.innerHTML = list.map(u => {
    const facs = u.c.filter(c => c !== "Leader").slice(0, 3);
    return `<div class="rcard ${u.s}">
     <div class="gp">${(u.p / 1000).toFixed(1)}k</div>
     <div class="rhead">${portrait(u)}<div class="rn">${u.n}</div></div>
     ${u.gl ? '<div class="glstar">★ GL</div>' : ""}
     <div class="rmeta"><span class="st">${u.t}★</span> · G${u.g} · R${u.rl}${u.ld ? " · Líder" : ""}</div>
     <div class="rtags"><span class="role">${u.r}</span>${facs.map(f => `<span>${f}</span>`).join("")}</div>
   </div>`;
  }).join("");
}

// ===== Conquest: requisitos combinables (Y) + personajes obligatorios =====
function cqValues(t) {
  if (t === "fac") return RD.V.factions.map(([c]) => [c, c]);
  if (t === "side") return [["L", "Luz"], ["D", "Oscuro"]];
  if (t === "role") return RD.V.roles.map(r => [r, ROLE_ES[r] || r]);
  if (t === "ab") return RD.V.abilities.map(([a]) => [a, a]);
  return [];
}
function cqFillVal() {
  const t = $("#cq-type").value, sel = $("#cq-val"), cw = $("#cq-charwrap");
  if (t === "char") { sel.style.display = "none"; cw.style.display = ""; }
  else { cw.style.display = "none"; sel.style.display = ""; sel.innerHTML = ""; cqValues(t).forEach(([v, l]) => sel.insertAdjacentHTML("beforeend", `<option value="${v}">${l}</option>`)); }
}
function flash(msg) { const w = $("#cq-warn"); w.textContent = msg; w.style.display = "block"; clearTimeout(flash._t); flash._t = setTimeout(() => { w.style.display = "none"; }, 3800); }
function cqAdd() {
  const t = $("#cq-type").value;
  if (t === "char") {
    const nm = $("#cq-char").value.trim(), id = NAME2ID[nm];
    if (!id) { flash("Ese personaje no está en tu roster (usa el nombre exacto de la lista)."); return; }
    if (cqCons.filter(c => c.t === "char").length >= 3) { flash("Máximo 3 personajes obligatorios."); return; }
    if (cqCons.some(c => c.t === "char" && c.v === id)) { $("#cq-char").value = ""; return; }
    cqCons.push({ t: "char", v: id, label: nm }); $("#cq-char").value = "";
  } else {
    const v = $("#cq-val").value, label = $("#cq-val").selectedOptions[0].textContent;
    if (cqCons.some(c => c.t === t && c.v === v)) return;
    cqCons.push({ t, v, label });
  }
  cqRenderChips();
}
function cqRenderChips() {
  const box = $("#cq-chips");
  if (!cqCons.length) { box.innerHTML = '<span class="cq-empty">Sin requisitos — añade facción, lado, rol, mecánica o hasta 3 personajes. Se combinan con Y.</span>'; return; }
  box.innerHTML = cqCons.map((c, i) => { const u = c.t === "char" ? ID2U[c.v] : null; const src = u ? unitImg(u) : ""; const av = src ? `<img class="cqav" src="${src}" loading="lazy" alt="" onerror="this.remove()">` : ""; return `<span class="cq-chip cq-${c.t}">${av}<b>${CQTYPE_ES[c.t]}:</b> ${c.label}<button data-i="${i}" aria-label="quitar">×</button></span>`; }).join("");
  $$("#cq-chips button").forEach(b => b.onclick = () => { cqCons.splice(+b.dataset.i, 1); cqRenderChips(); });
}
function cqRun() {
  const out = $("#sim-out");
  if (!cqCons.length) { out.innerHTML = '<div class="simwarn">Añade al menos un requisito y pulsa «Proponer equipo».</div>'; return; }
  const charCons = cqCons.filter(c => c.t === "char"), wide = cqCons.filter(c => c.t !== "char");
  const forced = charCons.map(c => ID2U[c.v]).filter(Boolean);
  const passes = u => wide.every(c => c.t === "fac" ? u.c.includes(c.v) : c.t === "side" ? u.s === c.v : c.t === "role" ? u.r === c.v : c.t === "ab" ? u.a.includes(c.v) : true);
  const pool = RD.R.filter(passes);
  const warns = [];
  if (wide.filter(c => c.t === "side").length > 1) warns.push("Has puesto dos lados distintos; ningún personaje cumple ambos.");
  if (wide.filter(c => c.t === "role").length > 1) warns.push("Dos roles distintos: ningún personaje tiene dos roles a la vez.");
  if (!forced.length && !pool.length) { out.innerHTML = '<div class="simwarn">Ningún personaje de tu roster cumple esos requisitos combinados.</div>'; return; }
  const R = assemble(pool, forced, null);
  if (!R) { out.innerHTML = '<div class="simwarn">No he podido montar un equipo con esos requisitos.</div>'; return; }
  const ctx = { reqTags: wide.filter(c => c.t === "fac").map(c => c.v), forcedIds: forced.map(f => f.i), needs: null };
  const teamGP = R.team.reduce((s, u) => s + u.p, 0), missing = KEYMECH.filter(m => !R.covered.has(m));
  const chip = (t, l) => `<span class="rc rc-${t}">${l}</span>`, band = R.score >= 72 ? "hi" : R.score >= 50 ? "mid" : "lo";
  const reqLine = cqCons.map(c => `${CQTYPE_ES[c.t]}: <b>${c.label}</b>`).join(" · ");
  out.innerHTML = `
   <div class="simhead"><div class="sq">${reqLine} · ${pool.length} candidatos${forced.length ? ` + ${forced.length} obligatorio(s)` : ""}</div>
     <div class="synergy ${band}"><b>${R.score}</b><span>SINERGIA</span></div></div>
   ${warns.map(w => `<div class="simwarn">${w}</div>`).join("")}
   ${R.team.length < 5 ? `<div class="simwarn">Solo he reunido ${R.team.length} de 5 — no hay suficientes personajes que cumplan todo.</div>` : ""}
   ${!R.leader.ld ? '<div class="simwarn">Ningún «Líder» disponible con estos requisitos: he puesto de líder al más fuerte y afín.</div>' : ""}
   <div class="slabel">Titulares · 📌 obligatorios fijados + relleno por sinergia</div>
   ${R.team.map((u, i) => teamRow(u, i, R, ctx, false)).join("")}
   <div class="coverage">
     <span class="cv-h">Equilibrio</span>
     ${chip(R.hasTank ? "ok" : "gap", (R.hasTank ? "✓" : "✗") + " Tanque")}
     ${chip(R.hasSus ? "ok" : "gap", (R.hasSus ? "✓" : "✗") + " Sustain/Apoyo")}
     <span class="cv-h">Mecánicas</span>
     ${[...R.covered].filter(m => KEYMECH.includes(m)).map(m => chip("mech", m)).join("") || chip("gap", "ninguna clave")}
     ${missing.length ? `<span class="cv-h">Faltan</span>${missing.slice(0, 5).map(m => chip("gap", m)).join("")}` : ""}
   </div>
   ${R.subs.length ? `<div class="slabel">Suplentes</div>${R.subs.map((u, i) => teamRow(u, i, R, ctx, true)).join("")}` : ""}
   <div class="simfoot">GP titulares <b>${(teamGP / 1e6).toFixed(2)}M</b> · requisitos combinados con Y · el power cuenta, pero no se descarta a nadie por bajo power.</div>`;
}

// ===== Counters: defensas del meta + generador anti-mecánicas =====
function cxMatch(e) { return (!cxState.q || e.n.toLowerCase().includes(cxState.q)) && (!cxState.side || e.side === cxState.side) && (!cxState.fac || e.fac === cxState.fac); }
function renderCounters() {
  const box = $("#counters"); if (!box) return; const list = ENEMIES.filter(cxMatch);
  const cc = $("#cx-count"); if (cc) cc.textContent = `${list.length} defensas del meta · pulsa para generar tu counter`;
  if (!list.length) { box.innerHTML = '<div class="simwarn">Ningún rival con esos filtros.</div>'; return; }
  box.innerHTML = list.map(e => {
    const ix = ENEMIES.indexOf(e);
    const needs = e.needs.map(n => `<span class="rc rc-need">${n}</span>`).join("");
    const tl = e.threat === "alto" ? "Amenaza alta" : e.threat === "medio" ? "Media" : "Baja";
    return `<div class="ecard">
     <div class="ehead">${portrait(lookupByName(e.n))}<div><div class="en">${e.n}</div><div class="emeta">${SIDES[e.side]} · ${e.fac}</div></div>
       <span class="ethreat t-${e.threat}">${tl}</span></div>
     <div class="efocus">${e.focus}</div>
     <div class="eneeds"><span class="cv-h">Aporta</span>${needs}</div>
     <button class="cgen" data-e="${ix}">⚡ Generar counter con mi roster</button>
     <div class="cout" id="cout-${ix}"></div></div>`;
  }).join("");
  $$("#counters .cgen").forEach(b => b.onclick = () => genCounter(+b.dataset.e));
}
function genCounter(ei) {
  const e = ENEMIES[ei], out = $("#cout-" + ei);
  const R = assemble(RD.R, [], e.needs);
  if (!R) { out.innerHTML = '<div class="simwarn">No he podido generar equipo.</div>'; return; }
  const ctx = { reqTags: null, forcedIds: [], needs: e.needs };
  const covered = new Set(); R.team.forEach(u => u.a.forEach(a => { if (e.needs.includes(a)) covered.add(a); }));
  const miss = e.needs.filter(n => !covered.has(n));
  const chip = (t, l) => `<span class="rc rc-${t}">${l}</span>`, band = R.score >= 72 ? "hi" : R.score >= 50 ? "mid" : "lo";
  out.innerHTML = `
   <div class="simhead"><div class="sq">Tu mejor counter (heurístico)</div>
     <div class="synergy ${band}"><b>${R.score}</b><span>SINERGIA</span></div></div>
   ${R.team.map((u, i) => teamRow(u, i, R, ctx, false)).join("")}
   <div class="coverage"><span class="cv-h">Anti-mecánicas cubiertas</span>
     ${[...covered].map(m => chip("need", m)).join("") || chip("gap", "ninguna")}
     ${miss.length ? `<span class="cv-h">Sin cubrir</span>${miss.map(m => chip("gap", m)).join("")}` : ""}</div>
   <div class="simfoot">Heurístico (facción + fuerza + anti-mecánicas). No garantiza ganar: los counters reales dependen del kit y de los datacrons. Contrasta con las fuentes en vivo de abajo.</div>`;
}

// ===== War Room (Fase 3.1): tablero GAC multi-equipo con presupuesto de roster compartido =====
// Resuelve un base_id a un objeto-unidad para portrait()/teamRow(): primero mi roster (kit real),
// si no la metadata global, y como último recurso lookupByName para no quedarnos sin avatar.
function scoutUnit(id) {
  if (ID2U[id]) return ID2U[id];
  const m = META[id];
  if (m) return { i: id, n: m.n, s: m.s, r: m.r, c: m.c || [], a: m.a || [], im: m.im, gl: m.gl ? 1 : 0, ld: m.ld };
  return lookupByName(id);
}
// --- selector con avatares (búsqueda por texto + lista clicable) ---
// Índices precomputados (una vez en init) para no reconstruir 333 filas en cada pulsación.
function buildPickIndex() {
  // Entradas con c/a por REFERENCIA (no se copian los arrays) para filtrar por facción/mecánica.
  const seen = new Set(); PICK_ALL = [];
  for (const [id, m] of Object.entries(META)) { if (m && m.n && !seen.has(id)) { seen.add(id); PICK_ALL.push({ id, n: m.n, s: m.s, r: m.r, c: m.c || [], a: m.a || [] }); } }
  RD.R.forEach(u => { if (!seen.has(u.i)) { seen.add(u.i); PICK_ALL.push({ id: u.i, n: u.n, s: u.s, r: u.r, c: u.c || [], a: u.a || [] }); } });
  PICK_ALL.sort((a, b) => a.n.localeCompare(b.n));
  PICK_ROSTER = RD.R.map(u => ({ id: u.i, n: u.n, s: u.s, r: u.r, c: u.c || [], a: u.a || [] })).sort((a, b) => a.n.localeCompare(b.n));
  FACETS = { all: facetsOf(PICK_ALL), roster: facetsOf(PICK_ROSTER) };
}
// Facciones (por frecuencia desc, sin "Leader") y mecánicas (alfabético) distintas de una lista.
function facetsOf(list) {
  const facCount = {}, mech = new Set();
  for (const e of list) { for (const c of e.c) { if (c !== "Leader") facCount[c] = (facCount[c] || 0) + 1; } for (const a of e.a) mech.add(a); }
  const fac = Object.entries(facCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  return { fac, mech: [...mech].sort((a, b) => a.localeCompare(b)) };
}
// Filtra por nombre + filtros avanzados (Lado/Rol/Facción/Mecánica, combinados con Y). Con texto,
// los que EMPIEZAN por la búsqueda van primero. Cap 30.
function pickFilter(list, q, filters = {}, limit = 30) {
  q = (q || "").toLowerCase().trim();
  const f = filters || {};
  const ok = e => (!f.side || e.s === f.side) && (!f.role || e.r === f.role) && (!f.fac || e.c.includes(f.fac)) && (!f.mech || e.a.includes(f.mech));
  if (!q) { const out = []; for (const e of list) { if (ok(e)) { out.push(e); if (out.length >= limit) break; } } return out; }
  const starts = [], incl = [];
  for (const e of list) { if (!ok(e)) continue; const n = e.n.toLowerCase(); if (n.startsWith(q)) starts.push(e); else if (n.includes(q)) incl.push(e); }
  return starts.concat(incl).slice(0, limit);
}
// Pinta la lista clicable (con avatar) y cablea el clic. `onmousedown`+preventDefault para que el
// clic gane al blur del input. `excludeSet` marca como añadidos (deshabilitados) los ya elegidos.
// `activeIndex` resalta la fila navegada por teclado.
function renderPickList(listEl, items, onPick, excludeSet, activeIndex = -1) {
  if (!listEl) return;
  if (!items.length) { listEl.innerHTML = '<div class="wr-pempty">Sin resultados</div>'; listEl.hidden = false; return; }
  listEl.innerHTML = items.map((e, i) => {
    const u = scoutUnit(e.id), dis = excludeSet && excludeSet.has(e.id);
    return `<button type="button" class="wr-popt${i === activeIndex ? " active" : ""}" data-id="${e.id}"${dis ? " disabled" : ""}>${portrait(u)}<span class="wr-poptn">${e.n}</span><span class="wr-popts">${SIDES[e.s] || ""}${e.fac ? " · " + e.fac : ""}</span></button>`;
  }).join("");
  listEl.hidden = false;
  $$(".wr-popt", listEl).forEach(b => b.onmousedown = ev => { ev.preventDefault(); if (!b.disabled) onPick(b.dataset.id); });
}
// Rellena la barra de filtros avanzados (Lado/Rol/Facción/Mecánica + Limpiar) de un picker y la
// cablea. Los valores salen de `pickState[ctx]` (persisten en sesión) y al cambiar re-filtran.
function buildFilterBar(container, ctx, refresh) {
  const bar = container && container.querySelector(".wr-pfilters"); if (!bar) return;
  const st = pickState[ctx], F = FACETS[ctx] || { fac: [], mech: [] };
  const opts = (pairs, sel, any) => `<option value="">${any}</option>` + pairs.map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");
  bar.innerHTML =
    `<select class="rx-sel wr-pf" data-k="side" aria-label="Lado">${opts(PICK_SIDES, st.side, "Lado")}</select>` +
    `<select class="rx-sel wr-pf" data-k="role" aria-label="Rol">${opts(PICK_ROLES, st.role, "Rol")}</select>` +
    `<select class="rx-sel wr-pf" data-k="fac" aria-label="Facción">${opts(F.fac.map(c => [c, c]), st.fac, "Facción")}</select>` +
    `<select class="rx-sel wr-pf" data-k="mech" aria-label="Mecánica">${opts(F.mech.map(m => [m, m]), st.mech, "Mecánica")}</select>` +
    `<button type="button" class="wr-pclear"${(st.side || st.role || st.fac || st.mech) ? "" : " hidden"}>Limpiar</button>`;
  $$(".wr-pf", bar).forEach(sel => sel.onchange = () => { st[sel.dataset.k] = sel.value; buildFilterBar(container, ctx, refresh); refresh(); });
  const clr = bar.querySelector(".wr-pclear");
  if (clr) clr.onclick = () => { st.side = st.role = st.fac = st.mech = ""; buildFilterBar(container, ctx, refresh); refresh(); };
}
// Cablea un input de búsqueda + su lista a un origen (PICK_ALL/PICK_ROSTER) y un callback de elección.
// Soporta ratón (clic), teclado (↑/↓ resaltan, Enter elige) y filtros avanzados (`ctx`). `container`
// es el `.wr-picker`; si lleva `data-z` (zona) se oculta al salir el foco; el del bloqueo permanece.
function wirePicker(inp, listEl, source, excludeFn, onPick, container, ctx) {
  if (!inp || !listEl) return;
  const hideBox = container && container.hasAttribute && container.hasAttribute("data-z");
  const filters = () => (ctx && pickState[ctx]) || {};
  let items = [], active = -1;
  const firstEnabled = ex => items.findIndex(it => !ex.has(it.id));
  const paint = () => renderPickList(listEl, items, onPick, excludeFn(), active);
  const refresh = () => { items = pickFilter(source, inp.value, filters()); active = firstEnabled(excludeFn()); paint(); };
  const move = dir => {
    const ex = excludeFn(); if (!items.length) return;
    for (let n = 0; n < items.length; n++) { active = (active + dir + items.length) % items.length; if (!ex.has(items[active].id)) break; }
    paint();
    const el = listEl.querySelector(".wr-popt.active");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  };
  if (ctx && container) buildFilterBar(container, ctx, refresh);
  inp.oninput = refresh; inp.onfocus = refresh;
  inp.onkeydown = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (listEl.hidden) refresh(); else move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault(); const ex = excludeFn();
      const pick = (active >= 0 && items[active] && !ex.has(items[active].id)) ? items[active] : items.find(it => !ex.has(it.id));
      if (pick) onPick(pick.id);
    } else if (e.key === "Escape") { listEl.hidden = true; if (hideBox) container.hidden = true; inp.blur(); }
  };
  // Ocultar al salir el foco del picker ENTERO (así interactuar con los selects de filtro no lo cierra).
  if (container) container.onfocusout = () => setTimeout(() => { if (!container.contains(document.activeElement)) { listEl.hidden = true; if (hideBox) container.hidden = true; } }, 120);
  else inp.onblur = () => setTimeout(() => { listEl.hidden = true; }, 150);
}
function scoutWarn(msg) { const w = $("#scout-warn"); if (!w) return; if (!msg) { w.style.display = "none"; return; } w.textContent = msg; w.style.display = "block"; clearTimeout(scoutWarn._t); scoutWarn._t = setTimeout(() => { w.style.display = "none"; }, 4200); }
function persistBoard() { saveBoard({ size: boardState.size, order: boardState.order, teams: boardState.teams }, null); }
function persistLocked() { saveLocked(boardState.locked, null); }

// --- bloqueo (mi defensa fija): se pinta como una mini-holomesa con ranuras circulares ---
function lockRenderChips() {
  const box = $("#lock-chips"); if (!box) return;
  if (!boardState.locked.length) { box.innerHTML = '<div class="wr-lockempty">Sin unidades bloqueadas. Las que añadas aquí no se usarán en ningún counter del tablero.</div>'; return; }
  box.innerHTML = `<div class="wr-slots wr-lockslots">${boardState.locked.map((id, i) => {
    const u = scoutUnit(id);
    return `<div class="wr-slot filled"><button class="wr-lock-rm" data-i="${i}" aria-label="quitar ${u.n}">×</button>${portrait(u)}<span class="wr-slotn">${u.n}</span></div>`;
  }).join("")}</div>`;
  $$("#lock-chips .wr-lock-rm").forEach(b => b.onclick = () => { boardState.locked.splice(+b.dataset.i, 1); persistLocked(); lockRenderChips(); renderBudget(); });
}
function lockAdd(id) {
  if (!id || !ID2U[id]) { scoutWarn("El bloqueo es para unidades de TU roster."); return; }
  if (!boardState.locked.includes(id)) { boardState.locked.push(id); persistLocked(); lockRenderChips(); renderBudget(); }
  const s = $("#lock-search"); if (s) s.value = "";
  const l = $("#lock-plist"); if (l) l.hidden = true;
}

// --- presupuesto de roster ---
function renderBudget() {
  const el = $("#scout-budget"); if (!el) return;
  const plan = boardState.plan;
  const total = RD.R.length, locked = boardState.locked.length;
  const spent = plan ? plan.budget.spentCount : 0;
  const free = total - locked - spent;
  const stat = (v, k, cls) => `<div class="wr-b ${cls || ""}"><b>${v}</b><span>${k}</span></div>`;
  el.innerHTML = stat(total, "roster", "") + stat(locked, "en defensa", locked ? "lock" : "") + stat(spent, "gastados", spent ? "spent" : "") + stat(Math.max(0, free), "libres", free < 0 ? "alert" : "ok");
}

// --- tablero de equipos enemigos ---
function boardCanRemove() { return boardState.teams.length > 2; }
function zoneEnemyBuilder(z, i) {
  const size = boardState.size;
  let slots = "";
  for (let k = 0; k < size; k++) {
    const id = z.defenseIds[k];
    if (id) {
      const u = scoutUnit(id);
      slots += `<div class="wr-slot filled">${portrait(u)}<button class="wr-def-rm" data-z="${i}" data-k="${k}" aria-label="quitar ${u.n}">×</button><span class="wr-slotn">${u.n}</span></div>`;
    } else {
      slots += `<button type="button" class="wr-slot empty" data-z="${i}" aria-label="añadir defensor">+</button>`;
    }
  }
  const full = z.defenseIds.length >= size;
  return `<div class="wr-enemy">
     <div class="wr-zlabel">Defensa enemiga <span class="wr-count">${z.defenseIds.length}/${size}</span></div>
     <div class="wr-slots" style="--slots:${size}">${slots}</div>
     ${full ? "" : `<div class="wr-picker" data-z="${i}" hidden><div class="wr-pfilters"></div><input class="rx-in wr-psearch" data-z="${i}" type="text" placeholder="🔎 Buscar defensor…" autocomplete="off"><div class="wr-plist" data-z="${i}" hidden></div></div>`}
   </div>`;
}
function zoneCounter(i) {
  const plan = boardState.plan; if (!plan || !plan.results[i]) return "";
  const res = plan.results[i], sc = res.scout, H = sc.heuristic;
  if (!res.defenseIds.length) return '<div class="wr-mine"><div class="cq-empty">Sin defensa en esta zona.</div></div>';
  if (!H || !H.team.length) return '<div class="wr-mine"><div class="simwarn">Sin unidades libres para esta zona (presupuesto agotado).</div></div>';
  const chip = (t, l) => `<span class="rc rc-${t}">${l}</span>`;
  const band = H.score >= 72 ? "hi" : H.score >= 50 ? "mid" : "lo";
  const ctx = { reqTags: null, forcedIds: [], needs: sc.needs };
  const threatChips = sc.threats.length ? sc.threats.map(t => chip("need", THREAT_ES[t] || t)).join("") : chip("gap", "sin amenazas claras");
  const cur = sc.archetype && sc.curated[0]
    ? `<div class="wr-cur">📋 <b>${sc.archetype.label}</b> · confianza ${sc.archetype.confidence} — ${sc.curated[0].note}</div>` : "";
  const neut = sc.neutralized.length ? sc.neutralized.map(n => `${THREAT_ES[n.threat] || n.threat}`).join(" · ") : "—";
  const shortNote = res.shortfall ? '<div class="simwarn">Presupuesto justo: este counter salió incompleto (unidades ya gastadas en otras zonas).</div>' : "";
  return `<div class="wr-mine">
     <div class="simhead"><div class="sq">Amenazas: ${threatChips}</div><div class="synergy ${band}"><b>${H.score}</b><span>SINERGIA</span></div></div>
     ${cur}
     ${H.team.map((u, k) => teamRow(u, k, H, ctx, false)).join("")}
     <div class="coverage"><span class="cv-h">Neutraliza</span>${sc.neutralized.length ? sc.neutralized.map(n => chip("need", THREAT_ES[n.threat] || n.threat)).join("") : chip("gap", "—")}${sc.missing.length ? `<span class="cv-h">Sin cubrir</span>${sc.missing.map(t => chip("gap", THREAT_ES[t] || t)).join("")}` : ""}</div>
     ${shortNote}</div>`;
}
function renderBoard() {
  const wrap = $("#scout-board"); if (!wrap) return;
  wrap.innerHTML = boardState.teams.map((z, i) =>
    `<div class="wr-zone" data-z="${i}">
       <div class="wr-zhead"><span class="wr-zn">Zona ${i + 1}</span>${boardCanRemove() ? `<button class="wr-rmteam" data-z="${i}" aria-label="quitar zona">× quitar</button>` : ""}</div>
       ${zoneEnemyBuilder(z, i)}
       ${zoneCounter(i)}
     </div>`).join("");
  // Wiring por delegación tras cada render: cada zona lleva su selector con avatares (oculto hasta
  // que se pulsa un hueco vacío, como el "Edit Defenses" del juego).
  $$(".wr-picker", wrap).forEach(pk => {
    const z = +pk.dataset.z, inp = pk.querySelector(".wr-psearch"), listEl = pk.querySelector(".wr-plist");
    wirePicker(inp, listEl, PICK_ALL, () => new Set(boardState.teams[z].defenseIds), id => defenderAdd(z, id), pk, "all");
  });
  $$(".wr-slot.empty", wrap).forEach(b => b.onclick = () => {
    const z = +b.dataset.z, pk = wrap.querySelector(`.wr-picker[data-z="${z}"]`);
    if (pk) { pk.hidden = false; const inp = pk.querySelector(".wr-psearch"); if (inp) inp.focus(); }
  });
  $$(".wr-def-rm", wrap).forEach(b => b.onclick = () => { boardState.teams[+b.dataset.z].defenseIds.splice(+b.dataset.k, 1); persistBoard(); renderBoard(); });
  $$(".wr-rmteam", wrap).forEach(b => b.onclick = () => { if (boardCanRemove()) { boardState.teams.splice(+b.dataset.z, 1); boardState.plan = null; persistBoard(); renderBoard(); renderBudget(); } });
  renderBudget();
}
function defenderAdd(z, id) {
  if (!id) return;
  const team = boardState.teams[z]; if (!team) return;
  if (team.defenseIds.length >= boardState.size) { scoutWarn(`Máximo ${boardState.size} en ${boardState.size}v${boardState.size}.`); return; }
  if (team.defenseIds.includes(id)) return;
  team.defenseIds.push(id); persistBoard(); renderBoard();
}
function boardAddTeam() {
  if (boardState.teams.length >= 6) { scoutWarn("Máximo 6 equipos enemigos en el tablero."); return; }
  boardState.teams.push({ defenseIds: [] }); persistBoard(); renderBoard();
}
function boardSetSize(n) {
  boardState.size = n;
  boardState.teams.forEach(t => { if (t.defenseIds.length > n) t.defenseIds = t.defenseIds.slice(0, n); });
  boardState.plan = null;
  $$("#scout-size button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === n)));
  persistBoard(); renderBoard();
}
function boardSetOrder(o) {
  boardState.order = o;
  $$("#scout-order button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.o === o)));
  persistBoard();
  if (boardState.plan) boardGenerate();
}
function boardGenerate() {
  const filled = boardState.teams.filter(t => t.defenseIds.length).length;
  if (!filled) { scoutWarn("Añade defensores a al menos una zona antes de generar el plan."); return; }
  boardState.plan = genBoard({ enemyTeams: boardState.teams, roster: RD, meta: META, counterDb: COUNTER_DB, assemble, size: boardState.size, lockedIds: boardState.locked, order: boardState.order });
  scoutWarn(""); renderBoard();
}
function boardReset() {
  boardState.teams = [{ defenseIds: [] }, { defenseIds: [] }];
  boardState.plan = null;
  clearBoard(null);
  renderBoard();
}
function cxSetMode(m) {
  const scout = $("#cx-scout"), board = $("#cx-board"); if (!scout || !board) return;
  scout.style.display = m === "scout" ? "" : "none";
  board.style.display = m === "board" ? "" : "none";
  $$("#cx-mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
  const cc = $("#cx-count");
  if (cc) cc.textContent = m === "scout" ? "War Room: monta el tablero enemigo y reparte tu roster" : `${ENEMIES.length} defensas del meta · pulsa para generar tu counter`;
}

// ===== Pestaña Progreso: línea temporal + Vader auto-marcado + comparativa de gremio =====
const fmtDate = ts => { try { return new Date(ts).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return String(ts || ""); } };
const VST = { completada: ["ok", "Completada"], "en curso": ["cur", "En curso"], pendiente: ["pend", "Pendiente"], manual: ["man", "Manual"] };
let pgLvpct = 0;

function renderProgress() {
  // --- Bloque 1: línea temporal (fallback si no hay histórico) ---
  const tl = $("#pg-timeline"), view = progressView(PROGRESS);
  const nSnap = (PROGRESS.snapshots && PROGRESS.snapshots.length) || 0;
  if (view.empty) {
    tl.innerHTML = `<div class="pg-empty">${view.reason}</div>`;
    $("#pg-tlnote").textContent = nSnap <= 1 ? `${nSnap} snapshot registrado` : `${nSnap} snapshots · sin cambios aún`;
  } else {
    tl.innerHTML = view.events.map(ev => {
      const parts = eventHeadline(ev), head = parts.length ? parts.join(" · ") : "Cambios menores";
      const changes = sortedUnitChanges(ev.units).filter(u => u.kind !== "power"); // detalle sin ruido de power
      const detail = changes.length ? `<details class="pg-detail"><summary>${changes.length} ${changes.length === 1 ? "cambio" : "cambios"} en unidades</summary>
       <div class="pg-changes">${changes.map(u => `<div class="pg-ch">${portrait(lookupByName(u.n))}<span class="cn">${u.n}</span><span class="cd">${unitChangeText(u)}</span></div>`).join("")}</div></details>` : "";
      return `<div class="pg-ev"><div class="pg-ev-h"><span class="pg-date">${fmtDate(ev.ts)}</span><span class="pg-head">${head}</span></div>${detail}</div>`;
    }).join("");
    $("#pg-tlnote").textContent = `${view.events.length} ${view.events.length === 1 ? "evento" : "eventos"}`;
  }

  // --- Bloque 2: roadmap de Vader auto-marcado (cruce con el RD en vivo) ---
  const vp = vaderProgress(RD); pgLvpct = vp.pct;
  $("#pgv-facts").innerHTML = [
    { v: `${vp.unitsDone}/${vp.unitsTotal}`, k: "unidades en su relic objetivo", cls: vp.unitsDone === vp.unitsTotal ? "zero" : "" },
    { v: `${vp.pct}%`, k: "relic acumulado", cls: "" },
    { v: `${vp.phases.filter(p => p.state === "completada").length}/${vp.phases.length}`, k: "fases completadas", cls: "" },
    { v: vp.vaderUnlocked ? "✓" : "—", k: "Lord Vader desbloqueado", cls: vp.vaderUnlocked ? "zero" : "alert" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  $("#pg-vader").innerHTML = vp.phases.map(p => {
    const [cls, lbl] = VST[p.state] || VST.manual;
    const prog = p.total ? ` <span class="pgv-frac">${p.done}/${p.total}</span>` : "";
    const targets = (p.targets || []).map(t =>
      `<div class="pgv-t ${t.done ? "done" : ""}"><span class="tn">${t.done ? "✓" : "○"} ${t.name}</span><span class="tr">R${t.current} / R${t.target}</span></div>`).join("");
    return `<div class="pgv-ph"><div class="pgv-ph-h"><div class="pgv-ph-t"><span class="wk">${p.weeks || "Fase " + String(p.n).padStart(2, "0")}</span><h4>${p.title}</h4></div>
     <span class="pgv-badge ${cls}">${lbl}${prog}</span></div>${targets ? `<div class="pgv-ts">${targets}</div>` : ""}</div>`;
  }).join("");

  // --- Bloque 3: comparativa de gremio (oculta con aviso suave si no hay datos) ---
  const card = $("#pg-guild-card"), box = $("#pg-guild"), gnote = $("#pg-gnote");
  const gr = guildRanking(GUILD, DATA.player.ally);
  if (!gr) {
    card.classList.add("soft"); gnote.textContent = "sin datos";
    box.innerHTML = `<div class="pg-empty soft">Aún no hay datos de gremio. Se poblarán en la próxima ingesta.</div>`;
  } else {
    card.classList.remove("soft");
    const pos = gr.myIndex >= 0 ? gr.myIndex + 1 : null;
    gnote.textContent = gr.name + (pos ? ` · Yusepi ${pos}/${gr.memberCount} por GP` : "");
    const rows = gr.members.map((m, i) => {
      const me = i === gr.myIndex;
      return `<div class="pg-grow ${me ? "me" : ""}"><span class="gr-rk">${i + 1}</span>${portrait(lookupByName(m.name))}
       <span class="gr-nm">${m.name}${me ? ' <b class="gr-you">TÚ</b>' : ""}</span><span class="gr-gp">${(m.gp / 1e6).toFixed(2)}M</span></div>`;
    }).join("");
    box.innerHTML = `<div class="pg-grid">${rows}</div>
     <div class="simfoot">Ranking por GP (dato real de swgoh.gg). El recuento de Leyendas Galácticas y el rango de arena por miembro no vienen en el perfil de gremio de la API: se omiten en vez de estimarlos.</div>`;
  }
}

function animatePgRing() {
  const r = $("#pgv-ring"); if (!r) return;
  if (rm) { r.style.setProperty("--p", pgLvpct); $("#pgv-pct").textContent = pgLvpct + "%"; return; }
  const t0 = performance.now(); (function step(t) { const k = Math.min(1, (t - t0) / 1000), e = 1 - Math.pow(1 - k, 3), c = Math.round(pgLvpct * e); r.style.setProperty("--p", c); $("#pgv-pct").textContent = c + "%"; if (k < 1) requestAnimationFrame(step); })(t0);
}

// ===== Defensa de Territory War (Fase 4.4): tus escuadrones sin solapar por zonas =====
const twFmt = { zones: 4, perZone: 5, size: 5 };
function renderTW() {
  const listEl = $("#tw-list"); if (!listEl) return;
  const p = planTWDefense(RD, { zones: twFmt.zones, perZone: twFmt.perZone, size: twFmt.size, assemble });
  const gr = guildRanking(GUILD, DATA.player.ally);
  const rankStat = gr && gr.myIndex >= 0 ? { v: `${gr.myIndex + 1}/${gr.memberCount}`, k: "tu GP en el gremio", cls: "" } : { v: "—", k: "gremio (sin datos)", cls: "" };
  const st = $("#tw-stats");
  if (st) st.innerHTML = [
    { v: `${p.built}/${p.totalWanted}`, k: "escuadrones montados", cls: p.ranOut ? "alert" : "zero" },
    { v: `${p.usedCount}/${p.poolTotal}`, k: "unidades usadas", cls: "" },
    { v: p.zones.length, k: "zonas", cls: "" },
    rankStat,
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  listEl.innerHTML = p.zones.map(z => {
    const squads = z.squads.map((R, si) => {
      const ctx = { reqTags: null, forcedIds: [], needs: null };
      const band = R.score >= 72 ? "hi" : R.score >= 50 ? "mid" : "lo";
      return `<div class="tw-squad"><div class="tw-sh"><span class="tw-sn">Defensa ${si + 1}</span><span class="synergy ${band}"><b>${R.score}</b><span>SIN.</span></span></div>
       ${R.team.map((u, i) => teamRow(u, i, R, ctx, false)).join("")}</div>`;
    }).join("");
    return `<div class="card tw-zone"><div class="head"><h3>Zona ${z.i + 1}</h3><span class="note">${z.squads.length} defensa(s)</span></div>
     ${squads || '<div class="pg-empty">Sin unidades libres para esta zona.</div>'}</div>`;
  }).join("");
  if (p.ranOut) listEl.insertAdjacentHTML("beforeend", `<div class="simwarn">Tu roster no da para ${p.totalWanted} escuadrones de ${twFmt.size}: montados ${p.built}. Baja zonas/defensas o el tamaño.</div>`);
}
function twSetSize(n) { twFmt.size = n; $$("#tw-size button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === n))); saveTW(twFmt, null); renderTW(); }

// ===== Fleet Arena (Fase 4.3): flotas montables + arranque + crew =====
let FLEET = { owned: SHIPS_EMBED, live: false };
const fleetFilter = { side: "", tier: "" };
const shipUnit = id => { const m = SHIP_META[id]; return m ? { n: m.n, s: m.s, im: m.im } : lookupByName(id); };
const shipName = id => (SHIP_META[id] && SHIP_META[id].n) || id;
function fleetCard(f) {
  const stx = f.status === 2 ? ["ok", "✓ Montable"] : f.status === 1 ? ["mid", "Casi · faltan " + f.missing.length] : ["lo", "Bloqueada"];
  const ship = s => `<span class="fl-ship ${s.owned7 ? "have" : "miss"}${s.capital ? " cap" : ""}" title="${s.name}${s.owned7 ? "" : " — no a 7★"}">${portrait(shipUnit(s.id))}<span class="fl-sn">${s.name}</span></span>`;
  const crew = f.crew.map(c => `<span class="rc ${c.ready ? "rc-need" : "rc-gap"}" title="${c.owned ? `R${c.relic}·G${c.gear}` : "no lo tienes"}">${c.name}${c.owned ? ` R${c.relic}` : " ✗"}</span>`).join("");
  return `<div class="card fleet-card st-${f.status}"><div class="head"><h3>${f.label}</h3><span class="fl-badge ${stx[0]}">${stx[1]} · Tier ${f.tier}</span></div>
   <div class="fl-ships">${f.ships.map(ship).join("")}</div>
   <div class="fl-opener">${f.opener}</div>
   <div class="coverage"><span class="cv-h">Crew (pilotos)</span>${crew || '<span class="cq-empty">—</span>'}</div>
   ${f.missing.length ? `<div class="simwarn">Faltan a 7★: ${f.missing.map(shipName).join(", ")}</div>` : ""}
   <div class="simfoot">${f.source}</div></div>`;
}
function renderFleet() {
  const listEl = $("#fleet-list"); if (!listEl) return;
  const plan = planFleet({ owned: FLEET.owned, shipMeta: SHIP_META, roster: RD, fleetDb: FLEET_DB });
  const owned7 = FLEET.owned.filter(o => o.t === 7).length;
  const ownedCaps = FLEET.owned.filter(o => o.t === 7 && SHIP_META[o.i] && SHIP_META[o.i].cap).length;
  const fieldable = plan.filter(f => f.canField).length;
  const src = $("#fleet-src"); if (src) src.textContent = (FLEET.live ? "En vivo" : "Snapshot embebido") + ` · ${owned7} naves 7★`;
  const st = $("#fleet-stats");
  if (st) st.innerHTML = [
    { v: fieldable, k: "flotas montables", cls: "zero" },
    { v: ownedCaps, k: "capitales a 7★", cls: "" },
    { v: owned7, k: "naves a 7★", cls: "" },
    { v: plan.length, k: "flotas meta", cls: "" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  const filtered = plan.filter(f => (!fleetFilter.tier || f.tier === fleetFilter.tier) && (!fleetFilter.side || (SHIP_META[f.capital] && SHIP_META[f.capital].s === fleetFilter.side)));
  listEl.innerHTML = filtered.map(fleetCard).join("") || '<div class="pg-empty">Ninguna flota con esos filtros.</div>';
}

// ===== Planificador de datacrones (Fase 4.5): guía CURADA evergreen × roster en vivo =====
const dcFilter = { mode: "", fac: "" };
function dcCard(p) {
  const tgt = { n: p.targetName, s: p.side, im: (META[p.target] && META[p.target].im) || (ID2U[p.target] && ID2U[p.target].im) || null };
  const own = p.targetOwned
    ? `<span class="rc rc-need" title="lo tienes">✓ ${p.targetName} R${p.relic}·G${p.gear}</span>`
    : `<span class="rc rc-gap" title="no lo tienes">✗ ${p.targetName} — no lo tienes</span>`;
  const modes = (p.modes || []).map(m => `<span class="rc rc-mech">${m}</span>`).join("");
  return `<div class="card dc-card st-${p.usable ? 2 : 0}"><div class="head"><h3>${p.label}</h3><span class="fl-badge ${p.usable ? "ok" : "lo"}">${p.usable ? "✓ Aprovechable" : "Sin squad/target"} · Tier ${p.tier}</span></div>
   <div class="dc-chain">
     <span class="dc-step"><span class="dc-lv">L3</span><span class="dc-tx">${SIDES[p.align] || p.align}</span></span>
     <span class="dc-arrow">→</span>
     <span class="dc-step"><span class="dc-lv">L6</span><span class="dc-tx">${p.faction} <small>(tienes ${p.factionCount})</small></span></span>
     <span class="dc-arrow">→</span>
     <span class="dc-step tgt">${portrait(tgt)}<span class="dc-lv">L9</span><span class="dc-tx">${p.targetName}</span></span>
   </div>
   <div class="dc-bonus"><b>L6 · ${p.faction}:</b> ${p.l6}</div>
   <div class="dc-bonus"><b>L9 · ${p.targetName}:</b> ${p.l9}</div>
   <div class="coverage"><span class="cv-h">Objetivo</span>${own}${modes}</div>
   <div class="dc-note">${p.note}</div>
   <div class="simfoot">${p.source}</div></div>`;
}
function renderDatacrons() {
  const listEl = $("#dc-list"); if (!listEl) return;
  const plan = planDatacrons({ roster: RD, datacronDb: DATACRON_DB, meta: META });
  const usable = plan.paths.filter(p => p.usable).length;
  const src = $("#dc-src"); if (src) src.textContent = `guía curada${plan.updated ? " · " + plan.updated : ""} · 0 datacrones`;
  // Rellena el select de facción con las facciones presentes en la guía (una vez).
  const sel = $("#dc-fac");
  if (sel && sel.options.length <= 1) {
    const facs = [...new Set(plan.paths.map(p => p.faction))].sort();
    sel.insertAdjacentHTML("beforeend", facs.map(f => `<option value="${f}">${f}</option>`).join(""));
  }
  const filtered = plan.paths.filter(p =>
    (!dcFilter.mode || (p.modes || []).includes(dcFilter.mode)) &&
    (!dcFilter.fac || p.faction === dcFilter.fac));
  const head = `<div class="statgrid"><div class="stat zero"><div class="v">${usable}</div><div class="k">rutas aprovechables</div></div><div class="stat"><div class="v">${plan.paths.length}</div><div class="k">rutas en la guía</div></div><div class="stat"><div class="v">0</div><div class="k">datacrones que tienes</div></div></div>`;
  listEl.innerHTML = head + (filtered.map(dcCard).join("") || '<div class="pg-empty">Ninguna ruta con esos filtros.</div>');
}

// ===== Ascensión (Fase 4.6): objetivo configurable + planificador de energía por objetivo =====
let vpEnergy = 480;             // energía diaria para gear (persistida en localStorage)
let ascTargetId = "LORDVADER";  // objetivo activo (persistido); default Lord Vader
const ascFilter = { q: "", tier: "" };
// Roadmap semanal CURADO por objetivo: solo donde ya existe (Vader = DATA.plan). No se autogenera.
const ASC_SEED_PLAN = { LORDVADER: DATA.plan };
const TIER_ES = { galactic_legend: "Galactic Legend", legendary: "Legendary", journey: "Journey" };
const ascTargets = () => (UNLOCK_DB.targets || []);
const ascActive = () => resolveTarget(UNLOCK_DB, ascTargetId);

// Planificador de energía → desbloqueo, para el OBJETIVO activo (antes fijo a Vader).
function renderVaderPlan() {
  const listEl = $("#vp-list"); if (!listEl) return;
  const target = ascActive(); if (!target) return;
  const res = planFor(RD, target, { dailyGearEnergy: vpEnergy });
  const p = { units: res.units, order: res.order, totals: res.totals }, t = p.totals, doneN = p.units.filter(u => u.done).length;
  const st = $("#vp-stats");
  if (st) st.innerHTML = [
    { v: t.relicGap, k: "niveles de relic que faltan", cls: t.relicGap ? "alert" : "" },
    { v: t.gearGap, k: "niveles de gear que faltan", cls: "" },
    { v: t.weeks, k: "semanas estimadas (ETA)", cls: "zero" },
    { v: `${doneN}/${p.units.length}`, k: "unidades ya en objetivo", cls: doneN === p.units.length ? "zero" : "" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  listEl.innerHTML = p.order.map(u => {
    const need = u.done ? '<span class="badge ok">✓ lista</span>'
      : `${u.relicGap ? `<span class="rc rc-need">R+${u.relicGap}</span>` : ""}${u.gearGap ? `<span class="rc rc-gap">G+${u.gearGap}</span>` : ""}`;
    return `<div class="trow vp-row ${u.done ? "done" : ""}">${portrait(lookupByName(u.name))}<div class="who"><div class="nm">${u.name} <span class="r">R${u.curRelic}·G${u.curGear}</span></div>
     <div class="tip">objetivo R${u.tgtRelic}·G${u.tgtGear} · ${need}</div></div>
     <div class="spd"><div class="cur ${u.done ? "hit" : ""}">${u.done ? "✓" : u.days + "d"}</div><div class="tg">${u.done ? "" : "~" + Math.max(1, Math.ceil(u.days / 7)) + " sem"}</div></div></div>`;
  }).join("");
  const note = $("#vp-note"); if (note) note.textContent = `ETA ≈ ${t.weeks} semanas @ ${t.dailyGearEnergy} energía/día`;
}

// Selector de objetivo (reutiliza portrait + estética del picker). Lista clicable con avatar.
function renderTargetPicker() {
  const listEl = $("#asc-list"); if (!listEl) return;
  const owned = new Set(RD.R.map(u => u.i));
  const items = ascTargets().filter(t => (!ascFilter.tier || t.tier === ascFilter.tier) && (!ascFilter.q || t.name.toLowerCase().includes(ascFilter.q)));
  listEl.innerHTML = items.map(t => {
    const sel = t.id === ascTargetId ? " sel" : "";
    const has = owned.has(t.id) ? '<span class="rc rc-need">✓ desbloqueado</span>' : "";
    return `<button class="asc-opt${sel}" data-id="${t.id}">${portrait(lookupByName(t.name))}<span class="asc-on"><span class="asc-nm">${t.name}</span><span class="asc-meta">${TIER_ES[t.tier] || t.tier}${has}</span></span></button>`;
  }).join("") || '<div class="pg-empty">Sin objetivos con ese filtro.</div>';
  $$("#asc-list .asc-opt").forEach(b => b.onclick = () => ascSelect(b.dataset.id));
}

function ascSelect(id) {
  ascTargetId = id; saveTarget(id, null);
  renderTargetPicker(); renderAscension();
  if ($("#farm-queue")) renderMejoras(); // refresca "objetivo actual" + Top 5 derivado
  ringDone = false; animateRing();
}

// Pinta toda la pestaña Ascensión para el objetivo activo (anillo/hechos/nave/planificador/roadmap/plan).
function renderAscension() {
  const target = ascActive(); if (!target) return;
  ascTargetId = target.id;
  const seed = ASC_SEED_PLAN[target.id] || [];
  const res = planFor(RD, target, { dailyGearEnergy: vpEnergy, plan: seed });
  const prog = res.progress, t = res.totals;
  if ($("#asc-title")) $("#asc-title").textContent = "Protocolo de ascensión — " + target.name;
  if ($("#asc-src")) $("#asc-src").textContent = (t && t.unlocked) ? "✓ ya desbloqueado en tu roster" : "objetivo configurable · curado";
  lvpct = prog ? prog.pct : 0;
  const doneN = prog ? prog.unitsDone : 0, totN = prog ? prog.unitsTotal : 0;
  $("#lvfacts").innerHTML = [
    { v: `${doneN}/${totN}`, k: "unidades ya en objetivo", cls: (totN && doneN === totN) ? "zero" : "" },
    { v: t ? t.relicGap : 0, k: "niveles de relic que faltan", cls: (t && t.relicGap) ? "alert" : "" },
    { v: t ? t.gearGap : 0, k: "niveles de gear que faltan", cls: "" },
    { v: t && t.unlocked ? "✓" : totN, k: t && t.unlocked ? "desbloqueado" : "unidades requisito", cls: "zero" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  const ship = target.ship;
  $("#shipnote").innerHTML = ship
    ? `<span class="badge ok">★</span> Nave <b style="color:var(--text)">${ship.name}</b> requerida a ${ship.stars || 7}★. Estás al <b style="color:var(--text)">${lvpct}%</b> del relic necesario.`
    : `Estás al <b style="color:var(--text)">${lvpct}%</b> del relic necesario para <b style="color:var(--text)">${target.name}</b>.`;
  renderVaderPlan();
  renderRoadmap(seed);
  renderAscPlanEditor(target);
}

// Roadmap semanal CURADO (solo si el objetivo trae seed). Nunca autogenera.
function renderRoadmap(seedPlan) {
  const tl = $("#tl"); if (!tl) return;
  if (!seedPlan || !seedPlan.length) {
    tl.innerHTML = '<div class="pg-empty soft">Sin roadmap curado para este objetivo. Usa el planificador de energía (arriba) y el plan semanal editable (abajo).</div>';
    if ($("#rmnote")) $("#rmnote").textContent = "sin roadmap curado";
    return;
  }
  if ($("#rmnote")) $("#rmnote").textContent = DATA.plan_total_relic + " niveles de relic · ~5 meses F2P (estimado)";
  const tones = { arena: "var(--holo)", relic: "var(--ember)", gear: "var(--gold)", unlock: "var(--green)" };
  const kindlabel = { arena: "ARENA", relic: "RELIC", gear: "GEAR + RELIC", unlock: "EVENTO" };
  tl.innerHTML = seedPlan.map(p => {
    const tone = tones[p.kind];
    const targets = (p.targets || []).map(t => {
      const pf = Math.round(t.from / t.to * 100), gn = t.gearneed > 0 ? `<span class="gn">G${t.gear}→13</span>` : "";
      return `<div class="tg" style="--tone:${tone}"><div class="nm">${portrait(lookupByName(t.name))}<span>${t.name}${gn}</span></div>
     <div class="rmeter" data-p="${pf}"><i></i></div>
     <div class="rr"><span class="a">R${t.from}</span><span class="b"> → R${t.to}</span></div></div>`;
    }).join("");
    const tasks = `<ul class="tasks" style="--tone:${tone}">${p.tasks.map(x => `<li>${x}</li>`).join("")}</ul>`;
    return `<div class="node" style="--tone:${tone}"><div class="ndot"></div><div class="pcard">
   <div class="ptop" style="--tone:${tone}"><div><div class="wk">${p.weeks} · Fase ${String(p.n).padStart(2, "0")}</div>
   <h4>${p.title}</h4><div class="goal">${p.goal}</div></div><span class="kind" style="--tone:${tone}">${kindlabel[p.kind]}</span></div>
   <div class="pbody">${targets ? `<div class="targets">${targets}</div>` : ""}${tasks}
   <div class="check" style="--tone:${tone}"><span class="cl">Checkpoint</span><span>${p.check}</span></div></div></div></div>`;
  }).join("");
}

// Plan semanal EDITABLE por objetivo (persistido en este navegador). No autogenera nada.
function renderAscPlanEditor(target) {
  const ta = $("#asc-plan"); if (!ta) return;
  const saved = loadPlan(target.id, null);
  ta.value = saved || "";
  const st = $("#asc-plan-status"); if (st) st.textContent = saved ? "guardado en este navegador" : "vacío · escribe tu plan";
  const reset = $("#asc-plan-reset"); if (reset) reset.hidden = true; // no hay seeds de texto (Vader usa el roadmap)
}

// ===== Galactic Legends (Fase 4.6): derivada de unlock_db + roster (antes hardcodeada) =====
function glGap(t, byName) {
  return (t.units || []).reduce((s, u) => {
    const l = byName.get(u.name); const cr = l ? l.rl : 0, cg = l ? l.g : 0;
    return s + Math.max(0, (u.relic || 0) - cr) + Math.max(0, (u.gear != null ? u.gear : 13) - cg);
  }, 0);
}
function renderGL() {
  if (!$("#glowned")) return;
  const gls = ascTargets().filter(t => t.tier === "galactic_legend");
  const ownedU = new Map(RD.R.map(u => [u.i, u]));
  const byName = new Map(RD.R.map(u => [u.n, u]));
  const owned = gls.filter(t => ownedU.has(t.id));
  const missing = gls.filter(t => !ownedU.has(t.id)).map(t => ({ t, gap: glGap(t, byName) })).sort((a, b) => a.gap - b.gap);
  $("#glcount").textContent = owned.length + " de " + gls.length + " desbloqueados";
  $("#glowned").innerHTML = owned.map(t => {
    const u = ownedU.get(t.id); const rp = Math.round((u.rl || 0) / 9 * 100);
    return `<div class="glcard"><div class="glhead">${portrait(lookupByName(t.name))}<div class="ab">${t.short || t.name}</div></div><div class="full">${t.name}</div>
   <div class="rl"><span>RELIC</span><b>R${u.rl}</b></div><div class="meter" data-pct="${rp}" style="--tone:var(--gold)"><i></i></div>
   <div class="sp">‹ G${u.g} · ${(u.p / 1000).toFixed(0)}k GP</div></div>`;
  }).join("") || '<div class="pg-empty">Aún no tienes Galactic Legends del catálogo.</div>';
  $("#glmissing").innerHTML = missing.map(({ t, gap }, i) => {
    const pill = i === 0 ? '<span class="pill next">PRÓXIMO</span>' : i === 1 ? '<span class="pill medium">SIGUIENTE</span>' : '<span class="pill far">LEJANO</span>';
    const conf = t.notes ? " · requisitos por confirmar" : "";
    return `<div class="glcard missing ${i === 0 ? "next" : ""}">${pill}<div class="glhead">${portrait(lookupByName(t.name))}<div class="ab">${t.short || t.name}</div></div><div class="full">${t.faction || ""}</div><div class="tagline">Gap total ${gap} (relic+gear)${conf}</div></div>`;
  }).join("") || '<div class="pg-empty">Tienes todos los GL del catálogo.</div>';
  // Huecos de roster: unidades requisito de los 2 GL más cercanos, cruzadas con el roster.
  const gapRows = t => (t.units || []).map(u => {
    const l = byName.get(u.name);
    const st = l ? `<span class="s has">${l.t || 7}★ · G${l.g} · R${l.rl}</span>` : '<span class="s miss">no lo tienes</span>';
    return `<div class="gaprow"><span class="gpname">${portrait(lookupByName(u.name))}${u.name}</span>${st}</div>`;
  }).join("");
  const g1 = missing[0] && missing[0].t, g2 = missing[1] && missing[1].t;
  if ($("#gap1title")) $("#gap1title").textContent = g1 ? g1.name + " — unidades requisito" : "—";
  if ($("#gap2title")) $("#gap2title").textContent = g2 ? g2.name + " — unidades requisito" : "—";
  if ($("#gapAhsoka")) $("#gapAhsoka").innerHTML = g1 ? gapRows(g1) : "";
  if ($("#gapHondo")) $("#gapHondo").innerHTML = g2 ? gapRows(g2) : "";
}

// ===== Mejoras (Fase 4.7): hub de prioridades — tablero de tiers + cola + Top 5 derivado =====
const TIER_LABEL = { journey: "Journeys", legendary: "Legendaries", galactic_legend: "Galactic Legends" };
let ascPrios = null;   // orden de tiers (persistido); null = por defecto TIER_ORDER
let ascPins = [];      // objetivos fijados al frente de la cola (persistido)

function renderPrioBoard() {
  const el = $("#prio-board"); if (!el) return;
  const order = ascPrios || TIER_ORDER;
  el.innerHTML = order.map((tier, i) => `<div class="prio-tier" data-tier="${tier}">
    <span class="prio-rank">P${i + 1}</span><span class="prio-name">${TIER_LABEL[tier] || tier}</span>
    <span class="prio-move"><button class="prio-up" data-i="${i}" ${i === 0 ? "disabled" : ""}>▲</button><button class="prio-dn" data-i="${i}" ${i === order.length - 1 ? "disabled" : ""}>▼</button></span></div>`).join("");
  $$("#prio-board .prio-up").forEach(b => b.onclick = () => prioMove(+b.dataset.i, -1));
  $$("#prio-board .prio-dn").forEach(b => b.onclick = () => prioMove(+b.dataset.i, +1));
}
function prioMove(i, d) {
  const o = (ascPrios || TIER_ORDER).slice(); const j = i + d;
  if (j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]];
  ascPrios = o; savePrios(o, null);
  renderPrioBoard(); renderFarmQueue();
}
function ascPinToggle(id) {
  const s = new Set(ascPins); s.has(id) ? s.delete(id) : s.add(id);
  ascPins = [...s]; savePins(ascPins, null); renderFarmQueue();
}
function renderFarmQueue() {
  const el = $("#farm-queue"); if (!el) return;
  const q = priorityQueue(UNLOCK_DB, ascPrios || TIER_ORDER, RD, { pins: ascPins });
  const active = ascActive();
  const rows = [];
  for (const { tier, items } of q) {
    rows.push(`<div class="fq-tier"><span class="fq-tl">${TIER_LABEL[tier] || tier}</span>${tier === "galactic_legend" ? '<span class="fq-hint">uno a la vez</span>' : ""}</div>`);
    if (!items.length) { rows.push('<div class="pg-empty soft">Todo desbloqueado en este tier.</div>'); continue; }
    for (const it of items) {
      const isActive = active && active.id === it.id;
      rows.push(`<div class="fq-item ${isActive ? "active" : ""}">${portrait(lookupByName(it.name))}
       <div class="fq-mid"><div class="fq-nm">${it.name}${it.pinned ? ' <span class="rc rc-need">📌 fijado</span>' : ""}${isActive ? ' <span class="rc rc-mech">objetivo actual</span>' : ""}</div>
        <div class="fq-meta">${it.pct}% listo · faltan ${it.unitsMissing} unidades · gap ${it.gapTotal}</div></div>
       <div class="fq-act"><button class="fq-pin" data-id="${it.id}" title="Fijar / soltar">${it.pinned ? "📌" : "📍"}</button><button class="fq-go" data-id="${it.id}" title="Ir al objetivo">→</button></div></div>`);
    }
  }
  el.innerHTML = rows.join("") || '<div class="pg-empty">Sin objetivos pendientes en el catálogo.</div>';
  $$("#farm-queue .fq-pin").forEach(b => b.onclick = () => ascPinToggle(b.dataset.id));
  $$("#farm-queue .fq-go").forEach(b => b.onclick = () => { ascSelect(b.dataset.id); const t = $('.tab[data-p="vader"]'); if (t) t.click(); });
}
function renderProposalsDerived() {
  const el = $("#props"); if (!el) return;
  const target = ascActive();
  const res = target ? planFor(RD, target, { dailyGearEnergy: vpEnergy }) : null;
  let fleetFieldable = 0, dc = 0;
  try { fleetFieldable = planFleet({ owned: (FLEET && FLEET.owned) || [], shipMeta: SHIP_META, roster: RD, fleetDb: FLEET_DB }).filter(f => f.canField).length; } catch { /* noop */ }
  try { dc = planDatacrons({ roster: RD, datacronDb: DATACRON_DB, meta: META }).paths.filter(p => p.usable).length; } catch { /* noop */ }
  const props = deriveProposals({ modsAudit: MODS.audit, target, targetTotals: res && res.totals, fleetFieldable, datacronsUsable: dc, guild: GUILD || DATA.guild });
  const impDots = l => { let s = '<span class="dots">'; for (let i = 0; i < 3; i++) s += `<b class="${i < l ? "on" : ""}"></b>`; return s + "</span>"; };
  el.innerHTML = props.map(p => {
    const lvl = p.impact.startsWith("Muy") ? 3 : p.impact === "Alto" ? 2 : 1;
    return `<div class="prop"><div class="rank">${p.n}<small>PRIOR.</small></div>
   <div><div class="pt">${p.title}<span class="tg2">${p.tag}</span></div>
   <div class="why">${p.why}</div><div class="adds"><b>Añade:</b> ${p.adds}</div></div>
   <div class="imp">${p.impact}${impDots(lvl)}</div></div>`;
  }).join("") || '<div class="pg-empty">Todo al día — sin propuestas ahora mismo.</div>';
}
function renderMejoras() { renderPrioBoard(); renderFarmQueue(); renderProposalsDerived(); }

// ===== Arena / Mods (Fase 4.1): auditoría dinámica + export a Grandivory =====
let MODS = { audit: MODS_EMBED, live: false }; // resultado de loadMods (init lo sustituye)
const MOD_ALLY = "355463284";
const GRAND_URL = "https://mods-optimizer.swgoh.grandivory.com/";
const modFilter = { color: "", set: "", flag: "", q: "" };
const FLAG_ES = { unleveled: "Sin subir", lowColor: "Color bajo", noSpeed: "Sin velocidad", sixDot: "6 puntos", premiumSpeed: "Vel. premium" };
const SLOT_ES = { 2: "Cuadrado", 3: "Flecha", 4: "Rombo", 5: "Triángulo", 6: "Círculo", 7: "Cruz" };
const modUnit = id => ID2U[id] || lookupByName(id);
const modName = id => (ID2U[id] ? ID2U[id].n : id);

function renderMods() {
  const box = $("#p-mods"); if (!box) return;
  const g = (MODS.audit && MODS.audit.global) || {};
  const off = (MODS.audit && MODS.audit.offenders) || [];
  const qw = (MODS.audit && MODS.audit.quickWins) || { level: [], move: [] };
  // Cabecera (header): dos cifras en vivo.
  if ($("#d-unlev")) $("#d-unlev").textContent = fmt(g.unleveled || 0);
  if ($("#d-spd20")) $("#d-spd20").textContent = (g.speedGe && g.speedGe[20]) || 0;
  const srcEl = $("#mods-src");
  if (srcEl) srcEl.textContent = MODS.live ? `Inventario en vivo · ${fmt(g.total || 0)} mods` : "Resumen embebido (sin conexión al backend)";

  // Estado global.
  const spd20 = (g.speedGe && g.speedGe[20]) || 0;
  $("#modstats").innerHTML = [
    { v: fmt(g.unleveled || 0), s: "/" + fmt(g.total || 0), k: "mods sin subir de nivel", cls: "alert" },
    { v: spd20, s: "", k: "mods con velocidad ≥ 20", cls: "alert" },
    { v: (g.byDots && g.byDots[6]) || 0, s: "", k: "mods de 6 puntos", cls: "" },
    { v: "0", s: "", k: "datacrons usados", cls: "zero" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}<small>${x.s}</small></div><div class="k">${x.k}</div></div>`).join("");

  // Barras por color.
  const cb = $("#mods-colorbars");
  if (cb) {
    const order = [["dorado", "var(--gold)"], ["morado", "#a463ff"], ["azul", "var(--holo)"], ["verde", "var(--green)"], ["gris", "var(--muted)"]];
    const total = g.total || 1;
    cb.innerHTML = `<div class="mods-cbars">` + order.map(([c, tone]) => {
      const n = (g.byColor && g.byColor[c]) || 0, pct = Math.round(n / total * 100);
      return `<div class="mods-cbar"><span class="cbl">${c}</span><div class="meter" data-pct="${pct}" style="--tone:${tone}"><i></i></div><span class="cbn">${fmt(n)}</span></div>`;
    }).join("") + `</div>`;
  }

  // Ofensores por inversión.
  const ob = $("#mods-offenders");
  if (ob) {
    if (!off.length) ob.innerHTML = '<div class="pg-empty">Sin ofensores: tus unidades de alta inversión llevan mods decentes. 👌</div>';
    else ob.innerHTML = off.slice(0, 20).map(o => {
      const u = modUnit(o.id);
      const spd = o.spdMods === 0 ? `<span class="low">+0</span>` : `+${o.spdMods}`;
      return `<div class="trow mods-off"><div class="who2">${portrait(u)}<div><div class="nm">${modName(o.id)} <span class="r">R${o.relic}·G${o.gear}</span></div><div class="tip">${o.why}</div></div></div>
       <div class="spd"><div class="cur ${o.spdMods === 0 ? "low" : ""}">${o.spdMods}</div><div class="tg">vel mods / ${o.spdFinal} final</div></div></div>`;
    }).join("");
  }

  // Quick-wins.
  const qb = $("#mods-quickwins");
  if (qb) {
    const lvl = (qw.level || []).slice(0, 12).map(w => `<li>${portrait(modUnit(w.unit))}<span class="sp">${w.count}</span><span class="txt">sube a <b>nivel 15</b> los mods de <b>${modName(w.unit)}</b></span><span class="tag ok">${w.cost}</span></li>`).join("");
    const mv = (qw.move || []).slice(0, 8).map(w => `<li>${portrait(modUnit(w.from))}<span class="sp">+${w.spd}</span><span class="txt">mueve un mod de <b>${w.spd}</b> vel de <b>${modName(w.from)}</b></span><span class="arw">→</span><span class="txt"><b>${modName(w.to)}</b></span></li>`).join("");
    qb.innerHTML =
      (lvl ? `<div class="slabel">Subir de nivel (barato)</div><ul class="relocate">${lvl}</ul>` : "") +
      (mv ? `<div class="slabel">Reubicar velocidad premium (gratis)</div><ul class="relocate">${mv}</ul>` : "") +
      (!lvl && !mv ? '<div class="pg-empty">Sin quick-wins evidentes ahora mismo.</div>' : "");
  }

  // Grid filtrable (solo con datos en vivo).
  const gridWrap = $("#mods-grid-card");
  if (gridWrap) gridWrap.style.display = (MODS.live && MODS.mods) ? "" : "none";
  if (MODS.live && MODS.mods) renderModGrid();
}

function renderModGrid() {
  const grid = $("#mods-grid"); if (!grid) return;
  const f = modFilter, q = f.q.toLowerCase().trim();
  const list = MODS.mods.filter(m => {
    if (f.color && String(m.col) !== f.color) return false;
    if (f.set && String(m.set) !== f.set) return false;
    if (f.q && !modName(m.c).toLowerCase().includes(q)) return false;
    if (f.flag && !modQuality(m).flags.includes(f.flag)) return false;
    return true;
  });
  $("#mods-gridcount").textContent = `${fmt(list.length)} mods`;
  grid.innerHTML = list.slice(0, 120).map(m => {
    const sp = (m.sec || []).find(s => s.s === 5 && parseDisp(s.v) > 0);
    const col = COLOR_MAP[m.col] || "?", set = (SET_MAP[m.set] && SET_MAP[m.set].n) || m.set;
    return `<div class="modcard c-${m.col}">${portrait(modUnit(m.c))}
     <div class="mc-b"><div class="mc-n">${modName(m.c)}</div>
       <div class="mc-m">${SLOT_ES[m.sl] || m.sl} · ${set} · ${col} · ${m.d}▪ · L${m.lv}</div>
       <div class="mc-s">${sp ? `⚡ ${parseDisp(sp.v)} vel` : "sin velocidad"}</div></div></div>`;
  }).join("") || '<div class="pg-empty">Ningún mod con esos filtros.</div>';
}

function modExportWire() {
  const open = $("#grand-open"); if (open) open.href = GRAND_URL;
  const copy = $("#grand-copy");
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(MOD_ALLY); copy.textContent = "✓ Copiado " + MOD_ALLY; setTimeout(() => { copy.textContent = "📋 Copiar ally code (" + MOD_ALLY + ")"; }, 2200); }
    catch { copy.textContent = "Ally code: " + MOD_ALLY; }
  };
}

// ===== puerta de acceso del gremio (Fase 5.1) =====
// Overlay #login del template. main.js inyecta los callbacks (que hablan con el Worker vía
// web/src/auth.js); aquí solo va el DOM. Si el overlay no existe (tests antiguos), no-op.
export function showLogin(show) {
  const g = $("#login"); if (g) g.hidden = !show;
}
export function initLogin({ onLogin, onRegister, onDemo } = {}) {
  const g = $("#login"); if (!g) return false;
  const err = $("#login-err");
  const setErr = msg => { if (err) { err.hidden = !msg; err.textContent = msg || ""; } };
  const setMode = up => {
    $("#login-mode-in").setAttribute("aria-pressed", String(!up));
    $("#login-mode-up").setAttribute("aria-pressed", String(up));
    $("#login-form-in").hidden = up; $("#login-form-up").hidden = !up; setErr("");
  };
  $("#login-mode-in").onclick = () => setMode(false);
  $("#login-mode-up").onclick = () => setMode(true);
  $("#login-form-in").onsubmit = async e => {
    e.preventDefault(); setErr("");
    const r = onLogin ? await onLogin({ ally: $("#li-ally").value.trim(), password: $("#li-pass").value }) : { ok: false, error: "sin backend" };
    if (!r || !r.ok) setErr((r && r.error) || "no se pudo iniciar sesión");
  };
  $("#login-form-up").onsubmit = async e => {
    e.preventDefault(); setErr("");
    const pass = $("#rg-pass").value, pass2 = $("#rg-pass2").value;
    if (pass !== pass2) return setErr("las contraseñas no coinciden");
    const r = onRegister ? await onRegister({ invite: $("#rg-invite").value.trim(), guildId: $("#rg-guild").value.trim(), ally: $("#rg-ally").value.trim(), password: pass }) : { ok: false, error: "sin backend" };
    if (!r || !r.ok) setErr((r && r.error) || "no se pudo crear la cuenta");
  };
  $("#login-demo") && ($("#login-demo").onclick = e => { e.preventDefault(); onDemo && onDemo(); });
  return true;
}

// ===== cableado de eventos + arranque =====
export function init(rd, extra = {}) {
  // Roster inyectado (en vivo) o embebido como fallback.
  RD = rd && Array.isArray(rd.R) && rd.V ? rd : EMBEDDED_RD;
  NAME2ID = {}; ID2U = {}; RD.R.forEach(u => { NAME2ID[u.n] = u.i; ID2U[u.i] = u; });
  // Datos de la pestaña Progreso (opcionales; si faltan -> estados vacíos, nada roto).
  PROGRESS = { events: (extra.progress && extra.progress.events) || [], snapshots: (extra.progress && extra.progress.snapshots) || [] };
  GUILD = extra.guild || null;
  MODS = (extra.mods && extra.mods.audit) ? extra.mods : { audit: MODS_EMBED, live: false };

  // Sesión (Fase 5.1): chip con el usuario + salir; banner honesto en modo demo / roster ajeno.
  const sc = $("#session-chip");
  if (sc && extra.session) {
    sc.hidden = false;
    $("#session-user").textContent = extra.session.name || ("#" + extra.session.ally);
    $("#session-exit") && ($("#session-exit").onclick = e => { e.preventDefault(); extra.onLogout && extra.onLogout(); });
  }
  const dbn = $("#demo-banner");
  if (dbn && extra.demoNote) { dbn.hidden = false; dbn.textContent = extra.demoNote; }

  renderStatic();
  renderGL();
  renderProgress();

  // Arena / Mods (Fase 4.1): auditoría + export + filtros del grid en vivo.
  renderMods();
  modExportWire();
  const setSel = $("#mods-fset");
  if (setSel && !setSel.dataset.filled) { setSel.dataset.filled = "1"; Object.entries(SET_MAP).forEach(([id, s]) => setSel.insertAdjacentHTML("beforeend", `<option value="${id}">${s.n}</option>`)); }
  $("#mods-fcolor") && ($("#mods-fcolor").onchange = function () { modFilter.color = this.value; renderModGrid(); });
  $("#mods-fset") && ($("#mods-fset").onchange = function () { modFilter.set = this.value; renderModGrid(); });
  $("#mods-fflag") && ($("#mods-fflag").onchange = function () { modFilter.flag = this.value; renderModGrid(); });
  $("#mods-fq") && ($("#mods-fq").oninput = function () { modFilter.q = this.value; renderModGrid(); });

  // Ascensión (Fase 4.6): objetivo configurable + planificador de energía persistido.
  vpEnergy = loadEnergy(null) || 480;
  ascTargetId = (loadTarget(null) && ascTargets().some(t => t.id === loadTarget(null))) ? loadTarget(null) : "LORDVADER";
  const eIn = $("#vp-energy");
  if (eIn) { eIn.value = vpEnergy; eIn.onchange = () => { const v = Math.max(120, Math.min(2000, Number(eIn.value) || 480)); vpEnergy = v; eIn.value = v; saveEnergy(v, null); renderVaderPlan(); }; }
  // Selector de objetivo: búsqueda + filtro por tier.
  $("#asc-search") && ($("#asc-search").oninput = function () { ascFilter.q = this.value.toLowerCase().trim(); renderTargetPicker(); });
  $("#asc-tier") && ($("#asc-tier").onchange = function () { ascFilter.tier = this.value; renderTargetPicker(); });
  // Plan semanal editable: guarda por objetivo al escribir.
  $("#asc-plan") && ($("#asc-plan").oninput = function () { const tg = ascActive(); if (tg) { savePlan(tg.id, this.value, null); const st = $("#asc-plan-status"); if (st) st.textContent = this.value ? "guardado en este navegador" : "vacío · escribe tu plan"; } });
  renderTargetPicker();
  renderAscension();

  // Mejoras (Fase 4.7): prioridades + cola + Top 5 derivado (persistido).
  const savedPrios = loadPrios(null);
  ascPrios = (Array.isArray(savedPrios) && savedPrios.length === TIER_ORDER.length && TIER_ORDER.every(t => savedPrios.includes(t))) ? savedPrios : null;
  ascPins = loadPins(null);
  $("#prio-reset") && ($("#prio-reset").onclick = () => { ascPrios = null; ascPins = []; savePrios(TIER_ORDER, null); savePins([], null); renderMejoras(); });
  renderMejoras();

  // Flota (Fase 4.3): naves en vivo o embebidas + filtros.
  FLEET = (extra.fleet && Array.isArray(extra.fleet.owned) && extra.fleet.owned.length) ? extra.fleet : { owned: SHIPS_EMBED, live: false };
  renderFleet();
  $$("#fleet-side button").forEach(b => b.onclick = () => { fleetFilter.side = b.dataset.v; $$("#fleet-side button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderFleet(); });
  $("#fleet-tier") && ($("#fleet-tier").onchange = function () { fleetFilter.tier = this.value; renderFleet(); });

  // TW (Fase 4.4): formato persistido + regenerar.
  const twSaved = loadTW(null); if (twSaved) { twFmt.zones = twSaved.zones; twFmt.perZone = twSaved.perZone; twFmt.size = twSaved.size; }
  const zi = $("#tw-zones"), pi = $("#tw-per");
  if (zi) zi.value = twFmt.zones; if (pi) pi.value = twFmt.perZone;
  $$("#tw-size button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === twFmt.size)));
  $$("#tw-size button").forEach(b => b.onclick = () => twSetSize(+b.dataset.n));
  const twApply = () => { twFmt.zones = Math.max(1, Math.min(12, Number(zi && zi.value) || 4)); twFmt.perZone = Math.max(1, Math.min(20, Number(pi && pi.value) || 5)); if (zi) zi.value = twFmt.zones; if (pi) pi.value = twFmt.perZone; saveTW(twFmt, null); renderTW(); };
  zi && (zi.onchange = twApply); pi && (pi.onchange = twApply);
  $("#tw-go") && ($("#tw-go").onclick = twApply);
  renderTW();

  // Datacrones (Fase 4.5): guía curada × roster + filtros (modo / facción).
  renderDatacrons();
  $$("#dc-mode button").forEach(b => b.onclick = () => { dcFilter.mode = b.dataset.v; $$("#dc-mode button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderDatacrons(); });
  $("#dc-fac") && ($("#dc-fac").onchange = function () { dcFilter.fac = this.value; renderDatacrons(); });

  // Roster explorer: poblar selects
  const role = $("#rx-role"), fac = $("#rx-fac"), ab = $("#rx-ab");
  RD.V.roles.forEach(r => role.insertAdjacentHTML("beforeend", `<option value="${r}">${r}</option>`));
  RD.V.factions.forEach(([c, n]) => fac.insertAdjacentHTML("beforeend", `<option value="${c}">${c} (${n})</option>`));
  RD.V.abilities.forEach(([a, n]) => ab.insertAdjacentHTML("beforeend", `<option value="${a}">${a} (${n})</option>`));
  $("#rx-q").oninput = e => { rxState.q = e.target.value.toLowerCase().trim(); rxRender(); };
  $$("#rx-side button").forEach(b => b.onclick = () => { rxState.side = b.dataset.v; $$("#rx-side button").forEach(x => x.setAttribute("aria-pressed", x === b)); rxRender(); });
  $("#rx-role").onchange = e => { rxState.role = e.target.value; rxRender(); };
  $("#rx-fac").onchange = e => { rxState.fac = e.target.value; rxRender(); };
  $("#rx-ab").onchange = e => { rxState.ab = e.target.value; rxRender(); };
  $("#rx-sort").onchange = e => { rxState.sort = e.target.value; rxRender(); };
  $("#rx-reset").onclick = () => {
    rxState.q = ""; rxState.side = ""; rxState.role = ""; rxState.fac = ""; rxState.ab = ""; rxState.sort = "p";
    $("#rx-q").value = ""; $("#rx-role").value = ""; $("#rx-fac").value = ""; $("#rx-ab").value = ""; $("#rx-sort").value = "p";
    $$("#rx-side button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === "")); rxRender();
  };
  rxRender();

  // Conquest: datalist de personajes + wiring
  const dl = $("#cq-chardl"); if (dl) RD.R.slice().sort((a, b) => a.n.localeCompare(b.n)).forEach(u => dl.insertAdjacentHTML("beforeend", `<option value="${u.n.replace(/"/g, "&quot;")}">`));
  $("#cq-type").onchange = cqFillVal; $("#cq-add").onclick = cqAdd; $("#cq-go").onclick = cqRun;
  $("#cq-char") && ($("#cq-char").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); cqAdd(); } });
  cqFillVal(); cqRenderChips();

  // Counters — Tablero meta (existente): poblar filtro de facción + wiring
  const csel = $("#cx-fac"); if (csel) [...new Set(ENEMIES.map(e => e.fac))].sort().forEach(f => csel.insertAdjacentHTML("beforeend", `<option value="${f}">${f}</option>`));
  $("#cx-q") && ($("#cx-q").oninput = function () { cxState.q = this.value.toLowerCase().trim(); renderCounters(); });
  $$("#cx-side button").forEach(b => b.onclick = () => { cxState.side = b.dataset.v; $$("#cx-side button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderCounters(); });
  $("#cx-fac") && ($("#cx-fac").onchange = function () { cxState.fac = this.value; renderCounters(); });
  renderCounters();

  // Counters — War Room (Fase 3.1): metadata global (live o embebida) + tablero persistente.
  META = (extra.charMeta && typeof extra.charMeta === "object" && Object.keys(extra.charMeta).length) ? extra.charMeta : EMBEDDED_META;
  buildPickIndex();
  // Restaura bloqueo + tablero desde localStorage (si los hay).
  boardState.locked = loadLocked(null);
  const savedBoard = loadBoard(null);
  if (savedBoard) { boardState.size = savedBoard.size; boardState.order = savedBoard.order; boardState.teams = savedBoard.teams.length ? savedBoard.teams : boardState.teams; }
  boardState.plan = null;
  $$("#scout-size button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === boardState.size)));
  $$("#scout-order button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.o === boardState.order)));
  $$("#cx-mode button").forEach(b => b.onclick = () => cxSetMode(b.dataset.m));
  $$("#scout-size button").forEach(b => b.onclick = () => boardSetSize(+b.dataset.n));
  $$("#scout-order button").forEach(b => b.onclick = () => boardSetOrder(b.dataset.o));
  $("#scout-addteam") && ($("#scout-addteam").onclick = boardAddTeam);
  $("#scout-go") && ($("#scout-go").onclick = boardGenerate);
  $("#scout-reset") && ($("#scout-reset").onclick = boardReset);
  wirePicker($("#lock-search"), $("#lock-plist"), PICK_ROSTER, () => new Set(boardState.locked), id => lockAdd(id), $("#lock-search") && $("#lock-search").closest(".wr-picker"), "roster");
  lockRenderChips(); renderBoard();
  cxSetMode("scout");

  // Pestañas
  const panels = { mods: "#p-mods", vader: "#p-vader", gl: "#p-gl", next: "#p-next", counters: "#p-counters", roster: "#p-roster", conquest: "#p-conquest", progreso: "#p-progreso", fleet: "#p-fleet", tw: "#p-tw", datacron: "#p-datacron" };
  $$(".tab").forEach(tab => tab.onclick = () => {
    $$(".tab").forEach(t => t.setAttribute("aria-selected", t === tab));
    const key = tab.dataset.p; Object.entries(panels).forEach(([k, sel]) => $(sel).classList.toggle("on", k === key));
    const root = $(panels[key]); animateMeters(root);
    if (key === "vader") { initRoadmapMeters(); if (!ringDone) { ringDone = true; animateRing(); } }
    if (key === "progreso" && !pgRingDone) { pgRingDone = true; animatePgRing(); }
  });
  // Enlaces internos "ir a pestaña" (p.ej. el callout "0 datacrons" → pestaña Datacrons).
  $$("[data-goto]").forEach(a => a.onclick = e => { e.preventDefault(); const t = $(`.tab[data-p="${a.dataset.goto}"]`); if (t) t.click(); });
  animateMeters($("#p-mods"));
}
