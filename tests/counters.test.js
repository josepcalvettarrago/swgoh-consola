// Tests del motor puro del Scout de counters (Fase 3). Sin DOM.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { THREAT_MAP, detectThreats, threatsToNeeds, matchArchetype, genScout } from "../web/src/counters.js";
import { assemble } from "../web/src/engine.js";
import { RD, CHAR_META } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COUNTER_DB = JSON.parse(readFileSync(resolve(__dirname, "../web/src/data/counter_db.json"), "utf8"));

// Helper: unidad de defensa sintética (solo lo que mira detectThreats).
const U = (i, a, r = "Attacker", c = []) => ({ i, n: i, s: "N", r, c, a, im: null });

describe("detectThreats", () => {
  it("defensa Nightsister/GL Leia -> revive + plague + tm_train", () => {
    const def = [
      U("A", ["Revive", "Gain Turn Meter"], "Healer", ["Nightsister"]),
      U("B", ["Plague", "Gain Turn Meter", "Bonus Turn"], "Support", ["Nightsister"]),
      U("C", ["Taunt"], "Tank", ["Nightsister"]),
    ];
    const th = detectThreats(def, {});
    expect(th).toContain("revive");
    expect(th).toContain("plague");
    expect(th).toContain("tm_train"); // 2x Gain Turn Meter supera el umbral
  });

  it("defensa Jedi/JMK -> counter + control", () => {
    const def = [
      U("K", ["Counter", "Foresight"], "Tank", ["Jedi"]),
      U("L", ["Stun", "Ability Block"], "Attacker", ["Jedi"]),
    ];
    const th = detectThreats(def, {});
    expect(th).toContain("counter");
    expect(th).toContain("control");
  });

  it("umbral de tm_train: un solo Gain Turn Meter NO dispara por count (sí por Bonus Turn)", () => {
    expect(detectThreats([U("X", ["Gain Turn Meter"])], {})).not.toContain("tm_train");
    expect(detectThreats([U("X", ["Bonus Turn"])], {})).toContain("tm_train");
  });

  it("wall exige Taunt+Protection Up en la MISMA unidad y rol Tank", () => {
    expect(detectThreats([U("T", ["Taunt", "Protection Up"], "Tank")], {})).toContain("wall");
    expect(detectThreats([U("T", ["Taunt"], "Tank"), U("P", ["Protection Up"], "Support")], {})).not.toContain("wall");
  });

  it("resuelve base_ids desde meta y devuelve orden estable/único", () => {
    const meta = { Z: { n: "Z", s: "D", r: "Attacker", c: [], a: ["Revive", "Counter"] } };
    const th = detectThreats(["Z", "Z"], meta);
    expect(th).toEqual(["revive", "counter"]); // orden de THREAT_ORDER, sin duplicados
  });
});

describe("threatsToNeeds", () => {
  it("mapea y deduplica en orden estable", () => {
    // revive y plague comparten needs -> deben quedar sin duplicar.
    expect(threatsToNeeds(["revive", "plague"])).toEqual(["Anti-Revive", "Buff Immunity", "Healing Immunity"]);
  });
  it("ignora amenazas desconocidas", () => {
    expect(threatsToNeeds(["revive", "no_existe"])).toEqual(THREAT_MAP.revive.needs);
  });
  it("todos los needs de la tabla son strings no vacíos", () => {
    for (const rule of Object.values(THREAT_MAP)) {
      expect(Array.isArray(rule.needs)).toBe(true);
      for (const n of rule.needs) expect(typeof n === "string" && n.length > 0).toBe(true);
    }
  });
});

describe("matchArchetype", () => {
  const asDef = ids => ids.map(id => ({ i: id, ...CHAR_META[id] }));
  it("acierta el arquetipo por líder + facción", () => {
    const def = asDef(["GREATMOTHERS", "MERRIN", "TALIA", "DAKA"]);
    const a = matchArchetype(def, COUNTER_DB);
    expect(a && a.id).toBe("ns_greatmothers");
  });
  it("devuelve null cuando nada cualifica (defensa sin líder ni facción conocida)", () => {
    const def = [U("NOBODY", ["Taunt"], "Tank", ["Ewok"])];
    expect(matchArchetype(def, COUNTER_DB)).toBe(null);
  });
  it("es determinista ante empate (mismo input -> mismo id)", () => {
    const def = asDef(["SUPREMELEADERKYLOREN", "KYLORENUNMASKED", "FIRSTORDEROFFICERMALE"]);
    expect(matchArchetype(def, COUNTER_DB).id).toBe(matchArchetype(def, COUNTER_DB).id);
  });
});

describe("genScout", () => {
  const run = defenseIds => genScout({ defenseIds, roster: RD, meta: CHAR_META, counterDb: COUNTER_DB, assemble });

  it("forma del objeto + heurístico montado con mi roster", () => {
    const r = run(["SUPREMELEADERKYLOREN", "KYLORENUNMASKED", "FIRSTORDEROFFICERMALE"]);
    expect(Array.isArray(r.threats)).toBe(true);
    expect(r.heuristic && Array.isArray(r.heuristic.team)).toBe(true);
    expect(r.heuristic.team.length).toBeLessThanOrEqual(5);
    // neutralized + missing particionan exactamente las amenazas detectadas.
    const cubiertas = r.neutralized.map(n => n.threat);
    expect([...cubiertas, ...r.missing].sort()).toEqual([...r.threats].sort());
  });

  it("respeta la unicidad de GL (máx. 1 Leyenda) incluso con team curado", () => {
    const r = run(["GREATMOTHERS", "MERRIN", "TALIA", "DAKA"]); // dispara ns_greatmothers (curated con GL Rey)
    expect(r.heuristic.team.filter(u => u.gl).length).toBeLessThanOrEqual(1);
  });

  it("es determinista: mismos inputs -> mismo output", () => {
    const ids = ["JABBATHEHUTT", "BOSSK", "BOBAFETT"];
    expect(run(ids)).toEqual(run(ids));
  });

  it("defensor sin metadata -> va a `unknown`, no rompe", () => {
    const r = run(["NO_EXISTE_XYZ", "BOSSK"]);
    expect(r.unknown).toContain("NO_EXISTE_XYZ");
    expect(r.defense.map(u => u.i)).toContain("BOSSK");
  });

  it("curated informa ownedPct de cada team del arquetipo", () => {
    const r = run(["GREATMOTHERS", "MERRIN", "TALIA", "DAKA"]);
    expect(r.archetype.id).toBe("ns_greatmothers");
    expect(r.curated.length).toBeGreaterThan(0);
    for (const c of r.curated) expect(c.ownedPct).toBeGreaterThanOrEqual(0);
  });
});

describe("unicidad de GL en el path forzado de assemble (no se reescribe assemble)", () => {
  it("dos GL forzadas -> el equipo final tiene como mucho una", () => {
    const gls = RD.R.filter(u => u.gl).slice(0, 2);
    expect(gls.length).toBe(2); // el roster de Yusepi tiene varias GL
    const R = assemble(RD.R, gls, ["Buff Immunity"]);
    expect(R.team.filter(u => u.gl).length).toBeLessThanOrEqual(1);
  });
});
