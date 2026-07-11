// @vitest-environment jsdom
// Render REAL del War Room (Fase 3.1/3.2/3.3) sobre el DOM del template. Cubre la holomesa con
// ranuras tipo juego (huecos vacíos + retratos circulares), el selector con avatares (búsqueda +
// clic), tablero multi-equipo, presupuesto, bloqueo, persistencia y reset, y que el Tablero meta
// sigue intacto.
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
  return RD;
}

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function typeAndClick(input, listEl, name) {
  input.value = name;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const opt = [...listEl.querySelectorAll(".wr-popt")].find(b => b.querySelector(".wr-poptn").textContent === name);
  if (!opt) throw new Error("no aparece en el selector: " + name);
  opt.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}
// Ruta tipo juego: clic en un hueco vacío (revela el picker) → buscar → clic en la fila.
function pickDef(z, name) {
  const zone = $$(".wr-zone")[z];
  const empty = zone.querySelector(".wr-slot.empty");
  if (empty) empty.click();
  typeAndClick(zone.querySelector(".wr-psearch"), zone.querySelector(".wr-plist"), name);
}
function pickLock(name) { typeAndClick($("#lock-search"), $("#lock-plist"), name); }
const filled = z => $$(".wr-zone")[z].querySelectorAll(".wr-slot.filled").length;

describe("War Room holomesa — ranuras, selector, tablero y persistencia", () => {
  it("arranca con 2 zonas y cada zona muestra `size` ranuras vacías (5v5)", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect($$(".wr-zone").length).toBe(2);
    expect($(".wr-table")).toBeTruthy();                          // marco holomesa presente
    expect($$(".wr-zone")[0].querySelectorAll(".wr-slot.empty").length).toBe(5);
    expect(filled(0)).toBe(0);
  });

  it("clic en un hueco vacío revela el picker de esa zona", async () => {
    await boot({});
    const pk = $('.wr-picker[data-z="0"]');
    expect(pk.hidden).toBe(true);
    $$(".wr-zone")[0].querySelector(".wr-slot.empty").click();
    expect(pk.hidden).toBe(false);
  });

  it("el selector filtra por texto y muestra filas con avatar", async () => {
    await boot({});
    $$(".wr-zone")[0].querySelector(".wr-slot.empty").click();
    const inp = $$(".wr-zone")[0].querySelector(".wr-psearch");
    inp.value = "bossk"; inp.dispatchEvent(new window.Event("input", { bubbles: true }));
    const opts = $$(".wr-zone")[0].querySelector(".wr-plist").querySelectorAll(".wr-popt");
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].querySelector(".savw")).toBeTruthy();
    expect([...opts].some(o => o.querySelector(".wr-poptn").textContent === "Bossk")).toBe(true);
  });

  it("añadir defensores por ranura (clic hueco → buscar → clic) y generar da counter <=5", async () => {
    await boot({});
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => pickDef(0, n));
    expect(filled(0)).toBe(3);
    $("#scout-go").click();
    const mine = $$(".wr-zone")[0].querySelector(".wr-mine");
    expect(mine.querySelectorAll(".simrow").length).toBeGreaterThan(0);
    expect(mine.querySelectorAll(".simrow").length).toBeLessThanOrEqual(5);
    expect(mine.textContent).toContain("SINERGIA");
  });

  it("3v3 muestra 3 ranuras y genera counters de exactamente 3", async () => {
    await boot({});
    $$("#scout-size button").find(b => b.dataset.n === "3").click();
    expect($$(".wr-zone")[0].querySelectorAll(".wr-slot").length).toBe(3);
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => pickDef(0, n));
    $("#scout-go").click();
    expect($$(".wr-zone")[0].querySelectorAll(".wr-mine .simrow").length).toBe(3);
  });

  it("bloqueo por clic: ranura holomesa + persiste + cuenta en 'en defensa'", async () => {
    const RD = await boot({});
    pickLock(RD.R[0].n);
    expect($("#lock-chips .wr-lockslots")).toBeTruthy();                 // se ve como mini-holomesa
    expect($("#lock-chips").querySelectorAll(".wr-slot.filled").length).toBe(1);
    expect(JSON.parse(localStorage.getItem("swgoh.gac.locked"))).toContain(RD.R[0].i);
    expect(Number($("#scout-budget").querySelector(".wr-b.lock b").textContent)).toBe(1);
  });

  it("teclado: ↑/↓ resaltan y Enter añade la fila (sin clic)", async () => {
    await boot({});
    const zone = $$(".wr-zone")[0];
    zone.querySelector(".wr-slot.empty").click();                        // revela + enfoca el picker
    const inp = zone.querySelector(".wr-psearch");
    inp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(zone.querySelector(".wr-popt.active")).toBeTruthy();          // hay fila resaltada
    inp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(filled(0)).toBe(1);                                          // añadida por teclado
  });

  it("+ Equipo añade zonas (hasta 6) y el presupuesto refleja gastados al generar", async () => {
    await boot({});
    $("#scout-addteam").click();
    expect($$(".wr-zone").length).toBe(3);
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => pickDef(0, n));
    ["Great Mothers", "Merrin", "Old Daka"].forEach(n => pickDef(1, n));
    $("#scout-go").click();
    expect(Number($("#scout-budget").querySelector(".wr-b.spent b").textContent)).toBeGreaterThan(0);
  });

  it("resetear vuelve a 2 zonas vacías pero NO borra el bloqueo", async () => {
    const RD = await boot({});
    pickLock(RD.R[0].n);
    $("#scout-addteam").click();
    pickDef(0, "Bossk");
    $("#scout-reset").click();
    expect($$(".wr-zone").length).toBe(2);
    expect(filled(0)).toBe(0);
    expect($("#lock-chips").querySelectorAll(".wr-slot.filled").length).toBe(1);
  });

  it("el tablero persiste entre 'recargas' (re-init lee localStorage)", async () => {
    await boot({});
    pickDef(0, "Jabba the Hutt");
    document.open(); document.write(TPL); document.close();
    vi.resetModules();
    const { init } = await import("../web/src/ui.js");
    const { RD } = await import("../web/src/data.js");
    init(RD, {});
    expect(filled(0)).toBe(1);
  });

  it("cambiar a Tablero meta muestra el board clásico; el resto sigue vivo", async () => {
    await boot({});
    $$("#cx-mode button").find(b => b.dataset.m === "board").click();
    expect($("#cx-board").style.display).not.toBe("none");
    expect($("#cx-scout").style.display).toBe("none");
    expect($("#counters").children.length).toBeGreaterThan(0);
    expect($("#rx-grid").children.length).toBeGreaterThan(0);
  });
});
