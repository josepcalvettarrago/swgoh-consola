// Auth del Worker (Fase 5.1): PBKDF2, JWT HS256 y handlers con Firestore EN MEMORIA (inyectado).
// Sin red: los handlers reciben db = { getDoc, setDoc, deleteDoc } falsos, igual que index.js
// les inyecta los reales.
import { describe, it, expect } from "vitest";
import {
  hashSecret, verifySecret, signSession, verifySession, bearerToken,
  handleRegister, handleLogin, handleGetConfig, handlePutConfig, handleRotateInvite, handleDeleteUser, handleAdminOverview,
} from "../worker/src/auth.js";

const ENV = { ADMIN_ALLY: "111111111", AUTH_SECRET: "secret-de-tests" };
const GUILD = "G-test_1";

function memDb(seed = {}) {
  const docs = { ...seed };
  return {
    docs,
    getDoc: async (_env, path) => (path in docs ? docs[path] : null),
    setDoc: async (_env, path, data) => { docs[path] = data; },
    deleteDoc: async (_env, path) => { delete docs[path]; },
  };
}
function guildDoc(members) {
  return { data: JSON.stringify({ guildId: GUILD, members }) };
}
const MEMBERS = [
  { ally: 111111111, name: "Yusepi" },
  { ally: 222222222, name: "Wampa" },
];
const noDelay = { delayMs: 0 };

describe("PBKDF2 — hashSecret / verifySecret", () => {
  it("mismo secreto + mismo salt => mismo hash (determinista)", async () => {
    const a = await hashSecret("hunter2!", null, 1000);
    const b = await hashSecret("hunter2!", a.salt, 1000);
    expect(b.hash).toBe(a.hash);
    expect(a.salt.length).toBeGreaterThan(10);
  });
  it("verifySecret acepta el secreto correcto y rechaza el incorrecto", async () => {
    const rec = await hashSecret("mi-invitacion", null, 1000);
    expect(await verifySecret("mi-invitacion", { hash: rec.hash, salt: rec.salt, iters: rec.iters })).toBe(true);
    expect(await verifySecret("otra-cosa", { hash: rec.hash, salt: rec.salt, iters: rec.iters })).toBe(false);
    expect(await verifySecret("mi-invitacion", null)).toBe(false);
  });
});

describe("sesión JWT HS256", () => {
  it("sign/verify roundtrip conserva las claims", async () => {
    const t = await signSession({ sub: "222222222", gid: GUILD, adm: 0 }, "s3cr3t", { now: 1000, ttl: 60 });
    const c = await verifySession(t, "s3cr3t", { now: 1010 });
    expect(c.sub).toBe("222222222");
    expect(c.gid).toBe(GUILD);
    expect(c.exp).toBe(1060);
  });
  it("caducada => null; firma manipulada => null; otro secret => null", async () => {
    const t = await signSession({ sub: "1" }, "s3cr3t", { now: 1000, ttl: 60 });
    expect(await verifySession(t, "s3cr3t", { now: 2000 })).toBeNull();
    expect(await verifySession(t + "x", "s3cr3t", { now: 1010 })).toBeNull();
    expect(await verifySession(t, "OTRO", { now: 1010 })).toBeNull();
    expect(await verifySession("no.es.jwt", "s3cr3t")).toBeNull();
    expect(await verifySession(null, "s3cr3t")).toBeNull();
  });
  it("bearerToken extrae el token del header Authorization", () => {
    const req = { headers: new Map([["authorization", "Bearer abc.def.ghi"]]) };
    req.headers.get = k => (k === "authorization" ? "Bearer abc.def.ghi" : null);
    expect(bearerToken(req)).toBe("abc.def.ghi");
    expect(bearerToken({ headers: { get: () => null } })).toBeNull();
  });
});

