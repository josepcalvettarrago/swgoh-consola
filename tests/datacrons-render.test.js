// @vitest-environment jsdom
// Render REAL de la pestaña Datacrons (Fase 4.5): guía curada con el roster embebido.
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
  init(RD, extra || {});
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe("Datacrons — render y filtros", () => {
  it("hay pestaña 11 Datacrons y su panel; pinta rutas (nunca en blanco)", async () => {
    await expect(boot()).resolves.not.toThrow();
    expect($$(".tab").some(t => t.dataset.p === "datacron")).toBe(true);
    expect($$("#dc-list .dc-card").length).toBeGreaterThan(0);
    expect($("#dc-list .statgrid").children.length).toBe(3);
  });
  it("el disclaimer honesto '0 datacrones / curada' está presente", async () => {
    await boot();
    expect($("#p-datacron").textContent).toMatch(/0 datacron/i);
    expect($("#p-datacron").textContent).toMatch(/curad/i);
  });
  it("las rutas aprovechables (poseo target) salen con badge y las hay", async () => {
    await boot();
    expect($$("#dc-list .dc-card.st-2").length).toBeGreaterThan(0);
    expect($("#dc-list").textContent).toMatch(/Aprovechable/);
  });
  it("filtra por facción sin romper", async () => {
    await boot();
    const sel = $("#dc-fac");
    expect(sel.options.length).toBeGreaterThan(1); // se rellenó con las facciones de la guía
    sel.value = "Sith"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect($$("#dc-list .dc-card, #dc-list .pg-empty").length).toBeGreaterThan(0);
    for (const c of $$("#dc-list .dc-card")) expect(c.textContent).toMatch(/Sith/);
  });
  it("filtra por modo (GAC/TW/Arena) sin romper", async () => {
    await boot();
    const btn = $$("#dc-mode button").find(b => b.dataset.v === "Arena");
    btn.click();
    expect($$("#dc-list .dc-card, #dc-list .pg-empty").length).toBeGreaterThan(0);
  });
  it("el callout de Arena/Mods enlaza a la pestaña Datacrons", async () => {
    await boot();
    const link = $('[data-goto="datacron"]'); expect(link).toBeTruthy();
    link.click();
    expect($("#p-datacron").classList.contains("on")).toBe(true);
  });
  it("el resto de pestañas siguen vivas", async () => {
    await boot();
    expect($("#rx-grid").children.length).toBeGreaterThan(0);
    expect($("#modstats").children.length).toBe(4);
    expect($$("#fleet-list .fleet-card").length).toBeGreaterThan(0);
  });
});
