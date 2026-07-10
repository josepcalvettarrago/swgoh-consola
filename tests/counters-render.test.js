// @vitest-environment jsdom
// Render REAL del panel Scout (Fase 3) sobre el DOM del template. Garantiza que: el datalist
// nunca queda vacío (aunque falle /api/meta/characters -> CHAR_META embebido), el Scout genera
// un counter con defensa manual sin roster del rival, y la consola no se rompe.
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
function addDefender(name) { $("#scout-in").value = name; $("#scout-add").click(); }

describe("panel Scout — render y fallbacks", () => {
  it("sin charMeta (fallo de API) -> datalist poblado desde CHAR_META embebido", async () => {
    await expect(boot({})).resolves.not.toThrow();
    expect($("#scout-dl").children.length).toBeGreaterThan(100); // 333 embebidos
    // Modo Scout activo por defecto; tablero meta oculto.
    expect($("#cx-scout").style.display).not.toBe("none");
    expect($("#cx-board").style.display).toBe("none");
  });

  it("montar defensa 3v3 y generar -> counter con equipo, sin excepción", async () => {
    await boot({});
    addDefender("Jabba the Hutt"); addDefender("Bossk"); addDefender("Boba Fett");
    expect($("#scout-chips").querySelectorAll(".cq-chip").length).toBe(3);
    $("#scout-go").click();
    expect($("#scout-out").textContent).toContain("SINERGIA");
    expect($("#scout-out").querySelectorAll(".simrow").length).toBeGreaterThan(0);
    // Reconoce el arquetipo curado de Jabba/BH.
    expect($("#scout-out").textContent).toContain("Counter curado");
  });

  it("defensor con nombre inexistente -> avisa y no lo añade", async () => {
    await boot({});
    addDefender("Personaje Que No Existe");
    expect($("#scout-chips").querySelectorAll(".cq-chip").length).toBe(0);
    expect($("#scout-warn").style.display).toBe("block");
  });

  it("generar sin defensores -> mensaje, no rompe", async () => {
    await boot({});
    $("#scout-go").click();
    expect($("#scout-out").textContent).toContain("Añade al menos un defensor");
  });

  it("cambio a Tablero meta muestra el board y oculta el Scout; el resto sigue vivo", async () => {
    await boot({});
    [...document.querySelectorAll("#cx-mode button")].find(b => b.dataset.m === "board").click();
    expect($("#cx-board").style.display).not.toBe("none");
    expect($("#cx-scout").style.display).toBe("none");
    expect($("#counters").children.length).toBeGreaterThan(0); // tablero meta intacto
    expect($("#rx-grid").children.length).toBeGreaterThan(0);   // roster explorer intacto
  });

  it("5v5 permite hasta 5 y recorta al bajar a 3v3", async () => {
    await boot({});
    [...document.querySelectorAll("#scout-size button")].find(b => b.dataset.n === "5").click();
    ["Jabba the Hutt", "Bossk", "Boba Fett", "Merrin", "Old Daka"].forEach(addDefender);
    expect($("#scout-chips").querySelectorAll(".cq-chip").length).toBe(5);
    [...document.querySelectorAll("#scout-size button")].find(b => b.dataset.n === "3").click();
    expect($("#scout-chips").querySelectorAll(".cq-chip").length).toBe(3);
  });
});
