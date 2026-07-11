// Tests del módulo de flota (Fase 4.3). Motor puro + compactShips. Sembrado con datos reales.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { planFleet } from "../web/src/fleet.js";
import { compactShips } from "../worker/src/normalize.js";
import { SHIP_META, SHIPS_EMBED } from "../web/src/data/ships.js";
import { RD } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(resolve(__dirname, "../web/src/data/fleet_db.json"), "utf8"));

describe("compactShips", () => {
  it("extrae solo naves (combat_type 2) con {i,t,l,p}", () => {
    const j = { units: [{ data: { base_id: "X", combat_type: 1 } }, { data: { base_id: "SLAVE1", combat_type: 2, rarity: 7, level: 85, power: 5 } }] };
    const s = compactShips(j);
    expect(s).toEqual([{ i: "SLAVE1", t: 7, l: 85, p: 5 }]);
  });
});

describe("planFleet — datos reales (SHIPS_EMBED + RD)", () => {
  const p = planFleet({ owned: SHIPS_EMBED, shipMeta: SHIP_META, roster: RD, fleetDb: DB });
  it("una flota por entrada de la BD, con nombres de nave resueltos", () => {
    expect(p.length).toBe(DB.fleets.length);
    const neg = p.find(f => f.id === "negotiator_gr");
    expect(neg.ships[0].name).not.toBe(neg.ships[0].id); // resuelto vía SHIP_META
  });
  it("marca montable cuando capital + titulares están a 7★", () => {
    // El jugador tiene Chimaera y sus TIE → montable.
    expect(p.find(f => f.id === "chimaera_empire").canField).toBe(true);
  });
  it("las capitales S no poseídas quedan 'casi' (falta la capital), no montables", () => {
    const exe = p.find(f => f.id === "executor_empire");
    expect(exe.capitalOwned).toBe(false);
    expect(exe.canField).toBe(false);
    expect(exe.missing).toContain("CAPITALEXECUTOR");
  });
  it("orden: montables primero; las bloqueadas/casi después", () => {
    const statuses = p.map(f => f.status);
    for (let i = 1; i < statuses.length; i++) expect(statuses[i]).toBeLessThanOrEqual(statuses[i - 1]);
  });
  it("crew cruza el roster en vivo (relic/gear) y marca listos", () => {
    const mal = p.find(f => f.id === "malevolence_sep");
    expect(mal.crew.length).toBeGreaterThan(0);
    for (const c of mal.crew) { expect(typeof c.ready).toBe("boolean"); if (c.owned) expect(typeof c.relic).toBe("number"); }
  });
  it("es determinista", () => {
    expect(planFleet({ owned: SHIPS_EMBED, shipMeta: SHIP_META, roster: RD, fleetDb: DB }).map(f => f.id)).toEqual(p.map(f => f.id));
  });
});

describe("planFleet — casos sintéticos", () => {
  const db = { fleets: [{ id: "t", label: "T", capital: "CAP", starters: ["A", "B"], reinforcements: ["C"], crew: ["P1"], tier: "S", role: "both" }] };
  const meta = { CAP: { n: "Cap", s: "D" }, A: { n: "A", s: "D" }, B: { n: "B", s: "D" }, C: { n: "C", s: "D" } };
  it("todo 7★ → montable; falta uno → casi/bloqueada", () => {
    const full = planFleet({ owned: [{ i: "CAP", t: 7 }, { i: "A", t: 7 }, { i: "B", t: 7 }, { i: "C", t: 7 }], shipMeta: meta, roster: { R: [] }, fleetDb: db })[0];
    expect(full.canField).toBe(true); expect(full.ownedCount).toBe(4);
    const noCap = planFleet({ owned: [{ i: "A", t: 7 }, { i: "B", t: 7 }], shipMeta: meta, roster: { R: [] }, fleetDb: db })[0];
    expect(noCap.canField).toBe(false); expect(noCap.missing).toEqual(["CAP"]); expect(noCap.status).toBe(1);
  });
  it("nave a <7★ no cuenta como montable", () => {
    const f = planFleet({ owned: [{ i: "CAP", t: 6 }, { i: "A", t: 7 }, { i: "B", t: 7 }], shipMeta: meta, roster: { R: [] }, fleetDb: db })[0];
    expect(f.canField).toBe(false); expect(f.missing).toContain("CAP");
  });
});
