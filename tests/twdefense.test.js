// Tests del constructor de defensa de TW (Fase 4.4). Motor puro + store.
import { describe, it, expect } from "vitest";
import { planTWDefense } from "../web/src/twdefense.js";
import { assemble } from "../web/src/engine.js";
import { loadTW, saveTW } from "../web/src/store.js";
import { RD } from "../web/src/data.js";

const run = (opts = {}) => planTWDefense(RD, { zones: 4, perZone: 5, size: 5, assemble, ...opts });
const allUnits = p => p.zones.flatMap(z => z.squads.flatMap(s => s.team.map(u => u.i)));

describe("planTWDefense — escuadrones sin solapar desde el roster", () => {
  it("monta zonas×perZone escuadrones del tamaño pedido", () => {
    const p = run();
    expect(p.totalWanted).toBe(20);
    expect(p.built).toBe(20);
    for (const z of p.zones) for (const s of z.squads) expect(s.team.length).toBe(5);
  });
  it("NINGÚN personaje se repite entre escuadrones", () => {
    const ids = allUnits(run());
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("respeta la unicidad de GL por escuadrón (assemble intacto)", () => {
    for (const z of run().zones) for (const s of z.squads) expect(s.team.filter(u => u.gl).length).toBeLessThanOrEqual(1);
  });
  it("reparte por zonas (perZone por zona)", () => {
    const p = run({ zones: 3, perZone: 4 });
    expect(p.zones.length).toBe(3);
    for (const z of p.zones) expect(z.squads.length).toBe(4);
  });
  it("3v3 → escuadrones de 3", () => {
    for (const z of run({ size: 3 }).zones) for (const s of z.squads) expect(s.team.length).toBe(3);
  });
  it("ranOut=true si el roster no da para todos los escuadrones", () => {
    const p = planTWDefense({ R: RD.R.slice(0, 12), V: RD.V }, { zones: 4, perZone: 5, size: 5, assemble });
    expect(p.built).toBeLessThan(p.totalWanted);
    expect(p.ranOut).toBe(true);
    expect(new Set(allUnits(p)).size).toBe(allUnits(p).length); // sigue sin solapar
  });
  it("es determinista", () => {
    expect(allUnits(run())).toEqual(allUnits(run()));
  });
  it("sin assemble → no revienta (0 escuadrones)", () => {
    const p = planTWDefense(RD, { zones: 2, perZone: 2, size: 5 });
    expect(p.built).toBe(0);
    expect(p.zones.length).toBe(2);
  });
});

describe("store — formato de TW", () => {
  const fake = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
  it("roundtrip + saneo (clamp/size)", () => {
    const s = fake();
    saveTW({ zones: 6, perZone: 3, size: 3 }, s);
    expect(loadTW(s)).toEqual({ zones: 6, perZone: 3, size: 3 });
    saveTW({ zones: 999, perZone: 0, size: 7 }, s);
    const v = loadTW(s);
    expect(v.zones).toBe(12); expect(v.perZone).toBe(1); expect(v.size).toBe(5);
  });
  it("sin datos → null", () => { expect(loadTW(fake())).toBe(null); });
});
