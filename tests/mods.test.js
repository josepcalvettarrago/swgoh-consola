// Tests del auditor de mods (Fase 4.1). Motor puro, sembrado con el export real compactado.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { modQuality, auditMods, parseDisp, MOD_RULES, SET_MAP } from "../web/src/mods.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(resolve(__dirname, "fixtures/mods.sample.json"), "utf8"));

describe("parseDisp — gotcha display_value", () => {
  it("lee display_value como número humano, NUNCA el value escalado", () => {
    expect(parseDisp("7")).toBe(7);       // velocidad 7 (no 70000)
    expect(parseDisp("0.63%")).toBe(0.63);
    expect(parseDisp("")).toBe(0);
    expect(parseDisp(null)).toBe(0);
  });
});

describe("modQuality — estado OBJETIVO del mod", () => {
  it("mod dorado 6pts lv15 con velocidad alta → sin banderas de déficit", () => {
    const gold = { d: 6, col: 5, lv: 15, sec: [{ s: 5, v: "24", r: 5, q: 0.9 }] };
    const { flags, score } = modQuality(gold);
    expect(flags).not.toContain("unleveled");
    expect(flags).not.toContain("lowColor");
    expect(flags).not.toContain("noSpeed");
    expect(flags).toContain("sixDot");
    expect(flags).toContain("premiumSpeed");
    expect(score).toBeGreaterThan(90);
  });
  it("mod gris lv1 sin velocidad → unleveled + lowColor + noSpeed", () => {
    const gray = { d: 5, col: 1, lv: 1, sec: [{ s: 42, v: "8", r: 1, q: 0.1 }] };
    const { flags, score } = modQuality(gray);
    expect(flags).toEqual(expect.arrayContaining(["unleveled", "lowColor", "noSpeed"]));
    expect(score).toBeLessThan(30);
  });
  it("velocidad escalada se lee por display_value (7, no 70000)", () => {
    // secundaria de velocidad con display "7" → cuenta como spd 7, no premium.
    const m = { d: 6, col: 5, lv: 15, sec: [{ s: 5, v: "7", r: 1, q: 0.2 }] };
    expect(modQuality(m).spd).toBe(7);
    expect(modQuality(m).flags).not.toContain("premiumSpeed");
  });
});

describe("auditMods().global — cifras reales de la cuenta", () => {
  const a = auditMods(FX);
  it("reproduce el estado global exacto del export", () => {
    expect(a.global.total).toBe(1700);
    expect(a.global.unleveled).toBe(742);
    expect(a.global.speedGe[20]).toBe(17);
    expect(a.global.byDots[6]).toBe(238);
    expect(a.global.byColor.dorado).toBe(649);
    expect(a.global.byColor).toEqual({ gris: 267, verde: 159, azul: 368, morado: 257, dorado: 649 });
    expect(a.global.avgSpeed).toBe(7);
  });
});

describe("auditMods().offenders — priorización por inversión", () => {
  const a = auditMods(FX);
  it("incluye a las unidades relic'd con mods pobres (Aayla/Han/JK Revan)", () => {
    const ids = a.offenders.map(o => o.id);
    expect(ids).toContain("AAYLASECURA");
    expect(ids).toContain("HANSOLO");
    expect(ids).toContain("JEDIKNIGHTREVAN");
  });
  it("los relic'd con mods grises y +0 velocidad salen arriba", () => {
    // Han Solo R8 G13 con +0 vel de mods debe estar en cabeza.
    expect(a.offenders[0].id).toBe("HANSOLO");
    expect(a.offenders[0].spdMods).toBe(0);
  });
  it("cada ofensor lleva relic/gear/spdMods/worstMods y un porqué en español", () => {
    const o = a.offenders.find(x => x.id === "HANSOLO");
    expect(o.gear).toBe(13);
    expect(Array.isArray(o.worstMods)).toBe(true);
    expect(o.why).toMatch(/vel de mods/);
  });
  it("es determinista: mismo input → mismo orden", () => {
    expect(auditMods(FX).offenders.map(o => o.id)).toEqual(a.offenders.map(o => o.id));
  });
});

describe("auditMods().quickWins — honesto, sin gasto", () => {
  const a = auditMods(FX);
  it("nunca sugiere gastar dinero (coste 'barato'/'gratis')", () => {
    for (const w of a.quickWins.level) expect(w.cost).not.toMatch(/€|\$|cristal|dinero/i);
    for (const w of a.quickWins.move) expect(w.cost).toMatch(/gratis/);
  });
  it("'move' reubica un mod de velocidad premium de banquillo → unidad clave", () => {
    for (const w of a.quickWins.move) { expect(w.spd).toBeGreaterThanOrEqual(MOD_RULES.premiumSpeed); expect(w.from).toBeTruthy(); expect(w.to).toBeTruthy(); expect(w.from).not.toBe(w.to); }
  });
  it("estable ante reordenación de la entrada (determinista)", () => {
    const shuffled = { units: FX.units, mods: FX.mods.slice().reverse() };
    expect(auditMods(shuffled).quickWins.level.map(w => w.unit)).toEqual(a.quickWins.level.map(w => w.unit));
  });
});

describe("SET_MAP — mapeo verificado (no adivinado)", () => {
  it("sets de 4 piezas = Ofensiva/Velocidad/Daño Crítico", () => {
    expect(SET_MAP[2].pieces).toBe(4); expect(SET_MAP[4].pieces).toBe(4); expect(SET_MAP[6].pieces).toBe(4);
    expect(SET_MAP[4].n).toBe("Velocidad");
    expect([1, 3, 5, 7, 8].every(k => SET_MAP[k].pieces === 2)).toBe(true);
  });
});
