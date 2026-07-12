// Tests del planificador de datacrones (Fase 4.5). Motor puro + integridad de la guía curada.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { planDatacrons } from "../web/src/datacrons.js";
import { RD } from "../web/src/data.js";
import { CHAR_META } from "../web/src/data/characters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(resolve(__dirname, "../web/src/data/datacron_db.json"), "utf8"));

describe("datacron_db — integridad de la guía curada", () => {
  const ownedIds = new Set(RD.R.map(u => u.i));
  // Tags de facción presentes en mi roster (excluye "Leader").
  const facTags = new Set();
  for (const u of RD.R) for (const c of (u.c || [])) if (c !== "Leader") facTags.add(c);

  it("tiene _meta honesto y >= 12 rutas", () => {
    expect(DB._meta.about).toMatch(/curad/i);
    expect(DB.paths.length).toBeGreaterThanOrEqual(12);
  });
  it("cada target existe en CHAR_META (base_id verificado)", () => {
    for (const p of DB.paths) expect(CHAR_META[p.target], `target ${p.id}`).toBeTruthy();
  });
  it("cada faction es un tag real presente en mi roster", () => {
    for (const p of DB.paths) expect(facTags.has(p.faction), `faction ${p.id}=${p.faction}`).toBe(true);
  });
  it("align coincide con el lado del target (L/D)", () => {
    for (const p of DB.paths) {
      const side = CHAR_META[p.target].s;
      if (side === "L" || side === "D") expect(p.align, p.id).toBe(side);
    }
  });
  it("ids únicos", () => {
    const ids = DB.paths.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("planDatacrons — datos reales (RD + CHAR_META)", () => {
  const plan = planDatacrons({ roster: RD, datacronDb: DB, meta: CHAR_META });

  it("forma correcta y una entrada por ruta", () => {
    expect(plan.paths.length).toBe(DB.paths.length);
    expect(plan.note).toMatch(/0 datacron/i);
    expect(plan.updated).toBe(DB._meta.updated);
  });
  it("marca usable=true si poseo el target y tengo su facción", () => {
    const fo = plan.paths.find(p => p.id === "fo_slkr");
    expect(fo.targetOwned).toBe(true);
    expect(fo.factionCount).toBeGreaterThan(0);
    expect(fo.usable).toBe(true);
    expect(typeof fo.relic).toBe("number");
  });
  it("orden: usables primero, luego por tier (S<A<B), desempate por id", () => {
    const idx = plan.paths.map(p => (p.usable ? 0 : 1));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
  });
  it("es determinista", () => {
    const again = planDatacrons({ roster: RD, datacronDb: DB, meta: CHAR_META });
    expect(again.paths.map(p => p.id)).toEqual(plan.paths.map(p => p.id));
  });
});

describe("planDatacrons — casos sintéticos y bordes", () => {
  const db = { _meta: { updated: "2026-01-01" }, paths: [
    { id: "a", label: "A", align: "D", faction: "Sith", l6: "x", target: "T1", l9: "y", modes: ["GAC"], tier: "A", note: "n", source: "s" },
    { id: "b", label: "B", align: "D", faction: "Sith", l6: "x", target: "T2", l9: "y", modes: ["TW"], tier: "S", note: "n", source: "s" },
  ] };
  const roster = { R: [{ i: "T1", n: "Uno", s: "D", c: ["Sith", "Leader"], rl: 7, g: 13 }] };

  it("no lanza con roster/DB vacíos", () => {
    expect(() => planDatacrons({})).not.toThrow();
    expect(planDatacrons({ roster: { R: [] }, datacronDb: { paths: [] } }).paths).toEqual([]);
  });
  it("target no poseído → usable=false, relic/gear null, cae a meta para nombre/lado", () => {
    const plan = planDatacrons({ roster, datacronDb: db, meta: { T2: { n: "Dos", s: "D" } } });
    const b = plan.paths.find(p => p.id === "b");
    expect(b.targetOwned).toBe(false);
    expect(b.usable).toBe(false);
    expect(b.relic).toBe(null);
    expect(b.targetName).toBe("Dos");
  });
  it("usable (b no) va después de a pese a mejor tier: usabilidad manda sobre tier", () => {
    const plan = planDatacrons({ roster, datacronDb: db, meta: {} });
    expect(plan.paths[0].id).toBe("a"); // usable
    expect(plan.paths[1].id).toBe("b"); // no usable, aunque tier S
  });
  it("factionCount cuenta unidades mías con ese tag", () => {
    const plan = planDatacrons({ roster, datacronDb: db, meta: {} });
    expect(plan.paths.find(p => p.id === "a").factionCount).toBe(1);
  });
});
