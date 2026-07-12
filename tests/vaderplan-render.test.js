// @vitest-environment jsdom
// Render REAL de la card del planificador de Vader (Fase 4.2): pinta totales + lista y reacciona
// al input de energía, sin romper el resto de la pestaña.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

beforeEach(() => {
  globalThis.requestAnimationFrame = cb => cb(0);
  try { localStorage.clear(); } catch { /* noop */ }
  document.open(); document.write(TPL); document.close();
  vi.resetModules();
});

async function boot() {
  const { init } = await import("../web/src/ui.js");
  const { RD } = await import("../web/src/data.js");
  init(RD, {});
}
const $ = s => document.querySelector(s);

describe("Vader — planificador de energía", () => {
  it("pinta totales y lista priorizada; nunca en blanco", async () => {
    await expect(boot()).resolves.not.toThrow();
    expect($("#vp-stats").children.length).toBe(4);
    expect($("#vp-list").children.length).toBeGreaterThan(0);
    expect($("#vp-note").textContent).toMatch(/ETA/);
  });
  it("cambiar la energía diaria recalcula la ETA y persiste", async () => {
    await boot();
    const before = $("#vp-note").textContent;
    const inp = $("#vp-energy"); inp.value = "240"; inp.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect($("#vp-note").textContent).not.toBe(before);
    expect($("#vp-note").textContent).toMatch(/240/);
    // Fase 4.6: la energía se guarda ya bajo la clave nueva swgoh.ascension.energy.
    expect(JSON.parse(localStorage.getItem("swgoh.ascension.energy"))).toBe(240);
  });
  it("restaura la energía guardada al recargar (migra la clave vieja swgoh.vader.energy)", async () => {
    localStorage.setItem("swgoh.vader.energy", "720"); // valor de la Fase 4.2
    await boot();
    expect($("#vp-energy").value).toBe("720");
    expect($("#vp-note").textContent).toMatch(/720/);
  });
  it("el roadmap y el resto de la pestaña Vader siguen vivos", async () => {
    await boot();
    expect($("#tl").children.length).toBeGreaterThan(0);   // roadmap narrativo intacto
    expect($("#lvfacts").children.length).toBeGreaterThan(0);
  });
});
