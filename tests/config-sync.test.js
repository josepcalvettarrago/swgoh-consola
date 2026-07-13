// @vitest-environment jsdom
// Sync de la config por-usuario (Fase 5.1): sesión en store.js, export/import de las 8 claves,
// notificación de cambios y last-write-wins de syncConfig (main.js) con fetch inyectado.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

beforeEach(() => {
  let clock = 0;
  globalThis.performance = { now: () => (clock += 600) };
  globalThis.requestAnimationFrame = cb => cb(performance.now());
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  document.open(); document.write(TPL); document.close();
  try { window.localStorage.clear(); } catch { /* jsdom sin storage */ }
  vi.resetModules();
});

describe("store — sesión (swgoh.auth.session)", () => {
  it("saveAuth/loadAuth/clearAuth roundtrip; basura => null", async () => {
    const { saveAuth, loadAuth, clearAuth } = await import("../web/src/store.js");
    expect(loadAuth()).toBeNull();
    expect(saveAuth({ token: "T", ally: "222", name: "Wampa", role: "admin" })).toBe(true);
    expect(loadAuth()).toEqual({ token: "T", ally: "222", name: "Wampa", role: "admin" });
    expect(saveAuth({ ally: "sin token" })).toBe(false);
    window.localStorage.setItem("swgoh.auth.session", "{basura");
    expect(loadAuth()).toBeNull();
    saveAuth({ token: "T2", ally: "1" });
    clearAuth();
    expect(loadAuth()).toBeNull();
  });
});

describe("store — export/import de config + notificación de cambios", () => {
  it("exportConfig recoge lo guardado; save* estampa updatedAt y avisa al listener", async () => {
    const s = await import("../web/src/store.js");
    let pings = 0;
    s.onConfigChange(() => pings++);
    expect(s.loadConfigTs()).toBe(0);
    s.saveEnergy(600);
    s.saveTarget("GENERALSKYWALKER");
    s.savePrios(["legendary", "journey", "galactic_legend"]);
    expect(pings).toBe(3);
    expect(s.loadConfigTs()).toBeGreaterThan(0);
    const cfg = s.exportConfig();
    expect(cfg.energy).toBe(600);
    expect(cfg.target).toBe("GENERALSKYWALKER");
    expect(cfg.prios[0]).toBe("legendary");
  });
  it("importConfig escribe validando, fija el ts remoto y NO re-dispara el listener", async () => {
    const s = await import("../web/src/store.js");
    let pings = 0;
    s.onConfigChange(() => pings++);
    const ok = s.importConfig({ energy: 750, target: "JEDIMASTERKENOBI", pins: ["LORDVADER"], HACK: "fuera" }, 999111);
    expect(ok).toBe(true);
    expect(pings).toBe(0); // un pull nunca provoca un push
    expect(s.loadEnergy()).toBe(750);
    expect(s.loadTarget()).toBe("JEDIMASTERKENOBI");
    expect(s.loadPins()).toEqual(["LORDVADER"]);
    expect(s.loadConfigTs()).toBe(999111);
  });
});

describe("syncConfig (main.js) — last-write-wins por updatedAt", () => {
  function fetchMock(routes, calls = []) {
    return async (url, opts = {}) => {
      calls.push({ url, opts });
      const method = opts.method || "GET";
      const hit = routes[`${method} ${url.split("/").slice(-2).join("/")}`];
      return { ok: !!hit, status: hit ? 200 : 404, json: async () => hit || { error: "404" } };
    };
  }
  it("remoto más nuevo => pull (pisa el localStorage local)", async () => {
    const s = await import("../web/src/store.js");
    const { syncConfig } = await import("../web/src/main.js");
    s.saveEnergy(480); // ts local = ahora
    const remoteTs = Date.now() + 60000;
    const r = await syncConfig({ token: "T" }, { fetchImpl: fetchMock({ "GET api/config": { ok: true, config: { energy: 900 }, updatedAt: remoteTs } }) });
    expect(r.mode).toBe("pulled");
    expect(s.loadEnergy()).toBe(900);
    expect(s.loadConfigTs()).toBe(remoteTs);
  });
  it("local más nuevo (o remoto vacío) => push del export local", async () => {
    const s = await import("../web/src/store.js");
    const { syncConfig } = await import("../web/src/main.js");
    s.saveEnergy(555);
    const calls = [];
    const r = await syncConfig({ token: "T" }, {
      fetchImpl: fetchMock({ "GET api/config": { ok: true, config: null, updatedAt: 0 }, "PUT api/config": { ok: true } }, calls),
    });
    expect(r.mode).toBe("pushed");
    const put = calls.find(c => (c.opts.method || "GET") === "PUT");
    expect(put).toBeTruthy();
    expect(JSON.parse(put.opts.body).config.energy).toBe(555);
  });
  it("sin red => offline y el local queda intacto", async () => {
    const s = await import("../web/src/store.js");
    const { syncConfig } = await import("../web/src/main.js");
    s.saveEnergy(444);
    const r = await syncConfig({ token: "T" }, { fetchImpl: async () => { throw new Error("net"); } });
    expect(r.mode).toBe("offline");
    expect(s.loadEnergy()).toBe(444);
  });
});
