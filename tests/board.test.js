// Tests del War Room (Fase 3.1): tamaño de equipo, genBoard con presupuesto compartido,
// exclusividad de personajes, bloqueo de defensa y determinismo. Motor puro, sin DOM.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assemble, genBoard, teamDifficulty } from "../web/src/engine.js";
import { RD, CHAR_META } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COUNTER_DB = JSON.parse(readFileSync(resolve(__dirname, "../web/src/data/counter_db.json"), "utf8"));

describe("assemble — parámetro size (arregla el bug 3v3)", () => {
  it("size=3 -> equipo de 3; size=5 -> equipo de 5", () => {
    const t3 = assemble(RD.R, [], null, 3);
    const t5 = assemble(RD.R, [], null, 5);
    expect(t3.team.length).toBe(3);
    expect(t5.team.length).toBe(5);
  });
  it("omitir size mantiene 5 (retrocompat)", () => {
    expect(assemble(RD.R, [], null).team.length).toBe(5);
  });
  it("respeta la unicidad de GL también en 3v3", () => {
    const gls = RD.R.filter(u => u.gl).slice(0, 2);
    const t = assemble(RD.R, gls, ["Buff Immunity"], 3);
    expect(t.team.length).toBe(3);
    expect(t.team.filter(u => u.gl).length).toBeLessThanOrEqual(1);
  });
});

describe("genBoard — tablero GAC con presupuesto compartido", () => {
  const board = (teams, opts = {}) => genBoard({ enemyTeams: teams, roster: RD, meta: CHAR_META, counterDb: COUNTER_DB, assemble, size: opts.size || 5, lockedIds: opts.lockedIds || [], order: opts.order || "auto" });
  const T = (...ids) => ({ defenseIds: ids });

  it("EXCLUSIVIDAD: ningún personaje aparece en dos counters", () => {
    const r = board([T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA"), T("SUPREMELEADERKYLOREN", "KYLORENUNMASKED", "FIRSTORDEROFFICERMALE")], { size: 5 });
    const all = r.results.flatMap(res => res.usedIds);
    expect(new Set(all).size).toBe(all.length); // sin duplicados entre equipos
  });

  it("tamaño por equipo correcto (3v3 -> counters de 3)", () => {
    const r = board([T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA")], { size: 3 });
    for (const res of r.results) expect(res.scout.heuristic.team.length).toBeLessThanOrEqual(3);
    expect(r.size).toBe(3);
  });

  it("BLOQUEO: las unidades de mi defensa fija no se usan en ningún counter", () => {
    const locked = RD.R.slice(0, 3).map(u => u.i);
    const r = board([T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA")], { size: 5, lockedIds: locked });
    const all = new Set(r.results.flatMap(res => res.usedIds));
    for (const id of locked) expect(all.has(id)).toBe(false);
    expect(r.budget.lockedCount).toBe(3);
  });

  it("presupuesto coherente: total, gastados, libres", () => {
    const r = board([T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA")], { size: 5 });
    const used = new Set(r.results.flatMap(res => res.usedIds)).size;
    expect(r.budget.total).toBe(RD.R.length);
    expect(r.budget.spentCount).toBe(used);
    expect(r.budget.remaining).toBe(RD.R.length - used);
  });

  it("resultados SIEMPRE en orden de tablero, aunque el proceso sea auto (difíciles primero)", () => {
    const teams = [T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA")];
    const r = board(teams, { order: "auto" });
    expect(r.results.map(x => x.enemyIndex)).toEqual([0, 1]);
  });

  it("determinista: mismos inputs -> mismo output", () => {
    const teams = [T("JABBATHEHUTT", "BOSSK", "BOBAFETT"), T("GREATMOTHERS", "MERRIN", "TALIA")];
    expect(board(teams)).toEqual(board(teams));
  });

  it("shortfall=true si el pool se queda sin unidades suficientes", () => {
    // roster minúsculo de 2 unidades y 2 equipos 5v5 -> el segundo no llega a 5.
    const tiny = { R: RD.R.slice(0, 2), V: RD.V };
    const r = genBoard({ enemyTeams: [{ defenseIds: ["JABBATHEHUTT"] }, { defenseIds: ["GREATMOTHERS"] }], roster: tiny, meta: CHAR_META, counterDb: COUNTER_DB, assemble, size: 5 });
    expect(r.results.some(res => res.shortfall)).toBe(true);
  });

  it("teamDifficulty ordena: una defensa con más amenazas puntúa más", () => {
    const hard = ["GREATMOTHERS", "MERRIN", "TALIA", "DAKA"].map(id => ({ i: id, ...CHAR_META[id] }));
    const easy = [{ i: "X", n: "X", s: "N", r: "Attacker", c: [], a: [] }];
    expect(teamDifficulty(hard, CHAR_META, COUNTER_DB)).toBeGreaterThan(teamDifficulty(easy, CHAR_META, COUNTER_DB));
  });
});
