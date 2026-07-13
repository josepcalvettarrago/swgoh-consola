// @vitest-environment jsdom
// Render REAL de la puerta de acceso (Fase 5.1): overlay sin sesión, modo demo honesto,
// sesión guardada => consola directa con chip de usuario. La consola nunca en blanco.
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
const tick = () => new Promise(r => setTimeout(r, 0));

// JWT de mentira (el cliente solo mira claims/exp, no la firma).
function fakeToken(claims) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.x`;
}

describe("puerta de acceso — sin sesión", () => {
  it("al arrancar sin sesión se muestra el overlay y la consola espera", async () => {
    await import("../web/src/main.js");
    await tick();
    expect($("#login").hidden).toBe(false);
    expect($("#login-form-in").hidden).toBe(false);
    expect($("#login-form-up").hidden).toBe(true);
    expect($("#modstats").children.length).toBe(0); // consola aún sin pintar
  });
  it("el conmutador Entrar/Registrarse cambia de formulario", async () => {
    await import("../web/src/main.js");
    await tick();
    $("#login-mode-up").click();
    expect($("#login-form-up").hidden).toBe(false);
    expect($("#login-form-in").hidden).toBe(true);
    expect($("#rg-invite")).toBeTruthy(); // invitación + gremio + ally + contraseña ×2
    expect($("#rg-guild")).toBeTruthy();
    $("#login-mode-in").click();
    expect($("#login-form-in").hidden).toBe(false);
  });
  it("contraseñas que no coinciden => error en cliente, sin llamar a la red", async () => {
    await import("../web/src/main.js");
    await tick();
    $("#login-mode-up").click();
    $("#rg-invite").value = "INV"; $("#rg-guild").value = "G1"; $("#rg-ally").value = "123456789";
    $("#rg-pass").value = "12345678"; $("#rg-pass2").value = "87654321";
    $("#login-form-up").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect($("#login-err").hidden).toBe(false);
    expect($("#login-err").textContent).toMatch(/no coinciden/);
  });
  it("'ver demo' abre la consola con banner honesto y sin chip de sesión", async () => {
    await import("../web/src/main.js");
    await tick();
    $("#login-demo").click();
    await vi.waitFor(() => expect($("#modstats").children.length).toBe(4));
    expect($("#login").hidden).toBe(true);
    expect($("#demo-banner").hidden).toBe(false);
    expect($("#demo-banner").textContent).toMatch(/demo/i);
    expect($("#session-chip").hidden).toBe(true);
    expect($$("#fleet-list .fleet-card").length).toBeGreaterThan(0); // resto de tabs vivas
  });
});

describe("puerta de acceso — con sesión guardada", () => {
  it("sesión vigente => consola directa, chip con el usuario, sin overlay ni banner", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem("swgoh.auth.session", JSON.stringify({ token: fakeToken({ sub: "355463284", exp }), ally: "355463284", name: "Yusepi", role: "admin" }));
    await import("../web/src/main.js");
    await vi.waitFor(() => expect($("#modstats").children.length).toBe(4));
    expect($("#login").hidden).toBe(true);
    expect($("#session-chip").hidden).toBe(false);
    expect($("#session-user").textContent).toBe("Yusepi");
    expect($("#demo-banner").hidden).toBe(true); // su roster (embebido) SÍ es el suyo
  });
  it("sesión de OTRO miembro sin roster ingestado => banner honesto de Fase 5.2", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem("swgoh.auth.session", JSON.stringify({ token: fakeToken({ sub: "222222222", exp }), ally: "222222222", name: "Wampa", role: "member" }));
    await import("../web/src/main.js");
    await vi.waitFor(() => expect($("#modstats").children.length).toBe(4));
    expect($("#session-chip").hidden).toBe(false);
    expect($("#demo-banner").hidden).toBe(false);
    expect($("#demo-banner").textContent).toMatch(/5\.2/);
  });
  it("sesión caducada => se limpia y vuelve el overlay", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    window.localStorage.setItem("swgoh.auth.session", JSON.stringify({ token: fakeToken({ sub: "1", exp }), ally: "1" }));
    await import("../web/src/main.js");
    await tick();
    expect($("#login").hidden).toBe(false);
    expect(window.localStorage.getItem("swgoh.auth.session")).toBeNull();
  });
});