describe("registro — invitación + gremio + ally + contraseña", () => {
  it("bootstrap: sin invitación activa solo puede registrarse el ADMIN_ALLY", async () => {
    const db = memDb({ [`guild/${GUILD}`]: guildDoc(MEMBERS) });
    const ko = await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "222222222", password: "12345678" }, db);
    expect(ko.status).toBe(403);
    const ok = await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "111111111", password: "12345678" }, db);
    expect(ok.status).toBe(201);
    expect(ok.data.role).toBe("admin");
    const claims = await verifySession(ok.data.token, ENV.AUTH_SECRET);
    expect(claims.adm).toBe(1);
    expect(db.docs["users/111111111"].passHash).toBeTruthy();
    expect(db.docs["users/111111111"].passHash).not.toBe("12345678"); // nunca en claro
  });
  it("con invitación activa: correcta entra (member), incorrecta 403", async () => {
    const inv = await hashSecret("CATALONIA24");
    const db = memDb({
      [`guild/${GUILD}`]: guildDoc(MEMBERS),
      [`auth/${GUILD}`]: { inviteHash: inv.hash, inviteSalt: inv.salt, inviteIters: inv.iters },
    });
    const ko = await handleRegister(ENV, { invite: "MAL", guildId: GUILD, ally: "222222222", password: "12345678" }, db);
    expect(ko.status).toBe(403);
    const ok = await handleRegister(ENV, { invite: "CATALONIA24", guildId: GUILD, ally: "222222222", password: "12345678" }, db);
    expect(ok.status).toBe(201);
    expect(ok.data.role).toBe("member");
    expect(ok.data.name).toBe("Wampa"); // nombre real sacado del doc del gremio
  });
  it("valida gremio inexistente (404), ally fuera del gremio (403), pass corta (400) y duplicado (409)", async () => {
    const db = memDb({ [`guild/${GUILD}`]: guildDoc(MEMBERS) });
    expect((await handleRegister(ENV, { invite: "", guildId: "NOEXISTE", ally: "111111111", password: "12345678" }, db)).status).toBe(404);
    expect((await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "999999999", password: "12345678" }, db)).status).toBe(403);
    expect((await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "111111111", password: "corta" }, db)).status).toBe(400);
    await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "111111111", password: "12345678" }, db);
    expect((await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "111111111", password: "12345678" }, db)).status).toBe(409);
  });
});

describe("login — 401 genérico", () => {
  async function withUser() {
    const db = memDb({ [`guild/${GUILD}`]: guildDoc(MEMBERS) });
    await handleRegister(ENV, { invite: "", guildId: GUILD, ally: "111111111", password: "12345678" }, db);
    return db;
  }
  it("credenciales correctas => token verificable", async () => {
    const db = await withUser();
    const r = await handleLogin(ENV, { ally: "111111111", password: "12345678" }, db, noDelay);
    expect(r.status).toBe(200);
    expect((await verifySession(r.data.token, ENV.AUTH_SECRET)).sub).toBe("111111111");
  });
  it("contraseña mal y ally inexistente devuelven EL MISMO 401 (no filtra existencia)", async () => {
    const db = await withUser();
    const a = await handleLogin(ENV, { ally: "111111111", password: "MALA-PASS" }, db, noDelay);
    const b = await handleLogin(ENV, { ally: "888888888", password: "12345678" }, db, noDelay);
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.data.error).toBe(b.data.error);
  });
});

describe("config por usuario", () => {
  const claims = { sub: "222222222", gid: GUILD, adm: 0 };
  it("GET sin doc => config null; PUT + GET roundtrip filtrando claves desconocidas", async () => {
    const db = memDb();
    expect((await handleGetConfig(ENV, claims, db)).data.config).toBeNull();
    const put = await handlePutConfig(ENV, claims, { config: { energy: 600, prios: ["journey"], HACK: "fuera" }, updatedAt: 1234 }, db);
    expect(put.status).toBe(200);
    const got = await handleGetConfig(ENV, claims, db);
    expect(got.data.config.energy).toBe(600);
    expect(got.data.config.HACK).toBeUndefined();
    expect(got.data.updatedAt).toBe(1234);
  });
  it("rechaza config no-objeto (400) y demasiado grande (413)", async () => {
    const db = memDb();
    expect((await handlePutConfig(ENV, claims, { config: "texto" }, db)).status).toBe(400);
    expect((await handlePutConfig(ENV, claims, { config: { plan: { X: "x".repeat(40000) } } }, db)).status).toBe(413);
  });
});

