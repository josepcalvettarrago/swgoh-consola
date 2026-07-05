// Diff engine puro (Fase 2). Cubre: subida de reliquia, gear, estrellas, delta de GP,
// mejora de arena con el signo correcto, unidad nueva, diff vacío, y el dedup por hash.
import { describe, it, expect } from "vitest";
import { diffSnapshots, compactSnapshot, snapshotHash, isEmptyDiff } from "../web/src/diff.js";

// Helper: snapshot compacto a partir de unidades sueltas + meta.
const snap = (units, meta = {}) => ({
  ts: "2026-07-05T00:00:00Z",
  meta: { gp: meta.gp ?? 1000, arenaRank: meta.arenaRank ?? 200, name: meta.name ?? "Yusepi" },
  units,
});
const U = (i, o = {}) => ({ i, n: o.n || i, t: o.t ?? 7, g: o.g ?? 13, rl: o.rl ?? 0, p: o.p ?? 10000 });

describe("diffSnapshots — unidades", () => {
  it("subida de reliquia: kind relic con from/to y suma en relicsGanados", () => {
    const prev = snap([U("A", { rl: 5 })]);
    const curr = snap([U("A", { rl: 7 })]);
    const d = diffSnapshots(prev, curr);
    expect(d.units).toEqual([{ i: "A", n: "A", kind: "relic", from: 5, to: 7 }]);
    expect(d.summary.relicsGanados).toBe(2);
    expect(d.summary.unidadesMejoradas).toBe(1);
  });

  it("subida de gear", () => {
    const d = diffSnapshots(snap([U("A", { g: 11 })]), snap([U("A", { g: 13 })]));
    expect(d.units).toEqual([{ i: "A", n: "A", kind: "gear", from: 11, to: 13 }]);
    expect(d.summary.gearSubidos).toBe(2);
  });

  it("subida de estrellas", () => {
    const d = diffSnapshots(snap([U("A", { t: 6 })]), snap([U("A", { t: 7 })]));
    expect(d.units).toEqual([{ i: "A", n: "A", kind: "stars", from: 6, to: 7 }]);
    expect(d.summary.unidadesMejoradas).toBe(1);
  });

  it("cambio de power: kind power (no cuenta como unidad mejorada de progresión)", () => {
    const d = diffSnapshots(snap([U("A", { p: 10000 })]), snap([U("A", { p: 12000 })]));
    expect(d.units).toEqual([{ i: "A", n: "A", kind: "power", from: 10000, to: 12000 }]);
    expect(d.summary.unidadesMejoradas).toBe(0);
  });

  it("unidad nueva: presente en curr y no en prev -> kind nuevo", () => {
    const prev = snap([U("A")]);
    const curr = snap([U("A"), U("B", { n: "Lord Vader", t: 7 })]);
    const d = diffSnapshots(prev, curr);
    expect(d.units).toEqual([{ i: "B", n: "Lord Vader", kind: "nuevo", from: null, to: 7 }]);
    expect(d.summary.unidadesNuevas).toBe(1);
    expect(d.summary.unidadesMejoradas).toBe(1);
  });

  it("varias dimensiones a la vez en una misma unidad -> una entrada por dimensión", () => {
    const d = diffSnapshots(snap([U("A", { g: 11, rl: 0 })]), snap([U("A", { g: 13, rl: 2 })]));
    const kinds = d.units.map(u => u.kind).sort();
    expect(kinds).toEqual(["gear", "relic"]);
    expect(d.summary.unidadesMejoradas).toBe(1); // misma unidad, no se cuenta dos veces
  });
});

describe("diffSnapshots — cuenta (GP y arena)", () => {
  it("delta de GP", () => {
    const d = diffSnapshots(snap([], { gp: 9_700_000 }), snap([], { gp: 9_884_000 }));
    expect(d.account.gpDelta).toBe(184_000);
    expect(d.summary.gpGanado).toBe(184_000);
  });

  it("ARENA: bajar de número es MEJORA (228 -> 221) -> arenaImproved=true, arenaDelta negativo", () => {
    const d = diffSnapshots(snap([], { arenaRank: 228 }), snap([], { arenaRank: 221 }));
    expect(d.account.arenaDelta).toBe(-7);
    expect(d.account.arenaImproved).toBe(true);
  });

  it("ARENA: subir de número es EMPEORAR (221 -> 240) -> arenaImproved=false", () => {
    const d = diffSnapshots(snap([], { arenaRank: 221 }), snap([], { arenaRank: 240 }));
    expect(d.account.arenaDelta).toBe(19);
    expect(d.account.arenaImproved).toBe(false);
  });
});

describe("diff vacío", () => {
  it("dos snapshots idénticos -> sin cambios y isEmptyDiff true", () => {
    const s = snap([U("A", { rl: 5 })], { gp: 9_000_000, arenaRank: 200 });
    const d = diffSnapshots(s, s);
    expect(d.units).toHaveLength(0);
    expect(isEmptyDiff(d)).toBe(true);
  });

  it("un cambio cualquiera -> isEmptyDiff false", () => {
    const d = diffSnapshots(snap([U("A", { rl: 5 })]), snap([U("A", { rl: 6 })]));
    expect(isEmptyDiff(d)).toBe(false);
  });
});

describe("dedup por hash (compactSnapshot + snapshotHash)", () => {
  const rd = { R: [{ i: "A", n: "A", t: 7, g: 13, rl: 5, p: 10000 }, { i: "B", n: "B", t: 7, g: 12, rl: 0, p: 8000 }] };
  const meta = { gp: 9_000_000, arena: 228, name: "Yusepi" };

  it("mismo estado -> mismo hash (no generaría snapshot/evento)", () => {
    const a = snapshotHash(compactSnapshot(rd, meta, "t1"));
    const b = snapshotHash(compactSnapshot(rd, meta, "t2")); // ts distinto NO afecta al hash
    expect(a).toBe(b);
  });

  it("el orden de las unidades no altera el hash", () => {
    const rd2 = { R: [rd.R[1], rd.R[0]] };
    expect(snapshotHash(compactSnapshot(rd2, meta))).toBe(snapshotHash(compactSnapshot(rd, meta)));
  });

  it("cualquier cambio real (relic) cambia el hash", () => {
    const rd2 = { R: [{ ...rd.R[0], rl: 6 }, rd.R[1]] };
    expect(snapshotHash(compactSnapshot(rd2, meta))).not.toBe(snapshotHash(compactSnapshot(rd, meta)));
  });

  it("un cambio de GP (meta) cambia el hash", () => {
    expect(snapshotHash(compactSnapshot(rd, { ...meta, gp: 9_100_000 }))).not.toBe(snapshotHash(compactSnapshot(rd, meta)));
  });
});

describe("compactSnapshot — forma", () => {
  it("solo lleva i,n,t,g,rl,p por unidad y meta {gp,arenaRank,name}", () => {
    const s = compactSnapshot({ R: [{ i: "A", n: "A", s: "D", c: ["x"], a: ["y"], t: 7, g: 13, rl: 5, p: 10000 }] }, { gp: 5, arena: 228, name: "Yusepi" }, "ts1");
    expect(Object.keys(s.units[0]).sort()).toEqual(["g", "i", "n", "p", "rl", "t"]);
    expect(s.meta).toEqual({ gp: 5, arenaRank: 228, name: "Yusepi" });
    expect(s.ts).toBe("ts1");
  });
});
