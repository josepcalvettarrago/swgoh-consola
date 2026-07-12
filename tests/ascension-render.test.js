// @vitest-environment jsdom
// Render REAL de la pestaña Ascensión (Fase 4.6): selector cambia objetivo, plan editable persiste,
// tab GL derivada de unlock_db + roster. La consola nunca en blanco.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

beforeEach(() => {
  // El anillo anima con step(timestamp) vía rAF; el reloj debe AVANZAR o step() recursaría sin fin.
  let clock = 0;
  globalThis.performance = { now: () => (clock += 600) };
  globalThis.requestAnimationFrame = cb => cb(performance.now());
  document.open(); document.write(TPL); document.close();
  try { window.localStorage.clear(); } catch { /* jsdom sin storage */ }
  vi.resetModules();
});

async function boot(extra) {
  const { init } = await import("../web/src/ui.js");
  const { RD } = await import("../web/src/data.js");
  init(RD, extra || {});
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe("Ascensión — selector, planificador y plan editable", () => {
  it("la tab 02 se llama Ascensión; por defecto Lord Vader (título + planificador)", async () => {
    await expect(boot()).resolves.not.toThrow();
    expect($$(".tab").find(t => t.dataset.p === "vader").textContent).toMatch(/Ascensión/);
    expect($("#asc-title").textContent).toMatch(/Lord Vader/);
    expect($$("#vp-list .vp-row").length).toBeGreaterThan(0);
    expect($$("#asc-list .asc-opt").length).toBeGreaterThan(0);
  });
  it("el planificador de Vader reproduce el gap real (57 relic / 17 gear)", async () => {
    await boot();
    const stats = $("#vp-stats").textContent;
    expect(stats).toMatch(/57/);
    expect(stats).toMatch(/17/);
  });
  it("elegir otro objetivo cambia el título y el planificador", async () => {
    await boot();
    const opt = $$("#asc-list .asc-opt").find(b => b.dataset.id === "GENERALSKYWALKER");
    expect(opt).toBeTruthy();
    opt.click();
    expect($("#asc-title").textContent).toMatch(/General Skywalker/);
    expect($$("#vp-list .vp-row").length).toBeGreaterThan(0); // no queda en blanco
  });
  it("filtrar el selector por tier reduce la lista", async () => {
    await boot();
    const sel = $("#asc-tier"); sel.value = "legendary"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    const ids = $$("#asc-list .asc-opt").map(b => b.dataset.id);
    expect(ids).toContain("JEDIKNIGHTREVAN");
    expect(ids).not.toContain("LORDVADER");
  });
  it("el plan semanal editable persiste (escribir → guardar en localStorage)", async () => {
    await boot();
    const ta = $("#asc-plan");
    ta.value = "farmear Bad Batch esta semana";
    ta.dispatchEvent(new window.Event("input", { bubbles: true }));
    const raw = window.localStorage.getItem("swgoh.ascension.plan");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).LORDVADER).toMatch(/Bad Batch/);
  });
});

describe("Galactic Legends — derivada de unlock_db + roster", () => {
  it("pinta poseídos y faltantes ordenados por cercanía; nunca en blanco", async () => {
    await boot();
    expect($$("#glowned .glcard").length).toBeGreaterThan(0);
    expect($$("#glmissing .glcard").length).toBeGreaterThan(0);
    expect($("#glmissing").textContent).toMatch(/PRÓXIMO/);
    expect($("#glcount").textContent).toMatch(/desbloqueados/);
    expect($("#gap1title").textContent).not.toBe("—"); // huecos del GL más cercano
  });
});

describe("resto de la consola intacto", () => {
  it("otras tabs siguen vivas tras generalizar Ascensión/GL", async () => {
    await boot();
    expect($("#modstats").children.length).toBe(4);
    expect($("#rx-grid").children.length).toBeGreaterThan(0);
    expect($$("#fleet-list .fleet-card").length).toBeGreaterThan(0);
    expect($$("#dc-list .dc-card").length).toBeGreaterThan(0);
  });
});
