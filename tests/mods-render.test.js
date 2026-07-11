// @vitest-environment jsdom
// Render REAL de la pestaña Arena/Mods (Fase 4.1): con datos en vivo y con el fallback embebido.
// Garantiza que NUNCA queda en blanco y que los filtros del grid funcionan.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { auditMods } from "../web/src/mods.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");
const FX = JSON.parse(readFileSync(resolve(__dirname, "fixtures/mods.sample.json"), "utf8"));

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
const live = () => ({ audit: auditMods(FX), mods: FX.mods, units: FX.units, live: true });
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe("Arena/Mods — fallback embebido (sin backend)", () => {
  it("pinta estado global y ofensores; el grid en vivo queda oculto; nunca en blanco", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect($("#modstats").children.length).toBe(4);
    expect($("#d-unlev").textContent).not.toBe("—");
    expect($("#mods-offenders").children.length).toBeGreaterThan(0);
    expect($("#mods-src").textContent).toMatch(/embebido/i);
    expect($("#mods-grid-card").style.display).toBe("none"); // sin datos en vivo → sin grid
  });
});

describe("Arena/Mods — datos en vivo", () => {
  it("estado global refleja las cifras reales (742 sin subir, 17 vel≥20)", async () => {
    await boot({ mods: live() });
    expect($("#d-unlev").textContent).toBe("742");
    expect($("#d-spd20").textContent).toBe("17");
    expect($("#mods-src").textContent).toMatch(/en vivo/i);
  });
  it("muestra ofensores relic'd con mods pobres y quick-wins", async () => {
    await boot({ mods: live() });
    expect($("#mods-offenders").textContent).toMatch(/R\d+·G\d+/);
    expect($("#mods-quickwins").children.length).toBeGreaterThan(0);
  });
  it("el grid en vivo se muestra y filtra por color", async () => {
    await boot({ mods: live() });
    expect($("#mods-grid-card").style.display).not.toBe("none");
    const before = $$("#mods-grid .modcard").length;
    expect(before).toBeGreaterThan(0);
    const sel = $("#mods-fcolor"); sel.value = "5"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    // todas las tarjetas visibles son doradas (clase c-5)
    expect($$("#mods-grid .modcard").every(c => c.classList.contains("c-5"))).toBe(true);
    expect($("#mods-gridcount").textContent).toMatch(/649|mods/);
  });
  it("filtra por bandera 'sin velocidad' sin romper", async () => {
    await boot({ mods: live() });
    const sel = $("#mods-fflag"); sel.value = "noSpeed"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect($$("#mods-grid .modcard, #mods-grid .pg-empty").length).toBeGreaterThan(0);
  });
  it("el botón de export apunta a Grandivory y no revienta al copiar", async () => {
    await boot({ mods: live() });
    expect($("#grand-open").getAttribute("href")).toContain("grandivory.com");
    expect(() => $("#grand-copy").click()).not.toThrow();
  });
});
