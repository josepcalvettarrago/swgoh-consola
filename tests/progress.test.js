// Capa de presentación de Progreso (pura). Estado vacío con 0 y 1 snapshot (nada roto),
// formateo de titulares en español con la semántica de arena correcta, y ranking de gremio.
import { describe, it, expect } from "vitest";
import { progressView, eventHeadline, arenaText, unitChangeText, sortedUnitChanges, guildRanking, EMPTY_MSG } from "../web/src/progress.js";

describe("progressView — estado vacío (fallback imprescindible)", () => {
  it("0 snapshots / 0 eventos -> vacío con el mensaje de histórico, sin excepción", () => {
    const v = progressView({ events: [], snapshots: [] });
    expect(v.empty).toBe(true);
    expect(v.reason).toBe(EMPTY_MSG);
  });

  it("1 snapshot y aún sin eventos -> sigue vacío (es lo normal al principio)", () => {
    const v = progressView({ events: [], snapshots: [{ ts: "t1", meta: {} }] });
    expect(v.empty).toBe(true);
  });

  it("sin argumentos -> no lanza y devuelve vacío", () => {
    expect(() => progressView()).not.toThrow();
    expect(progressView().empty).toBe(true);
  });

  it("con eventos -> no vacío", () => {
    const v = progressView({ events: [{ ts: "t", summary: {}, account: {}, units: [] }], snapshots: [] });
    expect(v.empty).toBe(false);
    expect(v.events).toHaveLength(1);
  });
});

describe("eventHeadline — titulares en español", () => {
  it("compone reliquias + GP + arena (mejora)", () => {
    const ev = {
      meta: { arenaRank: 221 },
      account: { gpDelta: 184000, arenaDelta: -7, arenaImproved: true },
      summary: { relicsGanados: 2, gearSubidos: 0, unidadesNuevas: 0, gpGanado: 184000 },
    };
    const parts = eventHeadline(ev);
    expect(parts).toContain("▲ +2 reliquias");
    expect(parts).toContain("+184.000 GP");
    // arena: 228 -> 221, con flecha de mejora
    expect(parts).toContain("▲ Arena 228 → 221");
  });

  it("arena que empeora usa ▼ y el número sube", () => {
    const ev = { meta: { arenaRank: 240 }, account: { arenaDelta: 19, arenaImproved: false }, summary: {} };
    expect(eventHeadline(ev)).toContain("▼ Arena 221 → 240");
  });

  it("unidad nueva y singular de reliquia", () => {
    const ev = { meta: {}, account: {}, summary: { relicsGanados: 1, unidadesNuevas: 1 } };
    const parts = eventHeadline(ev);
    expect(parts).toContain("▲ +1 reliquia");
    expect(parts).toContain("✦ 1 unidad nueva");
  });
});

describe("arenaText", () => {
  it("null cuando no hubo cambio de arena", () => {
    expect(arenaText({ meta: { arenaRank: 200 }, account: { arenaDelta: 0 } })).toBeNull();
  });
});

describe("unitChangeText / sortedUnitChanges", () => {
  it("traduce cada kind", () => {
    expect(unitChangeText({ kind: "relic", from: 5, to: 7 })).toBe("sube a Reliquia 7");
    expect(unitChangeText({ kind: "gear", from: 11, to: 13 })).toBe("G11 → G13");
    expect(unitChangeText({ kind: "stars", from: 6, to: 7 })).toBe("6★ → 7★");
    expect(unitChangeText({ kind: "nuevo", from: null, to: 7 })).toBe("nueva unidad · 7★");
  });

  it("ordena progresión antes que power", () => {
    const out = sortedUnitChanges([{ kind: "power" }, { kind: "relic" }, { kind: "nuevo" }]);
    expect(out.map(u => u.kind)).toEqual(["nuevo", "relic", "power"]);
  });
});

describe("guildRanking", () => {
  const guild = {
    name: "Catalonian Republic", memberCount: 3,
    members: [{ ally: 1, name: "A", gp: 12_000_000 }, { ally: 355463284, name: "Yusepi", gp: 9_883_300 }, { ally: 3, name: "C", gp: 4_000_000 }],
  };
  it("ordena por GP y localiza a Yusepi", () => {
    const r = guildRanking(guild, 355463284);
    expect(r.members[0].name).toBe("A");
    expect(r.myIndex).toBe(1);
  });
  it("sin miembros -> null (bloque se oculta)", () => {
    expect(guildRanking({ members: [] }, 1)).toBeNull();
    expect(guildRanking(null, 1)).toBeNull();
  });
});
