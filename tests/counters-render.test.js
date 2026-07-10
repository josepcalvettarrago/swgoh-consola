// @vitest-environment jsdom
// Render REAL del War Room (Fase 3.1/3.2) sobre el DOM del template. Cubre el selector con avatares
// (búsqueda + lista clicable, ruta SOLO ratón), el tablero multi-equipo, presupuesto, bloqueo,
// persistencia y reset, y que el Tablero meta sigue intacto.
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
// Ruta SOLO RATÓN: escribe en el buscador y hace clic (mousedown) en la fila que coincide.
function typeAndClick(input, listEl, name) {
  input.value = name;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const opt = [...listEl.querySelectorAll(".wr-popt")].find(b => b.querySelector(".wr-poptn").textContent === name);
  if (!opt) throw new Error("no aparece en el selector: " + name);
  opt.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}
function pickDef(z, name) {
  const inp = $$("#scout-board .wr-psearch")[z];
  typeAndClick(inp, inp.parentElement.querySelector(".wr-plist"), name);
}
function pickLock(name) { typeAndClick($("#lock-search"), $("#lock-plist"), name); }

describe("War Room — selector con avatares, tablero, presupuesto y persistencia", () => {
  it("arranca con 2 zonas y cada zona tiene su selector (sin datalist)", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect($$(".wr-zone").length).toBe(2);
    expect($$("#scout-board .wr-psearch").length).toBe(2);
    expect($("#scout-dl")).toBe(null); // ya no hay datalist
  });

  it("el selector filtra por texto y muestra filas con avatar", async () => {
    await boot({});
    const inp = $$("#scout-board .wr-psearch")[0];
    inp.value = "bossk"; inp.dispatchEvent(new window.Event("input", { bubbles: true }));
    const list = inp.parentElement.querySelector(".wr-plist");
    expect(list.hidden).toBe(false);
    const opts = list.querySelectorAll(".wr-popt");
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].querySelector(".savw")).toBeTruthy();          // avatar presente
    expect([...opts].some(o => o.querySelector(".wr-poptn").textContent === "Bossk")).toBe(true);
  });

  it("añadir defensores SOLO con ratón (clic en la fila, sin Enter) y generar da counter <=5", async () => {
    await boot({});
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => pickDef(0, n));
    expect($$(".wr-zone")[0].querySelectorAll(".cq-chip").length).toBe(3);
    $("#scout-go").click();
    const mine = $$(".wr-zone")[0].querySelector(".wr-mine");
    expect(mine.querySelectorAll(".simrow").length).toBeGreaterThan(0);
    expect(mine.querySelectorAll(".simrow").length).toBeLessThanOrEqual(5);
    expect(mine.textContent).toContain("SINERGIA");
  });

  it("3v3 genera counters de exactamente 3", async () => {
    await boot({});
    $$("#scout-size button").find(b => b.dataset.n === "3").click();
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => pickDef(0, n));
    $("#scout-go").click();
    expect($$(".wr-zone")[0].querySelectorAll(".wr-mine .simrow").length).toBe(3);
  });

  it("bloqueo por clic en el selector de mi roster: chip + persiste + cuenta en 'en defensa'", async () => {
    const RD = await boot({});
    const name = RD.R[0].n;
    pickLock(name);
    expect($("#lock-chips").querySelectorAll(".cq-chip").length).toBe(1);
    expect(JSON.parse(localStorage.getItem("swgoh.gac.locked"))).toContain(RD.R[0].i);
    expect(Number($("#scout-budget").querySelector(".wr-b.lock b").textContent)).toBe(1);
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
    expect($$(".wr-zone")[0].querySelectorAll(".cq-chip").length).toBe(0);
    expect($("#lock-chips").querySelectorAll(".cq-chip").length).toBe(1);
  });

  it("el tablero persiste entre 'recargas' (re-init lee localStorage)", async () => {
    await boot({});
    pickDef(0, "Jabba the Hutt");
    document.open(); document.write(TPL); document.close();
    vi.resetModules();
    const { init } = await import("../web/src/ui.js");
    const { RD } = await import("../web/src/data.js");
    init(RD, {});
    expect($$(".wr-zone")[0].querySelectorAll(".cq-chip").length).toBe(1);
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
