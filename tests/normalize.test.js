// Normalizador contra fixtures REALES de swgoh.gg. Garantiza que la salida tiene la MISMA
// forma que el RD embebido y que las reglas críticas (offset de relic, filtro de naves,
// alignment, slug de imagen, ld) se cumplen exactamente.
import { describe, it, expect } from "vitest";
import { buildCharMap, normalizeRoster, buildFacets, relicLevel, slugFromImage, playerMeta } from "../worker/src/normalize.js";
import player from "./fixtures/player.sample.json";
import characters from "./fixtures/characters.sample.json";

const RD_KEYS = ["i", "n", "s", "r", "c", "a", "t", "g", "rl", "p", "gl", "ld", "im"];

describe("reglas unitarias", () => {
  it("relicLevel = max(0, relic_tier - 2)", () => {
    expect(relicLevel(10)).toBe(8);
    expect(relicLevel(8)).toBe(6);
    expect(relicLevel(5)).toBe(3);
    expect(relicLevel(1)).toBe(0);
    expect(relicLevel(0)).toBe(0);
  });
  it("slugFromImage extrae el slug entre tex.charui_ y .png", () => {
    expect(slugFromImage("https://game-assets.swgoh.gg/textures/tex.charui_kyloren_tros.png")).toBe("kyloren_tros");
    expect(slugFromImage(null)).toBeNull();
  });
});

describe("buildCharMap", () => {
  const map = buildCharMap(characters);
  it("descarta naves (combat_type !== 1)", () => {
    expect(map.FIRSTORDERTIEECHELON).toBeUndefined();
  });
  it("deriva alignment y ld correctamente", () => {
    expect(map.SUPREMELEADERKYLOREN.s).toBe("D");
    expect(map.HONDO.s).toBe("N");
    expect(map.SUPREMELEADERKYLOREN.ld).toBe(1);
    expect(map.KIX.ld).toBe(0);
  });
});

describe("normalizeRoster", () => {
  const map = buildCharMap(characters);
  const rd = normalizeRoster(player, map);
  const by = id => rd.R.find(u => u.i === id);

  it("excluye la nave del roster", () => {
    expect(by("FIRSTORDERTIEECHELON")).toBeUndefined();
  });

  it("cada unidad tiene exactamente las 13 claves de RD con tipos correctos", () => {
    for (const u of rd.R) {
      expect(Object.keys(u).sort()).toEqual([...RD_KEYS].sort());
      expect(typeof u.i).toBe("string");
      expect(["L", "D", "N"]).toContain(u.s);
      expect(Array.isArray(u.c)).toBe(true);
      expect(Array.isArray(u.a)).toBe(true);
      expect(typeof u.p).toBe("number");
      expect([0, 1]).toContain(u.gl);
      expect([0, 1]).toContain(u.ld);
    }
  });

  it("valores concretos coinciden con el RD embebido", () => {
    const slkr = by("SUPREMELEADERKYLOREN");
    expect(slkr).toMatchObject({ s: "D", r: "Attacker", t: 7, g: 13, rl: 8, gl: 1, ld: 1, im: "kyloren_tros" });
    expect(by("CT7567").rl).toBe(6);
    expect(by("KIX").rl).toBe(0);
    expect(by("HONDO").s).toBe("N");
    expect(by("GLLEIA")).toMatchObject({ r: "Tank", rl: 3, gl: 1, im: "leiaendor" });
  });

  it("V tiene la forma correcta (factions/roles/abilities)", () => {
    expect(rd.V.roles).toEqual(["Attacker", "Tank", "Support", "Healer"]);
    expect(Array.isArray(rd.V.factions)).toBe(true);
    expect(rd.V.factions.every(([n, c]) => typeof n === "string" && typeof c === "number")).toBe(true);
    expect(Array.isArray(rd.V.abilities)).toBe(true);
  });
});

describe("buildFacets", () => {
  it("cuenta facciones (excl. Leader) y ordena desc; abilities top 35", () => {
    const R = [
      { c: ["Leader", "Jedi", "Rebel"], a: ["Stun", "Dispel"] },
      { c: ["Jedi"], a: ["Stun"] },
    ];
    const V = buildFacets(R);
    expect(V.factions[0]).toEqual(["Jedi", 2]);
    expect(V.factions.find(([n]) => n === "Leader")).toBeUndefined();
    expect(V.abilities[0]).toEqual(["Stun", 2]);
    expect(V.abilities.length).toBeLessThanOrEqual(35);
  });
});

describe("playerMeta", () => {
  it("extrae los campos de cabecera", () => {
    const m = playerMeta(player);
    expect(m.name).toBe("Yusepi");
    expect(typeof m.gp).toBe("number");
    expect(m.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
