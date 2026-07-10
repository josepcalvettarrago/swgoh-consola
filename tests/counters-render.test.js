// @vitest-environment jsdom
// Render REAL del War Room (Fase 3.1) sobre el DOM del template. Garantiza: datalist nunca vacío
// (fallback CHAR_META), tablero multi-equipo que genera counters del tamaño correcto sin roster
// del rival, presupuesto/bloqueo/persistencia y reset, y que el Tablero meta sigue intacto.
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
function zoneInput(z) { return $$(".wr-def-in")[z]; }
function addDef(z, name) {
  const inp = zoneInput(z); inp.value = name;
  inp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

describe("War Room — render, presupuesto, bloqueo y persistencia", () => {
  it("arranca con 2 zonas y datalist global poblado (fallback embebido)", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect($$(".wr-zone").length).toBe(2);
    expect($("#scout-dl").children.length).toBeGreaterThan(100);
    expect($("#cx-scout").style.display).not.toBe("none");
    expect($("#cx-board").style.display).toBe("none");
  });

  it("añadir defensores a una zona (5v5) crea chips; generar da un counter de <=5 sin excepción", async () => {
    await boot({});
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => addDef(0, n));
    expect($$(".wr-zone")[0].querySelectorAll(".cq-chip").length).toBe(3);
    $("#scout-go").click();
    const mine = $$(".wr-zone")[0].querySelector(".wr-mine");
    expect(mine).toBeTruthy();
    expect(mine.querySelectorAll(".simrow").length).toBeGreaterThan(0);
    expect(mine.querySelectorAll(".simrow").length).toBeLessThanOrEqual(5);
    expect(mine.textContent).toContain("SINERGIA");
  });

  it("3v3 genera counters de exactamente 3 (arreglo del bug)", async () => {
    await boot({});
    $$("#scout-size button").find(b => b.dataset.n === "3").click();
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => addDef(0, n));
    $("#scout-go").click();
    const rows = $$(".wr-zone")[0].querySelectorAll(".wr-mine .simrow");
    expect(rows.length).toBe(3);
  });

  it("+ Equipo añade zonas (hasta 6) y el presupuesto refleja gastados al generar", async () => {
    await boot({});
    $("#scout-addteam").click();
    expect($$(".wr-zone").length).toBe(3);
    ["Jabba the Hutt", "Bossk", "Boba Fett"].forEach(n => addDef(0, n));
    ["Great Mothers", "Merrin", "Old Daka"].forEach(n => addDef(1, n));
    $("#scout-go").click();
    const spent = $("#scout-budget").querySelector(".wr-b.spent b");
    expect(spent && Number(spent.textContent)).toBeGreaterThan(0);
  });

  it("bloquear una unidad de mi roster: chip + persiste en localStorage + cuenta en 'en defensa'", async () => {
    const RD = await boot({});
    const name = RD.R[0].n;
    $("#lock-in").value = name; $("#lock-add").click();
    expect($("#lock-chips").querySelectorAll(".cq-chip").length).toBe(1);
    expect(JSON.parse(localStorage.getItem("swgoh.gac.locked"))).toContain(RD.R[0].i);
    const lock = $("#scout-budget").querySelector(".wr-b.lock b");
    expect(Number(lock.textContent)).toBe(1);
  });

  it("resetear tablero vuelve a 2 zonas vacías pero NO borra el bloqueo", async () => {
    const RD = await boot({});
    $("#lock-in").value = RD.R[0].n; $("#lock-add").click();
    $("#scout-addteam").click();
    addDef(0, "Bossk");
    $("#scout-reset").click();
    expect($$(".wr-zone").length).toBe(2);
    expect($$(".wr-zone")[0].querySelectorAll(".cq-chip").length).toBe(0);
    expect($("#lock-chips").querySelectorAll(".cq-chip").length).toBe(1); // bloqueo intacto
  });

  it("el tablero persiste entre 'recargas' (re-init lee localStorage)", async () => {
    await boot({});
    addDef(0, "Jabba the Hutt");
    // Segundo boot: mismo localStorage, DOM reescrito.
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
