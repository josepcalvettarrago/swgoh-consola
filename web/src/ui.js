// Capa de presentación (DOM). Toda la lógica pura vive en engine.js.
// init() se llama desde main.js cuando el DOM está listo.
import { DATA, RD as EMBEDDED_RD, ENEMIES, SIDES, CHAR_META as EMBEDDED_META } from "./data.js";
import { assemble, teamRow, portrait, unitImg, lookupByName, vaderProgress, genBoard } from "./engine.js";
import { progressView, eventHeadline, unitChangeText, sortedUnitChanges, guildRanking } from "./progress.js";
import { loadLocked, saveLocked, loadBoard, saveBoard, clearBoard } from "./store.js";
import COUNTER_DB from "./data/counter_db.json";

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

  const MH = DATA.mod_health;
  $("#d-unlev").textContent = fmt(MH.unleveled); $("#d-spd20").textContent = MH.spd20;
  $("#modstats").innerHTML = [
    { v: fmt(MH.unleveled), s: "/" + fmt(MH.total), k: "mods sin subir de nivel", cls: "alert" },
    { v: MH.spd20, s: "", k: "mods con velocidad ≥ 20", cls: "alert" },
    { v: MH.sixdot, s: "", k: "mods de 6 puntos", cls: "" },
    { v: "0", s: "", k: "datacrons usados", cls: "zero" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}<small>${x.s}</small></div><div class="k">${x.k}</div></div>`).join("");

  $("#team").innerHTML = DATA.mods_plan.map(t => {
    const pct = Math.min(100, Math.round(t.spd / t.target * 100)), hit = t.spd >= t.target;
    return `<div class="trow">${portrait(lookupByName(t.name))}<div class="who"><div class="nm">${t.name} <span class="r">R${t.relic}·G${t.gear}</span></div>
   <div class="tip">${t.note}</div></div>
   <div class="spd"><div class="cur ${hit ? "hit" : "low"}">${t.spd}</div><div class="tg">objetivo ${t.target}</div></div>
   <div class="barwrap"><div class="meter seg" data-pct="${pct}" style="--tone:${hit ? "var(--green)" : "var(--holo)"}"><i></i></div></div></div>`;
  }).join("");
  $("#reloc").innerHTML = DATA.relocate.map(r =>
    `<li>${portrait(lookupByName(r.from))}<span class="sp">+${r.sp}</span><span class="txt">mod de <b>${r.slot}</b> · lo lleva <b>${r.from}</b></span><span class="arw">→</span><span class="txt">al soporte de SLKR</span></li>`).join("");

  const LV = DATA.lv;
  const need = LV.units.reduce((a, u) => a + u.need, 0), ach = LV.units.reduce((a, u) => a + Math.min(u.relic, u.need), 0);
  lvpct = Math.round(ach / need * 100);
  $("#lvfacts").innerHTML = [
    { v: "14/14", k: "unidades ya a 7★", cls: "zero" },
    { v: LV.total_relic_gap, k: "niveles de relic que faltan", cls: "alert" },
    { v: LV.total_gear_gap, k: "saltos de gear a G13", cls: "" },
    { v: "8/10", k: "GL al desbloquearlo", cls: "zero" },
  ].map(x => `<div class="stat ${x.cls}"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>`).join("");
  $("#shipnote").innerHTML = `<span class="badge ok">✓</span> Nave <b style="color:var(--text)">BTL-B Y-wing</b> ya a 7★ — requisito cumplido. Estás al <b style="color:var(--text)">${lvpct}%</b> del relic necesario.`;

  const tones = { arena: "var(--holo)", relic: "var(--ember)", gear: "var(--gold)", unlock: "var(--green)" };
  const kindlabel = { arena: "ARENA", relic: "RELIC", gear: "GEAR + RELIC", unlock: "EVENTO" };
  $("#rmnote").textContent = DATA.plan_total_relic + " niveles de relic · ~5 meses F2P (estimado)";
  $("#tl").innerHTML = DATA.plan.map(p => {
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

  $("#glcount").textContent = DATA.gl_owned.length + " de 10 desbloqueados";
  $("#glowned").innerHTML = DATA.gl_owned.map(g => {
    const rp = Math.round(g.relic / 9 * 100);
    return `<div class="glcard"><div class="glhead">${portrait(lookupByName(g.name))}<div class="ab">${g.ab}</div></div><div class="full">${g.name}</div>
   <div class="rl"><span>RELIC</span><b>R${g.relic}</b></div><div class="meter" data-pct="${rp}" style="--tone:var(--gold)"><i></i></div>
   <div class="sp">‹ ${g.spd} vel · G${g.gear}</div></div>`;
  }).join("");
  $("#glmissing").innerHTML = DATA.gl_missing.map(g => {
    const pill = g.ready === "closest" ? '<span class="pill next">PRÓXIMO</span>' : g.ready === "medium" ? '<span class="pill medium">MEDIO</span>' : '<span class="pill far">LEJANO</span>';
    return `<div class="glcard missing ${g.ready === "closest" ? "next" : ""}">${pill}<div class="glhead">${portrait(lookupByName(g.name))}<div class="ab">${g.name}</div></div><div class="full">${g.tag}</div><div class="tagline">${g.note}</div></div>`;
  }).join("");
  const gapRows = arr => arr.map(u => {
    const st = u.have ? `<span class="s has">${u.stars}★ · G${u.gear} · R${u.relic}</span>` : '<span class="s miss">no lo tienes</span>';
    return `<div class="gaprow"><span class="gpname">${portrait(lookupByName(u.name))}${u.name}</span>${st}</div>`;
  }).join("");
  $("#gapAhsoka").innerHTML = gapRows(DATA.ahsoka_gap); $("#gapHondo").innerHTML = gapRows(DATA.hondo_gap);

  const impDots = l => { let s = '<span class="dots">'; for (let i = 0; i < 3; i++) s += `<b class="${i < l ? "on" : ""}"></b>`; return s + "</span>"; };
  $("#props").innerHTML = DATA.proposals.map(p => {
    const lvl = p.impact.startsWith("Muy") ? 3 : p.impact === "Alto" ? 2 : 1;
    return `<div class="prop"><div class="rank">${p.n}<small>PRIOR.</small></div>
   <div><div class="pt">${p.title}<span class="tg2">${p.tag}</span></div>
   <div class="why">${p.why}</div><div class="adds"><b>Añade:</b> ${p.adds}</div></div>
   <div class="imp">${p.impact}${impDots(lvl)}</div></div>`;
  }).join("");
  $("#bonus").innerHTML = '<b>Bonus:</b> tu gremio es muy fuerte en flota (rango medio 74 vs 264 en personajes). Un módulo de <b>Fleet Arena</b> podría ser tu vía más fácil de cristales diarios como F2P.';
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
  $$(".cgen").forEach(b => b.onclick = () => genCounter(+b.dataset.e));
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
  const facOf = c => (c || []).find(x => x !== "Leader") || "";
  const seen = new Set(); PICK_ALL = [];
  for (const [id, m] of Object.entries(META)) { if (m && m.n && !seen.has(id)) { seen.add(id); PICK_ALL.push({ id, n: m.n, s: m.s, fac: facOf(m.c) }); } }
  RD.R.forEach(u => { if (!seen.has(u.i)) { seen.add(u.i); PICK_ALL.push({ id: u.i, n: u.n, s: u.s, fac: facOf(u.c) }); } });
  PICK_ALL.sort((a, b) => a.n.localeCompare(b.n));
  PICK_ROSTER = RD.R.map(u => ({ id: u.i, n: u.n, s: u.s, fac: facOf(u.c) })).sort((a, b) => a.n.localeCompare(b.n));
}
// Filtra por nombre: primero los que empiezan por la búsqueda, luego los que la contienen. Cap 30.
function pickFilter(list, q, limit = 30) {
  q = (q || "").toLowerCase().trim();
  if (!q) return list.slice(0, limit);
  const starts = [], incl = [];
  for (const e of list) { const n = e.n.toLowerCase(); if (n.startsWith(q)) starts.push(e); else if (n.includes(q)) incl.push(e); }
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
// Cablea un input de búsqueda + su lista a un origen (PICK_ALL/PICK_ROSTER) y un callback de elección.
// Soporta ratón (clic) Y teclado (↑/↓ resaltan, Enter elige). `container` opcional: si se pasa, también
// se oculta al perder foco (desplegable de zona, que aparece al pulsar un hueco vacío; el del bloqueo
// va siempre visible y no lo pasa).
function wirePicker(inp, listEl, source, excludeFn, onPick, container) {
  if (!inp || !listEl) return;
  let items = [], active = -1;
  const firstEnabled = ex => items.findIndex(it => !ex.has(it.id));
  const paint = () => renderPickList(listEl, items, onPick, excludeFn(), active);
  const refresh = () => { items = pickFilter(source, inp.value); active = firstEnabled(excludeFn()); paint(); };
  const move = dir => {
    const ex = excludeFn(); if (!items.length) return;
    for (let n = 0; n < items.length; n++) { active = (active + dir + items.length) % items.length; if (!ex.has(items[active].id)) break; }
    paint();
    const el = listEl.querySelector(".wr-popt.active");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  };
  inp.oninput = refresh; inp.onfocus = refresh;
  inp.onkeydown = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (listEl.hidden) refresh(); else move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault(); const ex = excludeFn();
      const pick = (active >= 0 && items[active] && !ex.has(items[active].id)) ? items[active] : items.find(it => !ex.has(it.id));
      if (pick) onPick(pick.id);
    } else if (e.key === "Escape") { listEl.hidden = true; if (container) container.hidden = true; inp.blur(); }
  };
  inp.onblur = () => setTimeout(() => { listEl.hidden = true; if (container) container.hidden = true; }, 150);
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
     ${full ? "" : `<div class="wr-picker" data-z="${i}" hidden><input class="rx-in wr-psearch" data-z="${i}" type="text" placeholder="🔎 Buscar defensor…" autocomplete="off"><div class="wr-plist" data-z="${i}" hidden></div></div>`}
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
    wirePicker(inp, listEl, PICK_ALL, () => new Set(boardState.teams[z].defenseIds), id => defenderAdd(z, id), pk);
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

// ===== cableado de eventos + arranque =====
export function init(rd, extra = {}) {
  // Roster inyectado (en vivo) o embebido como fallback.
  RD = rd && Array.isArray(rd.R) && rd.V ? rd : EMBEDDED_RD;
  NAME2ID = {}; ID2U = {}; RD.R.forEach(u => { NAME2ID[u.n] = u.i; ID2U[u.i] = u; });
  // Datos de la pestaña Progreso (opcionales; si faltan -> estados vacíos, nada roto).
  PROGRESS = { events: (extra.progress && extra.progress.events) || [], snapshots: (extra.progress && extra.progress.snapshots) || [] };
  GUILD = extra.guild || null;

  renderStatic();
  renderProgress();

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
  wirePicker($("#lock-search"), $("#lock-plist"), PICK_ROSTER, () => new Set(boardState.locked), id => lockAdd(id));
  lockRenderChips(); renderBoard();
  cxSetMode("scout");

  // Pestañas
  const panels = { mods: "#p-mods", vader: "#p-vader", gl: "#p-gl", next: "#p-next", counters: "#p-counters", roster: "#p-roster", conquest: "#p-conquest", progreso: "#p-progreso" };
  $$(".tab").forEach(tab => tab.onclick = () => {
    $$(".tab").forEach(t => t.setAttribute("aria-selected", t === tab));
    const key = tab.dataset.p; Object.entries(panels).forEach(([k, sel]) => $(sel).classList.toggle("on", k === key));
    const root = $(panels[key]); animateMeters(root);
    if (key === "vader") { initRoadmapMeters(); if (!ringDone) { ringDone = true; animateRing(); } }
    if (key === "progreso" && !pgRingDone) { pgRingDone = true; animatePgRing(); }
  });
  animateMeters($("#p-mods"));
}
