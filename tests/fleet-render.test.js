// @vitest-environment jsdom
// Render REAL de la pestaña Flota (Fase 4.3): con naves en vivo y con el fallback embebido.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

beforeEach(() => {
  globalThis.requestAnimationFrame = cb => cb(0);
  document.open(); document.write(TPL); document.close();
  vi.resetModules();
});

async function boot(extra) {
  const { init } = await import("../web/src/ui.js");
  const { RD } = await import("../web/src/data.js");
  init(RD, extra);
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe("Flota — render y filtros", () => {
  it("hay pestaña 09 Flota y su panel; con el snapshot embebido pinta flotas (nunca en blanco)", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect([...document.querySelectorAll(".tab")].some(t => t.dataset.p === "fleet")).toBe(true);
    expect($("#fleet-stats").children.length).toBe(4);
    expect($$("#fleet-list .fleet-card").length).toBeGreaterThan(0);
    expect($("#fleet-src").textContent).toMatch(/embebido/i);
  });
  it("hay al menos una flota montable (capital + titulares 7★) con badge ✓", async () => {
    await boot({});
    expect($$("#fleet-list .fleet-card.st-2").length).toBeGreaterThan(0);
    expect($("#fleet-list").textContent).toMatch(/Montable/);
  });
  it("marca en vivo cuando llegan naves del endpoint", async () => {
    const { SHIPS_EMBED } = await import("../web/src/data/ships.js");
    await boot({ fleet: { owned: SHIPS_EMBED, live: true } });
    expect($("#fleet-src").textContent).toMatch(/en vivo/i);
  });
  it("filtra por tier sin romper", async () => {
    await boot({});
    const sel = $("#fleet-tier"); sel.value = "S"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    // las S no son montables (capital no poseída) → siguen apareciendo como tarjetas
    expect($$("#fleet-list .fleet-card, #fleet-list .pg-empty").length).toBeGreaterThan(0);
  });
  it("el resto de pestañas siguen vivas", async () => {
    await boot({});
    expect($("#rx-grid").children.length).toBeGreaterThan(0);
    expect($("#modstats").children.length).toBe(4);
  });
});
