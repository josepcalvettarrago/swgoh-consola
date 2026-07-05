// Normalizador de gremio (Fase 2) contra un fixture REAL recortado de swgoh.gg
// (/api/guild-profile/{id}/). Verifica el resumen por miembro, el ranking por GP y que
// NO se inventan datos que la API no da (arena_rank / glCount por miembro).
import { describe, it, expect } from "vitest";
import { normalizeGuild } from "../worker/src/normalize.js";
import guild from "./fixtures/guild.sample.json";

describe("normalizeGuild", () => {
  const g = normalizeGuild(guild);

  it("extrae cabecera del gremio", () => {
    expect(g.name).toBe("Catalonian Republic");
    expect(g.memberCount).toBe(3);
    expect(typeof g.gp).toBe("number");
    expect(g.gp).toBeGreaterThan(0);
  });

  it("resumen por miembro con las claves esperadas (sin inventar arena/gl)", () => {
    const m = g.members[0];
    expect(Object.keys(m).sort()).toEqual(["ally", "gp", "league", "level", "name", "season", "squad"].sort());
    expect(m).not.toHaveProperty("arenaRank");
    expect(m).not.toHaveProperty("glCount");
  });

  it("ordena los miembros por GP descendente", () => {
    for (let i = 1; i < g.members.length; i++) {
      expect(g.members[i - 1].gp).toBeGreaterThanOrEqual(g.members[i].gp);
    }
  });

  it("incluye a Yusepi con su GP real", () => {
    const yus = g.members.find(m => m.name === "Yusepi");
    expect(yus).toBeTruthy();
    expect(yus.gp).toBe(9883300);
    expect(yus.ally).toBe(355463284);
  });

  it("acepta también el objeto data directamente (sin envoltorio)", () => {
    const g2 = normalizeGuild(guild.data);
    expect(g2.name).toBe("Catalonian Republic");
    expect(g2.members).toHaveLength(3);
  });
});
