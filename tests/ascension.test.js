// Tests del motor de ascensión (Fase 4.6): selección + prioridad sobre los motores de Vader,
// migración de campos de la entrada Vader, y persistencia (objetivo/plan/energía con migración).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveTarget, planFor, priorityQueue } from "../web/src/ascension.js";
import { vaderPlan } from "../web/src/vaderplan.js";
import { loadTarget, saveTarget, loadPlan, savePlan, loadEnergy, saveEnergy, loadPrios, savePrios } from "../web/src/store.js";
import { RD } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(resolve(__dirname, "../web/src/data/unlock_db.json"), "utf8"));
const fake = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

describe("resolveTarget", () => {
  it("id válido → esa entrada; inválido → LORDVADER (default)", () => {
    expect(resolveTarget(DB, "SUPREMELEADERKYLOREN").id).toBe("SUPREMELEADERKYLOREN");
    expect(resolveTarget(DB, "NO_EXISTE").id).toBe("LORDVADER");
    expect(resolveTarget(DB, null).id).toBe("LORDVADER");
  });
});

describe("planFor", () => {
  it("regresión Vader: reproduce el gap real (57 relic + 17 gear) contra el roster", () => {
    const t = resolveTarget(DB, "LORDVADER");
    const res = planFor(RD, t, { dailyGearEnergy: 480 });
    expect(res.totals.relicGap).toBe(57);
    expect(res.totals.gearGap).toBe(17);
    // idéntico a llamar vaderPlan directamente con la entrada como lv
    const direct = vaderPlan(RD, { lv: { units: t.units }, unlockName: t.name, dailyGearEnergy: 480 });
    expect(res.totals.relicGap).toBe(direct.totals.relicGap);
    expect(res.order.map(u => u.name)).toEqual(direct.order.map(u => u.name));
  });
  it("journey solo-gear: relic 0 → gap de relic 0 y gap de gear correcto (tgtGear por unidad)", () => {
    const target = { id: "X", name: "X", units: [
      { name: "AAA", stars: 7, gear: 12, relic: 0 },
      { name: "BBB", stars: 7, gear: 11, relic: 0 },
    ] };
    const rd = { R: [{ i: "aaa", n: "AAA", rl: 0, g: 9 }, { i: "bbb", n: "BBB", rl: 0, g: 11 }] };
    const res = planFor(rd, target, { dailyGearEnergy: 480 });
    expect(res.totals.relicGap).toBe(0);          // ningún relic requerido
    expect(res.totals.gearGap).toBe(3);           // AAA: 12-9=3 · BBB: 11-11=0
    const aaa = res.units.find(u => u.name === "AAA");
    expect(aaa.tgtGear).toBe(12); expect(aaa.gearGap).toBe(3); expect(aaa.relicGap).toBe(0);
  });
  it("target sin unidades / null → no lanza", () => {
    expect(() => planFor(RD, null)).not.toThrow();
    expect(planFor(RD, { id: "Z", name: "Z", units: [] }).totals.relicGap).toBe(0);
  });
});

describe("priorityQueue", () => {
  const db = { targets: [
    { id: "GL_A", name: "GL A", tier: "galactic_legend", units: [{ name: "u1", relic: 5, gear: 13 }] },
    { id: "GL_B", name: "GL B", tier: "galactic_legend", units: [{ name: "u2", relic: 3, gear: 13 }] },
    { id: "LEG_A", name: "Leg A", tier: "legendary", units: [{ name: "u3", relic: 0, gear: 12 }] },
    { id: "JRN_A", name: "Jrn A", tier: "journey", units: [{ name: "u4", relic: 0, gear: 11 }] },
  ] };
  it("un GL a la vez: el tier galactic_legend surface SOLO el más cercano", () => {
    const q = priorityQueue(db, ["galactic_legend"], { R: [] });
    const gl = q.find(x => x.tier === "galactic_legend");
    expect(gl.items.length).toBe(1);
    expect(gl.items[0].id).toBe("GL_B"); // menor gap (R3 < R5)
  });
  it("excluye objetivos ya desbloqueados (id en el roster)", () => {
    const q = priorityQueue(db, ["legendary"], { R: [{ i: "LEG_A", n: "Leg A" }] });
    expect(q.find(x => x.tier === "legendary").items.length).toBe(0);
  });
  it("respeta el orden de tiers pasado en prios", () => {
    const q = priorityQueue(db, ["journey", "legendary", "galactic_legend"], { R: [] });
    expect(q.map(x => x.tier)).toEqual(["journey", "legendary", "galactic_legend"]);
  });
});

describe("store — objetivo, plan y energía (con migración)", () => {
  it("objetivo roundtrip", () => {
    const s = fake(); expect(loadTarget(s)).toBe(null);
    saveTarget("GLREY", s); expect(loadTarget(s)).toBe("GLREY");
  });
  it("plan editable por objetivo roundtrip + borrado", () => {
    const s = fake();
    savePlan("GLREY", "mi plan", s); expect(loadPlan("GLREY", s)).toBe("mi plan");
    expect(loadPlan("OTRO", s)).toBe(null);
    savePlan("GLREY", "", s); expect(loadPlan("GLREY", s)).toBe(null);
  });
  it("migración de energía: clave vieja swgoh.vader.energy → nueva swgoh.ascension.energy", () => {
    const s = fake();
    s.setItem("swgoh.vader.energy", JSON.stringify(720)); // valor guardado por la Fase 4.2
    expect(loadEnergy(s)).toBe(720);                       // se lee de la vieja...
    expect(JSON.parse(s.getItem("swgoh.ascension.energy"))).toBe(720); // ...y se reescribe en la nueva
  });
  it("energía nueva tiene prioridad sobre la vieja", () => {
    const s = fake();
    s.setItem("swgoh.vader.energy", JSON.stringify(300));
    saveEnergy(500, s);
    expect(loadEnergy(s)).toBe(500);
  });
  it("prios roundtrip (Fase 4.7)", () => {
    const s = fake(); expect(loadPrios(s)).toBe(null);
    savePrios(["journey", "legendary", "galactic_legend"], s);
    expect(loadPrios(s)).toEqual(["journey", "legendary", "galactic_legend"]);
  });
});

describe("unlock_db — integridad", () => {
  it("todos los targets tienen id/name/tier/units y align L|D", () => {
    for (const t of DB.targets) {
      expect(t.id && t.name && t.tier).toBeTruthy();
      expect(["journey", "legendary", "galactic_legend"]).toContain(t.tier);
      expect(["L", "D"]).toContain(t.align);
      expect(Array.isArray(t.units) && t.units.length).toBeTruthy();
    }
  });
  it("hay 10 Galactic Legends y la entrada LORDVADER está", () => {
    expect(DB.targets.filter(t => t.tier === "galactic_legend").length).toBe(10);
    expect(DB.targets.find(t => t.id === "LORDVADER")).toBeTruthy();
  });
});