describe("admin — rotar invitación y reset de cuentas", () => {
  it("rotar invitación invalida la vieja y activa la nueva", async () => {
    const db = memDb({ [`guild/${GUILD}`]: guildDoc(MEMBERS) });
    const adm = { sub: "111111111", gid: GUILD, adm: 1 };
    expect((await handleRotateInvite(ENV, adm, { invite: "corta" }, db)).status).toBe(400);
    await handleRotateInvite(ENV, adm, { invite: "INVITE-A" }, db);
    expect((await handleRegister(ENV, { invite: "INVITE-A", guildId: GUILD, ally: "222222222", password: "12345678" }, db)).status).toBe(201);
    await db.deleteDoc(ENV, "users/222222222");
    await handleRotateInvite(ENV, adm, { invite: "INVITE-B" }, db);
    expect((await handleRegister(ENV, { invite: "INVITE-A", guildId: GUILD, ally: "222222222", password: "12345678" }, db)).status).toBe(403);
    expect((await handleRegister(ENV, { invite: "INVITE-B", guildId: GUILD, ally: "222222222", password: "12345678" }, db)).status).toBe(201);
  });
  it("reset: borrar la cuenta permite re-registrarse con contraseña nueva", async () => {
    const inv = await hashSecret("INV");
    const db = memDb({ [`guild/${GUILD}`]: guildDoc(MEMBERS), [`auth/${GUILD}`]: { inviteHash: inv.hash, inviteSalt: inv.salt, inviteIters: inv.iters } });
    await handleRegister(ENV, { invite: "INV", guildId: GUILD, ally: "222222222", password: "olvidada1" }, db);
    const del = await handleDeleteUser(ENV, { sub: "111111111", adm: 1 }, "222222222", db);
    expect(del.status).toBe(200);
    expect((await handleLogin(ENV, { ally: "222222222", password: "olvidada1" }, db, noDelay)).status).toBe(401);
    expect((await handleRegister(ENV, { invite: "INV", guildId: GUILD, ally: "222222222", password: "nueva-pass1" }, db)).status).toBe(201);
    expect((await handleLogin(ENV, { ally: "222222222", password: "nueva-pass1" }, db, noDelay)).status).toBe(200);
  });
});

describe("admin overview (Fase 5.3) — cruce gremio × registrados × ingestados", () => {
  // db en memoria con soporte de listDocs (una colección = prefijo del path).
  function memDbList(seed = {}) {
    const docs = { ...seed };
    return {
      docs,
      getDoc: async (_e, p) => (p in docs ? docs[p] : null),
      setDoc: async (_e, p, d) => { docs[p] = d; },
      deleteDoc: async (_e, p) => { delete docs[p]; },
      listDocs: async (_e, col) => Object.entries(docs)
        .filter(([p]) => p.startsWith(col + "/") && p.split("/").length === 2)
        .map(([p, d]) => ({ _id: p.split("/")[1], ...d })),
    };
  }
  const claims = { sub: "111111111", gid: GUILD, adm: 1 };
  function seeded() {
    return memDbList({
      [`guild/${GUILD}`]: guildDoc(MEMBERS), // 111 (GP alto), 222
      "users/111111111": { ally: "111111111", guildId: GUILD, role: "admin", createdAt: "2026-07-10", passHash: "SECRETO", salt: "S", iters: 1 },
      "users/222222222": { ally: "222222222", guildId: GUILD, role: "member", createdAt: "2026-07-11", passHash: "SECRETO2", salt: "S2", iters: 1 },
      "users/999999999": { ally: "999999999", guildId: "OTRO-GREMIO", role: "member", passHash: "X", salt: "Y", iters: 1 }, // otro gremio → fuera
      "players/111111111": { rd: "{}", meta: "{}", updatedAt: "2026-07-12T08:00:00Z" }, // ingestado
      // 222 registrado pero SIN roster ingestado
    });
  }
  it("cruza estado, ordena por GP y NUNCA filtra passHash/salt", async () => {
    const r = await handleAdminOverview(ENV, claims, seeded());
    expect(r.status).toBe(200);
    expect(r.data.stats).toEqual({ total: 2, registrados: 2, ingestados: 1 });
    // Orden por GP desc: MEMBERS[0]=111 (mayor GP en guildDoc), luego 222.
    expect(r.data.rows.map(x => x.ally)).toEqual(["111111111", "222222222"]);
    const admin = r.data.rows.find(x => x.ally === "111111111");
    expect(admin).toMatchObject({ registered: true, role: "admin", ingested: true });
    expect(admin.updatedAt).toMatch(/2026-07-12/);
    const member = r.data.rows.find(x => x.ally === "222222222");
    expect(member).toMatchObject({ registered: true, role: "member", ingested: false });
    // Ningún campo sensible se filtra al cliente.
    const blob = JSON.stringify(r.data);
    expect(blob).not.toMatch(/passHash|SECRETO|salt/i);
  });
  it("un miembro no registrado aparece como pendiente", async () => {
    const db = seeded();
    delete db.docs["users/222222222"];
    const r = await handleAdminOverview(ENV, claims, db);
    expect(r.data.stats.registrados).toBe(1);
    expect(r.data.rows.find(x => x.ally === "222222222")).toMatchObject({ registered: false, ingested: false });
  });
  it("los usuarios de OTRO gremio no cuentan como registrados", async () => {
    // 999 pertenece a OTRO-GREMIO y ni siquiera está en members → no aparece.
    const r = await handleAdminOverview(ENV, claims, seeded());
    expect(r.data.rows.find(x => x.ally === "999999999")).toBeUndefined();
  });
  it("sin datos de gremio => 404", async () => {
    const r = await handleAdminOverview(ENV, claims, memDb());
    expect(r.status).toBe(404);
  });
});
