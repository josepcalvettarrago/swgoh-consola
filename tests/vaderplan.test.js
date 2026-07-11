// Tests del planificador de energía / ETA hacia Lord Vader (Fase 4.2). Motor puro + store.
import { describe, it, expect } from "vitest";
import { vaderPlan } from "../web/src/vaderplan.js";
import { loadEnergy, saveEnergy } from "../web/src/store.js";

// lv sintético + costes planos (1 día/nivel de relic, 1000 energía/nivel de gear) para mates fáciles.
const LV = { units: [
  { name: "A", need: 5, relic: 0, gear: 9 },
  { name: "B", need: 7, relic: 7, gear: 13 },
  { name: "C", need: 5, relic: 3, gear: 11 },
] };
const COSTS = { gearEnergyPerLevel: 1000, relicDaysPerLevel: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 } };
const RD = { R: [{ n: "A", rl: 0, g: 9 }, { n: "B", rl: 7, g: 13 }, { n: "C", rl: 3, g: 11 }] };
const plan = (rd = RD, energy = 1000) => vaderPlan(rd, { lv: LV, costs: COSTS, dailyGearEnergy: energy });

describe("vaderPlan — gaps y ETA desde el roster en vivo", () => {
  it("calcula relic/gear gap y días por unidad (energía→gear, días/nivel→relic)", () => {
    const A = plan().units.find(u => u.name === "A");
    expect(A.relicGap).toBe(5); expect(A.gearGap).toBe(4);
    expect(A.relicDays).toBe(5); expect(A.gearDays).toBe(4); expect(A.days).toBe(9);
    expect(A.done).toBe(false);
  });
  it("una unidad ya en objetivo → done, 0 días", () => {
    const B = plan().units.find(u => u.name === "B");
    expect(B.done).toBe(true); expect(B.days).toBe(0);
  });
  it("orden: pendientes primero (más barato antes), hechas al final; determinista", () => {
    const names = plan().order.map(u => u.name);
    expect(names).toEqual(["C", "A", "B"]); // C=4d, A=9d, B=done
    expect(plan().order.map(u => u.name)).toEqual(names); // estable
  });
  it("totales coherentes", () => {
    const t = plan().totals;
    expect(t.relicGap).toBe(7); expect(t.gearGap).toBe(6);
    expect(t.days).toBe(13); expect(t.weeks).toBe(2);
    expect(t.unlocked).toBe(false);
  });
  it("más energía diaria → menos días de gear (relic no cambia)", () => {
    const slow = plan(RD, 500).units.find(u => u.name === "A"); // gearDays = 4*1000/500 = 8
    const fast = plan(RD, 2000).units.find(u => u.name === "A"); // gearDays = 4*1000/2000 = 2
    expect(slow.gearDays).toBe(8); expect(fast.gearDays).toBe(2);
    expect(slow.relicDays).toBe(fast.relicDays); // el relic no depende de la energía
  });
  it("unlocked=true si Lord Vader está en el roster; fallback embebido si falta la unidad", () => {
    expect(plan({ R: [{ n: "Lord Vader", rl: 5, g: 13 }] }).totals.unlocked).toBe(true);
    // C ausente en RD → usa relic/gear embebidos de LV (relic 3, gear 11)
    const C = plan({ R: [] }).units.find(u => u.name === "C");
    expect(C.curRelic).toBe(3); expect(C.curGear).toBe(11);
  });
});

describe("store — energía del planificador de Vader", () => {
  const fake = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
  it("roundtrip save/load", () => {
    const s = fake(); saveEnergy(600, s); expect(loadEnergy(s)).toBe(600);
  });
  it("sin datos o valor inválido → null", () => {
    expect(loadEnergy(fake())).toBe(null);
    const s = fake(); expect(saveEnergy(-5, s)).toBe(false); expect(loadEnergy(s)).toBe(null);
  });
});
