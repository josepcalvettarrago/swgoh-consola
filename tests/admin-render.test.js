// @vitest-environment jsdom
// Render del panel de gremio (Fase 5.3): la tab 12 solo existe para role=admin; el panel pinta
// stats + tabla de miembros con datos del overview (adminApi inyectada); reset y rotar cablean.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = readFileSync(resolve(__dirname, "../web/index.template.html"), "utf8");

beforeEach(() => {
  let clock = 0;
  globalThis.performance = { now: () => (clock += 600) };
  globalThis.requestAnimationFrame = cb => cb(performance.now());
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  document.open(); document.write(TPL); document.close();
  try { window.localStorage.clear(); } catch { /* jsdom sin storage */ }
  vi.resetModules();
});

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

const OVERVIEW = {
  ok: true,
  guild: { name: "Catalonian Republic", memberCount: 3 },
  stats: { total: 3, registrados: 2, ingestados: 1 },
  rows: [
    { ally: "111", name: "Yusepi", gp: 9e6, registered: true, role: "admin", ingested: true, updatedAt: "2026-07-12T08:00:00Z" },
    { ally: "222", name: "Wampa", gp: 6e6, registered: true, role: "member", ingested: false, updatedAt: null },
    { ally: "333", name: "Tusken", gp: 4e6, registered: false, role: null, ingested: false, updatedAt: null },
  ],
};

async function boot(extra) {
  const { init } = await import("../web/src/ui.js");
  const { RD } = await import("../web/src/data.js");
  init(RD, extra || {});
  await flush();
}

describe("panel admin — visible solo para admin", () => {
  it("sesión admin => la tab 12 se desoculta y el panel pinta stats + filas", async () => {
    const adminApi = { fetchOverview: async () => OVERVIEW, rotateInvite: async () => ({ ok: true }), resetUser: async () => ({ ok: true }) };
    await boot({ session: { ally: "111", name: "Yusepi", role: "admin" }, adminApi });
    const tab = $$(".tab").find(t => t.dataset.p === "admin");
    expect(tab.hidden).toBe(false);
    expect($("#adm-stats").children.length).toBe(3);
    expect($$("#adm-list .pg-grow").length).toBe(3);
    expect($("#adm-list").textContent).toMatch(/registrado/);
    expect($("#adm-list").textContent).toMatch(/pendiente/); // Tusken no registrado
    expect($$("#adm-list .adm-reset").length).toBe(2); // solo los registrados
  });
  it("sesión member => la tab 12 sigue oculta y el panel no se renderiza", async () => {
    await boot({ session: { ally: "222", name: "Wampa", role: "member" } });
    const tab = $$(".tab").find(t => t.dataset.p === "admin");
    expect(tab.hidden).toBe(true);
    expect($("#adm-list").children.length).toBe(0);
  });
  it("sin sesión (demo) => tab oculta", async () => {
    await boot({});
    expect($$(".tab").find(t => t.dataset.p === "admin").hidden).toBe(true);
  });
});

describe("panel admin — acciones", () => {
  it("'Resetear' (con confirm) llama a resetUser con el ally", async () => {
    window.confirm = () => true;
    let reset = null;
    const adminApi = { fetchOverview: async () => OVERVIEW, rotateInvite: async () => ({ ok: true }), resetUser: async a => { reset = a; return { ok: true }; } };
    await boot({ session: { ally: "111", name: "Yusepi", role: "admin" }, adminApi });
    $("#adm-list .adm-reset").click();
    await flush();
    expect(reset).toBe("111");
  });
  it("'Resetear' cancelado (confirm=false) NO llama a resetUser", async () => {
    window.confirm = () => false;
    let called = false;
    const adminApi = { fetchOverview: async () => OVERVIEW, rotateInvite: async () => ({ ok: true }), resetUser: async () => { called = true; return { ok: true }; } };
    await boot({ session: { ally: "111", name: "Yusepi", role: "admin" }, adminApi });
    $("#adm-list .adm-reset").click();
    await flush();
    expect(called).toBe(false);
  });
  it("rotar invitación con código válido llama a rotateInvite; corto => aviso, sin llamada", async () => {
    let rotated = null;
    const adminApi = { fetchOverview: async () => OVERVIEW, rotateInvite: async c => { rotated = c; return { ok: true }; }, resetUser: async () => ({ ok: true }) };
    await boot({ session: { ally: "111", name: "Yusepi", role: "admin" }, adminApi });
    // Código corto: no llama y avisa.
    $("#adm-invite").value = "abc";
    $("#adm-rotate").click(); await flush();
    expect(rotated).toBeNull();
    expect($("#adm-invite-status").textContent).toMatch(/al menos 6/);
    // Código válido: llama y limpia el input.
    $("#adm-invite").value = "CATALONIA25";
    $("#adm-rotate").click(); await flush();
    expect(rotated).toBe("CATALONIA25");
    expect($("#adm-invite-status").textContent).toMatch(/actualizada/);
    expect($("#adm-invite").value).toBe("");
  });
  it("overview que falla => estado vacío honesto, nunca en blanco", async () => {
    const adminApi = { fetchOverview: async () => ({ ok: false, error: "sin conexión" }), rotateInvite: async () => ({ ok: true }), resetUser: async () => ({ ok: true }) };
    await boot({ session: { ally: "111", name: "Yusepi", role: "admin" }, adminApi });
    expect($("#adm-list").textContent).toMatch(/No se pudo cargar/);
  });
});
