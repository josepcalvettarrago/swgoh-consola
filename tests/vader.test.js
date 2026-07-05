// Auto-marcado del roadmap de Lord Vader (Fase 2). Fase completada cuando las reliquias
// alcanzan el objetivo; en curso cuando hay progreso parcial; pendiente cuando nada empezó.
import { describe, it, expect } from "vitest";
import { vaderProgress } from "../web/src/vader.js";

// Datos mínimos inyectados (no dependemos del DATA real para el test).
const lv = {
  units: [
    { name: "Rex", relic: 6, need: 5 },
    { name: "Tusken", relic: 3, need: 5 },
    { name: "Embo", relic: 0, need: 5 },
  ],
};
const plan = [
  { n: 0, kind: "arena", title: "Blitz de mods" }, // sin targets -> manual
  {
    n: 1, kind: "relic", title: "Relics rápidos",
    targets: [{ name: "Rex", from: 6, to: 5 }, { name: "Tusken", from: 3, to: 5 }],
  },
  {
    n: 2, kind: "gear", title: "Gear + relic",
    targets: [{ name: "Embo", from: 0, to: 5 }],
  },
  { n: 4, kind: "unlock", title: "Evento Vader" },
];

const rd = R => ({ R });

describe("vaderProgress — unidades", () => {
  it("marca done cuando la reliquia actual alcanza el objetivo", () => {
    const p = vaderProgress(rd([{ n: "Rex", rl: 6 }, { n: "Tusken", rl: 5 }, { n: "Embo", rl: 0 }]), { lv, plan });
    const rex = p.units.find(u => u.name === "Rex");
    const embo = p.units.find(u => u.name === "Embo");
    expect(rex.done).toBe(true);
    expect(embo.done).toBe(false);
    expect(embo.gap).toBe(5);
    expect(p.unitsDone).toBe(2); // Rex y Tusken
    expect(p.unitsTotal).toBe(3);
  });

  it("usa la reliquia en vivo del roster, no el valor embebido", () => {
    // Tusken embebido R3, pero en vivo ya está a R5 -> done.
    const p = vaderProgress(rd([{ n: "Tusken", rl: 5 }]), { lv, plan });
    expect(p.units.find(u => u.name === "Tusken").done).toBe(true);
  });
});

describe("vaderProgress — fases", () => {
  it("fase COMPLETADA cuando todos los objetivos alcanzan su relic", () => {
    const p = vaderProgress(rd([{ n: "Rex", rl: 6 }, { n: "Tusken", rl: 5 }]), { lv, plan });
    expect(p.phases.find(f => f.n === 1).state).toBe("completada");
  });

  it("fase EN CURSO cuando solo parte de los objetivos está", () => {
    const p = vaderProgress(rd([{ n: "Rex", rl: 6 }, { n: "Tusken", rl: 4 }]), { lv, plan });
    const f1 = p.phases.find(f => f.n === 1);
    expect(f1.state).toBe("en curso");
    expect(f1.done).toBe(1);
    expect(f1.total).toBe(2);
  });

  it("fase PENDIENTE cuando ningún objetivo empezó", () => {
    const p = vaderProgress(rd([{ n: "Embo", rl: 0 }]), { lv, plan });
    expect(p.phases.find(f => f.n === 2).state).toBe("pendiente");
  });

  it("fase sin targets (arena) queda como manual", () => {
    const p = vaderProgress(rd([]), { lv, plan });
    expect(p.phases.find(f => f.n === 0).state).toBe("manual");
  });

  it("fase de desbloqueo: completada solo si Lord Vader está en el roster", () => {
    const sin = vaderProgress(rd([{ n: "Rex", rl: 6 }]), { lv, plan });
    expect(sin.phases.find(f => f.n === 4).state).toBe("pendiente");
    expect(sin.vaderUnlocked).toBe(false);
    const con = vaderProgress(rd([{ n: "Lord Vader", rl: 3 }]), { lv, plan });
    expect(con.phases.find(f => f.n === 4).state).toBe("completada");
    expect(con.vaderUnlocked).toBe(true);
  });
});

describe("vaderProgress — pct global", () => {
  it("porcentaje de relic acumulado hacia todos los objetivos", () => {
    // objetivos: 5+5+5 = 15; logrado min(6,5)+min(5,5)+min(0,5)=5+5+0=10 -> 67%
    const p = vaderProgress(rd([{ n: "Rex", rl: 6 }, { n: "Tusken", rl: 5 }, { n: "Embo", rl: 0 }]), { lv, plan });
    expect(p.pct).toBe(67);
  });
});
