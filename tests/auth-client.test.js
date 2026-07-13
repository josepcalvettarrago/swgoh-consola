// Cliente de auth (Fase 5.1): parseToken + llamadas al Worker con fetch INYECTADO. Nada de red;
// ninguna función lanza (devuelven { ok:false, error } ante cualquier fallo).
import { describe, it, expect } from "vitest";
import { parseToken, loginUser, registerUser, fetchMe, pullConfig, pushConfig } from "../web/src/auth.js";

// Fabrica un JWT sin firma válida (el cliente NO verifica firma, solo claims/exp).
function fakeToken(claims) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.firma-falsa`;
}
function mockFetch(status, body, calls = []) {
  return async (url, opts) => {
    calls.push({ url, opts });
    return { ok: status < 400, status, json: async () => body };
  };
}

describe("parseToken", () => {
  it("decodifica claims vigentes y rechaza caducado / malformado", () => {
    const t = fakeToken({ sub: "355463284", gid: "G1", adm: 1, exp: 2000 });
    expect(parseToken(t, 1000).sub).toBe("355463284");
    expect(parseToken(t, 3000)).toBeNull();      // caducado
    expect(parseToken("garbage", 0)).toBeNull(); // malformado
    expect(parseToken(null, 0)).toBeNull();
  });
});

describe("llamadas al Worker (fetch inyectado)", () => {
  it("loginUser ok devuelve token y datos", async () => {
    const calls = [];
    const r = await loginUser({ apiBase: "https://api", ally: "1", password: "x", fetchImpl: mockFetch(200, { token: "t", ally: "1", name: "Yusepi", role: "admin" }, calls) });
    expect(r.ok).toBe(true);
    expect(r.token).toBe("t");
    expect(calls[0].url).toBe("https://api/api/auth/login");
    expect(JSON.parse(calls[0].opts.body).ally).toBe("1");
  });
  it("loginUser 401 devuelve el error del servidor sin lanzar", async () => {
    const r = await loginUser({ apiBase: "https://api", ally: "1", password: "x", fetchImpl: mockFetch(401, { error: "aliado o contraseña incorrectos" }) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/incorrectos/);
  });
  it("registerUser manda invitación + gremio + ally + contraseña", async () => {
    const calls = [];
    await registerUser({ apiBase: "https://api", invite: "INV", guildId: "G1", ally: "2", password: "12345678", fetchImpl: mockFetch(201, { token: "t" }, calls) });
    const body = JSON.parse(calls[0].opts.body);
    expect(body).toEqual({ invite: "INV", guildId: "G1", ally: "2", password: "12345678" });
  });
  it("fetchMe / pullConfig / pushConfig van con Bearer y método correcto", async () => {
    const calls = [];
    const f = mockFetch(200, { ok: true, config: { energy: 500 }, updatedAt: 7 }, calls);
    await fetchMe({ apiBase: "https://api", token: "T", fetchImpl: f });
    await pullConfig({ apiBase: "https://api", token: "T", fetchImpl: f });
    await pushConfig({ apiBase: "https://api", token: "T", config: { energy: 500 }, updatedAt: 7, fetchImpl: f });
    expect(calls[0].opts.headers.authorization).toBe("Bearer T");
    expect(calls[0].opts.method).toBe("GET");
    expect(calls[1].url).toBe("https://api/api/config");
    expect(calls[2].opts.method).toBe("PUT");
    expect(JSON.parse(calls[2].opts.body).updatedAt).toBe(7);
  });
  it("red caída o sin backend => { ok:false } sin lanzar", async () => {
    const boom = async () => { throw new Error("net down"); };
    expect((await loginUser({ apiBase: "https://api", ally: "1", password: "x", fetchImpl: boom })).ok).toBe(false);
    expect((await pullConfig({ apiBase: "", token: "T" })).ok).toBe(false);
  });
});
