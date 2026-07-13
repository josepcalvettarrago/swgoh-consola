// Gate de lecturas por-jugador (Fase 5.2): canReadAlly puro + el guard del Worker antes de tocar
// Firestore (401 sin sesión, 403 si es otro ally). Los casos autorizados llegan a getDoc (red) y
// no se prueban aquí — el gate se resuelve ANTES de cualquier lectura.
import { describe, it, expect } from "vitest";
import worker from "../worker/src/index.js";
import { canReadAlly, signSession } from "../worker/src/auth.js";

const ENV = { AUTH_SECRET: "guard-secret", PAGES_ORIGIN: "*" };
const req = (path, token) => new Request(`https://api.test${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

describe("canReadAlly", () => {
  it("propio ally ✓, otro ✗, admin cualquiera ✓, sin claims ✗", () => {
    expect(canReadAlly({ sub: "222", adm: 0 }, "222")).toBe(true);
    expect(canReadAlly({ sub: "222", adm: 0 }, "333")).toBe(false);
    expect(canReadAlly({ sub: "111", adm: 1 }, "333")).toBe(true);
    expect(canReadAlly(null, "222")).toBe(false);
    expect(canReadAlly({ sub: 222, adm: 0 }, 222)).toBe(true); // number/string indistinto
  });
});

describe("guard del Worker (antes de Firestore)", () => {
  it("lectura por-jugador sin sesión => 401", async () => {
    const res = await worker.fetch(req("/api/roster/222222222"), ENV);
    expect(res.status).toBe(401);
  });
  it("lectura del roster de OTRO ally (member) => 403", async () => {
    const token = await signSession({ sub: "222222222", gid: "G1", adm: 0 }, ENV.AUTH_SECRET, { ttl: 60 });
    const res = await worker.fetch(req("/api/mods/999999999", token), ENV);
    expect(res.status).toBe(403);
  });
  it("gremio sin sesión => 401", async () => {
    const res = await worker.fetch(req("/api/guild/U6tWH0WuSDyl_g7lmgZm-w"), ENV);
    expect(res.status).toBe(401);
  });
  it("token caducado => 401 (no pasa el gate)", async () => {
    const token = await signSession({ sub: "222222222", adm: 0 }, ENV.AUTH_SECRET, { now: 1000, ttl: 60 });
    const res = await worker.fetch(req("/api/roster/222222222", token), ENV); // ya caducado (now real >> 1060)
    expect(res.status).toBe(401);
  });
  it("CORS preflight sigue abierto (OPTIONS => 204/no-body con cabeceras)", async () => {
    const res = await worker.fetch(new Request("https://api.test/api/roster/1", { method: "OPTIONS" }), ENV);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
  });
});
