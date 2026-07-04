// Capa de presentación (DOM). Toda la lógica pura vive en engine.js.
// init() se llama desde main.js cuando el DOM está listo.
import { DATA, RD, ENEMIES, SIDES } from "./data.js";
import { assemble, teamRow, portrait, unitImg, lookupByName } from "./engine.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => n.toLocaleString("es-ES");

// ---- estado de módulo ----
let lvpct = 0, ringDone = false, rmIO = null;
const rm = matchMedia("(prefers-reduced-motion:reduce)").matches;
const rxState = { q: "", side: "", role: "", fac: "", ab: "", sort: "p" };
const NAME2ID = {}, ID2U = {}; RD.R.forEach(u => { NAME2ID[u.n] = u.i; ID2U[u.i] = u; });
let cqCons = [];
const CQTYPE_ES = { fac: "Facción", side: "Lado", role: "Rol", ab: "Mecánica", char: "Personaje" };
const ROLE_ES = { Tank: "Tanque", Healer: "Sustain", Support: "Apoyo", Attacker: "Daño" };
const KEYMECH = ["Taunt", "Dispel", "Revive", "Gain Turn Meter", "Remove Turn Meter", "Stun", "Ability Block", "Offense Up", "Assist", "Buff Immunity", "Defense Down", "AoE"];
const cxState = { q: "", side: "", fac: "" };

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

// ===== cableado de eventos + arranque =====
export function init() {
  renderStatic();

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

  // Counters: poblar filtro de facción + wiring
  const csel = $("#cx-fac"); if (csel) [...new Set(ENEMIES.map(e => e.fac))].sort().forEach(f => csel.insertAdjacentHTML("beforeend", `<option value="${f}">${f}</option>`));
  $("#cx-q") && ($("#cx-q").oninput = function () { cxState.q = this.value.toLowerCase().trim(); renderCounters(); });
  $$("#cx-side button").forEach(b => b.onclick = () => { cxState.side = b.dataset.v; $$("#cx-side button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderCounters(); });
  $("#cx-fac") && ($("#cx-fac").onchange = function () { cxState.fac = this.value; renderCounters(); });
  renderCounters();

  // Pestañas
  const panels = { mods: "#p-mods", vader: "#p-vader", gl: "#p-gl", next: "#p-next", counters: "#p-counters", roster: "#p-roster", conquest: "#p-conquest" };
  $$(".tab").forEach(tab => tab.onclick = () => {
    $$(".tab").forEach(t => t.setAttribute("aria-selected", t === tab));
    const key = tab.dataset.p; Object.entries(panels).forEach(([k, sel]) => $(sel).classList.toggle("on", k === key));
    const root = $(panels[key]); animateMeters(root);
    if (key === "vader") { initRoadmapMeters(); if (!ringDone) { ringDone = true; animateRing(); } }
  });
  animateMeters($("#p-mods"));
}
