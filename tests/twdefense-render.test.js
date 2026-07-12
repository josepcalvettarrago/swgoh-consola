// @vitest-environment jsdom
// Render REAL de la pestaña TW (Fase 4.4): monta escuadrones por zonas, reacciona a la config
// (persistida), muestra contexto de gremio y nunca queda en blanco.
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

async function boot(extra) {
  const { init } = await import("../web/src/ui.js");
  const { RD } = await import("../web/src/data.js");
  init(RD, extra);
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe("TW — constructor de defensa", () => {
  it("pestaña 10 TW + panel; pinta zonas con escuadrones; nunca en blanco", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect([...document.querySelectorAll(".tab")].some(t => t.dataset.p === "tw")).toBe(true);
    expect($$("#tw-list .tw-zone").length).toBe(4);          // 4 zonas por defecto
    expect($$("#tw-list .tw-squad").length).toBe(20);        // 4×5
    expect($("#tw-stats").children.length).toBe(4);
  });
  it("ningún personaje se repite entre escuadrones (DOM)", async () => {
    await boot({});
    const names = $$("#tw-list .tw-squad .sn").map(e => e.textContent);
    expect(new Set(names).size).toBe(names.length);
  });
  it("cambiar zonas/defensas regenera y persiste", async () => {
    await boot({});
    const zi = $("#tw-zones"); zi.value = "2"; zi.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect($$("#tw-list .tw-zone").length).toBe(2);
    expect(JSON.parse(localStorage.getItem("swgoh.tw.format")).zones).toBe(2);
  });
  it("3v3 monta escuadrones de 3", async () => {
    await boot({});
    $$("#tw-size button").find(b => b.dataset.n === "3").click();
    const rows = $$("#tw-list .tw-squad")[0].querySelectorAll(".simrow").length;
    expect(rows).toBe(3);
  });
  it("contexto de gremio: muestra el rango si hay datos", async () => {
    const guild = { name: "G", memberCount: 3, members: [{ ally: "999", name: "Alfa", gp: 9 }, { ally: "355463284", name: "Yusepi", gp: 5 }, { ally: "1", name: "Beta", gp: 1 }] };
    await boot({ guild });
    expect($("#tw-stats").textContent).toMatch(/gremio/i);
    expect($("#tw-stats").textContent).toMatch(/2\/3/); // Yusepi 2º por GP
  });
  it("el resto de pestañas siguen vivas", async () => {
    await boot({});
    expect($("#rx-grid").children.length).toBeGreaterThan(0);
    expect($$("#fleet-list .fleet-card").length).toBeGreaterThan(0);
  });
});
