// @vitest-environment jsdom
// Render REAL de la pestaña Progreso sobre el DOM del template (jsdom). Garantiza el requisito
// estrella: con 0/1 snapshot y sin gremio, la consola NO se queda en blanco ni lanza excepción.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

// jsdom no trae requestAnimationFrame; ui.js lo usa en animateMeters.
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

describe("render de Progreso — estados de fallback", () => {
  it("0 snapshots / sin gremio -> estado vacío, sin excepción, resto de la consola intacto", async () => {
    await expect(boot({ progress: { events: [], snapshots: [] }, guild: null })).resolves.not.toThrow();
    expect(document.querySelector("#pg-timeline").textContent).toContain("Aún no hay histórico");
    // El bloque de gremio se oculta con aviso suave.
    expect(document.querySelector("#pg-guild-card").classList.contains("soft")).toBe(true);
    // El resto sigue vivo: el roster explorer se pobló.
    expect(document.querySelector("#rx-grid").children.length).toBeGreaterThan(0);
  });

  it("1 snapshot y aún sin eventos -> sigue en estado vacío (normal al principio)", async () => {
    await boot({ progress: { events: [], snapshots: [{ ts: "2026-07-05T00:00:00Z", meta: {} }] }, guild: null });
    expect(document.querySelector("#pg-timeline").textContent).toContain("Aún no hay histórico");
  });

  it("con un evento real -> pinta el titular y no el estado vacío", async () => {
    const ev = {
      ts: "2026-07-05T00:00:00Z", meta: { arenaRank: 221 },
      account: { gpDelta: 184000, arenaDelta: -7, arenaImproved: true },
      summary: { relicsGanados: 2, gearSubidos: 0, unidadesNuevas: 0, unidadesMejoradas: 1, gpGanado: 184000 },
      units: [{ i: "A", n: "Tusken Raider", kind: "relic", from: 5, to: 7 }],
    };
    await boot({ progress: { events: [ev], snapshots: [] }, guild: null });
    const tl = document.querySelector("#pg-timeline").textContent;
    expect(tl).not.toContain("Aún no hay histórico");
    expect(tl).toContain("Arena 228 → 221");
  });

  it("con gremio -> ranking visible y Yusepi destacado", async () => {
    const guild = { name: "Catalonian Republic", memberCount: 2, members: [{ ally: 1, name: "A", gp: 12e6 }, { ally: 355463284, name: "Yusepi", gp: 9.8e6 }] };
    await boot({ progress: { events: [], snapshots: [] }, guild });
    expect(document.querySelector("#pg-guild-card").classList.contains("soft")).toBe(false);
    expect(document.querySelector("#pg-guild .me")).toBeTruthy();
  });
});
