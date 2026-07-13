// Fase 1: la carga del roster en vivo debe caer SIEMPRE al RD embebido si algo falla,
// para que la consola nunca se quede en blanco.
import { describe, it, expect } from "vitest";
import { loadRoster, loadMods } from "../web/src/main.js";
import { RD } from "../web/src/data.js";

describe("loadRoster() — fetch con fallback", () => {
  it("sin apiBase configurado -> usa el RD embebido", async () => {
    const r = await loadRoster({ apiBase: "" });
    expect(r).toBe(RD);
  });

  it("fetch que rechaza (red caída) -> RD embebido", async () => {
    const r = await loadRoster({ apiBase: "http://x", fetchImpl: () => Promise.reject(new Error("net down")) });
    expect(r).toBe(RD);
  });

  it("respuesta no-ok (503) -> RD embebido", async () => {
    const r = await loadRoster({ apiBase: "http://x", fetchImpl: async () => ({ ok: false, status: 503 }) });
    expect(r).toBe(RD);
  });

  it("forma inesperada -> RD embebido", async () => {
    const r = await loadRoster({ apiBase: "http://x", fetchImpl: async () => ({ ok: true, json: async () => ({ foo: 1 }) }) });
    expect(r).toBe(RD);
  });

  it("respuesta con forma RD válida -> se usa la respuesta en vivo", async () => {
    const live = { R: [{ i: "X", n: "X", s: "L", r: "Attacker", c: [], a: [], t: 7, g: 13, rl: 0, p: 1, gl: 0, ld: 0, im: "x" }], V: { factions: [], roles: [], abilities: [] } };
    const r = await loadRoster({ apiBase: "http://x", fetchImpl: async () => ({ ok: true, json: async () => live }) });
    expect(r).toBe(live);
  });
});

describe("loaders con sesión (Fase 5.2) — Authorization Bearer", () => {
  it("loadRoster con token manda Authorization: Bearer", async () => {
    let seen = null;
    const live = { R: [{ i: "X", n: "X", s: "L", r: "Attacker", c: [], a: [], t: 7, g: 13, rl: 0, p: 1, gl: 0, ld: 0, im: "x" }], V: { factions: [], roles: [], abilities: [] } };
    await loadRoster({ apiBase: "http://x", ally: "222", token: "TOK", fetchImpl: async (_u, opts) => { seen = opts; return { ok: true, json: async () => live }; } });
    expect(seen.headers.authorization).toBe("Bearer TOK");
  });
  it("sin token no manda cabeceras (compat con demo/Fase 1)", async () => {
    let seen = "unset";
    await loadRoster({ apiBase: "http://x", ally: "222", fetchImpl: async (_u, opts) => { seen = opts; return { ok: true, json: async () => RD }; } });
    expect(seen).toBeUndefined();
  });
  it("403 (roster de otro) -> fallback embebido, nunca en blanco", async () => {
    const r = await loadRoster({ apiBase: "http://x", ally: "999", token: "TOK", fetchImpl: async () => ({ ok: false, status: 403 }) });
    expect(r).toBe(RD);
  });
  it("loadMods con token manda Bearer; 401 -> auditoría embebida", async () => {
    let seen = null;
    const ok = await loadMods({ apiBase: "http://x", ally: "222", token: "TOK", fetchImpl: async (_u, opts) => { seen = opts; return { ok: true, json: async () => ({ mods: [], units: {} }) }; } });
    expect(seen.headers.authorization).toBe("Bearer TOK");
    expect(ok.live).toBe(true);
    const ko = await loadMods({ apiBase: "http://x", ally: "222", token: "TOK", fetchImpl: async () => ({ ok: false, status: 401 }) });
    expect(ko.live).toBe(false);
  });
});
