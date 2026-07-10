// Tests de la persistencia local del War Room (Fase 3.1). Storage falso inyectado — no toca
// el localStorage real y prueba los guardas ante fallo.
import { describe, it, expect } from "vitest";
import { loadLocked, saveLocked, loadBoard, saveBoard, clearBoard } from "../web/src/store.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), _map: m };
}
function throwingStorage() {
  return { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
}

describe("store — bloqueo de defensa", () => {
  it("roundtrip save/load y dedup", () => {
    const s = fakeStorage();
    saveLocked(["A", "B", "A"], s);
    expect(loadLocked(s).sort()).toEqual(["A", "B"]);
  });
  it("sin datos -> array vacío", () => {
    expect(loadLocked(fakeStorage())).toEqual([]);
  });
  it("no lanza si el storage falla", () => {
    expect(() => saveLocked(["A"], throwingStorage())).not.toThrow();
    expect(loadLocked(throwingStorage())).toEqual([]);
  });
});

describe("store — tablero", () => {
  it("roundtrip con saneo de size/order/teams", () => {
    const s = fakeStorage();
    saveBoard({ size: 3, order: "manual", teams: [{ defenseIds: ["A", "B"] }, { defenseIds: ["C"] }] }, s);
    const b = loadBoard(s);
    expect(b.size).toBe(3);
    expect(b.order).toBe("manual");
    expect(b.teams).toEqual([{ defenseIds: ["A", "B"] }, { defenseIds: ["C"] }]);
  });
  it("valores raros -> defaults saneados (size 5, order auto)", () => {
    const s = fakeStorage();
    saveBoard({ size: 99, order: "xxx", teams: [{ defenseIds: ["A"] }] }, s);
    const b = loadBoard(s);
    expect(b.size).toBe(5);
    expect(b.order).toBe("auto");
  });
  it("board ausente o inválido -> null", () => {
    expect(loadBoard(fakeStorage())).toBe(null);
  });
  it("clearBoard borra el tablero pero no toca el bloqueo", () => {
    const s = fakeStorage();
    saveLocked(["A"], s);
    saveBoard({ size: 5, order: "auto", teams: [{ defenseIds: ["A"] }] }, s);
    clearBoard(s);
    expect(loadBoard(s)).toBe(null);
    expect(loadLocked(s)).toEqual(["A"]);
  });
  it("recorta a 6 equipos máximo", () => {
    const s = fakeStorage();
    saveBoard({ size: 5, order: "auto", teams: Array.from({ length: 9 }, () => ({ defenseIds: ["A"] })) }, s);
    expect(loadBoard(s).teams.length).toBe(6);
  });
});
