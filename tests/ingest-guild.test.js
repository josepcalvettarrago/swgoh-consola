// Núcleo de la ingesta de gremio (Fase 5.2): ingestGuild con TODO inyectado (sin red ni Firestore).
// Verifica que itera los miembros, salta al admin, escribe players/{ally} con el rd normalizado,
// respeta --limit/--dry/--only y que un fetch que falla se salta sin abortar el run.
import { describe, it, expect } from "vitest";
import { ingestGuild } from "../scripts/ingest-guild.mjs";

const CHAR_MAP = {
  VADER: { n: "Darth Vader", s: "D", r: "Attacker", c: ["Empire", "Sith"], a: ["AoE"], ld: 0, im: "vader" },
  R2: { n: "R2-D2", s: "L", r: "Support", c: ["Droid"], a: ["Dispel"], ld: 0, im: "r2" },
};
// Player mínimo que normalizeRoster/playerMeta aceptan.
const playerJson = ally => ({
  data: { name: `Jugador ${ally}`, galactic_power: 5e6, arena_rank: 50, guild_id: "G1", guild_name: "Cat" },
  units: [
    { data: { base_id: "VADER", combat_type: 1, rarity: 7, gear_level: 13, relic_tier: 9, power: 40000, is_galactic_legend: 0 } },
    { data: { base_id: "R2", combat_type: 1, rarity: 7, gear_level: 12, relic_tier: 5, power: 25000, is_galactic_legend: 0 } },
  ],
});

function makeDeps({ members, failOn = [] } = {}) {
  const writes = [];
  const docs = {
    "meta/characters": { map: JSON.stringify(CHAR_MAP) },
    "players/111": { meta: JSON.stringify({ guildId: "G1" }) },
    "guild/G1": { data: JSON.stringify({ members }) },
  };
  return {
    writes,
    deps: {
      ggJSON: async path => { const ally = path.match(/player\/(\d+)/)[1]; if (failOn.includes(ally)) throw new Error("404 privado"); return playerJson(ally); },
      getDoc: async (_e, p) => docs[p] || null,
      setDoc: async (_e, p, d) => { writes.push({ path: p, data: d }); },
      sleep: async () => {}, // instantáneo en tests
      log: () => {},
    },
  };
}
const MEMBERS = [
  { ally: "111", name: "Admin" }, // = allyCode → se salta
  { ally: "222", name: "Wampa" },
  { ally: "333", name: "Tusken" },
];

describe("ingestGuild", () => {
  it("ingesta a todos menos el admin; escribe players/{ally} con rd normalizado", async () => {
    const { deps, writes } = makeDeps({ members: MEMBERS });
    const res = await ingestGuild({}, deps, { allyCode: "111" });
    expect(res).toMatchObject({ ok: 2, fallidos: 0 });
    expect(res.saltados).toBe(1); // el admin
    expect(writes.map(w => w.path)).toEqual(["players/222", "players/333"]);
    const rd = JSON.parse(writes[0].data.rd);
    expect(Array.isArray(rd.R)).toBe(true);
    expect(rd.R.find(u => u.n === "Darth Vader")).toBeTruthy();
    expect(writes[0].data.meta).toMatch(/Jugador 222/);
  });
  it("--dry no escribe nada pero cuenta ok", async () => {
    const { deps, writes } = makeDeps({ members: MEMBERS });
    const res = await ingestGuild({}, deps, { allyCode: "111", dry: true });
    expect(res.ok).toBe(2);
    expect(writes.length).toBe(0);
  });
  it("--limit recorta la lista de miembros", async () => {
    const { deps, writes } = makeDeps({ members: MEMBERS });
    const res = await ingestGuild({}, deps, { allyCode: "111", limit: 1 });
    expect(res.ok).toBe(1);
    expect(writes.map(w => w.path)).toEqual(["players/222"]);
  });
  it("--only ingesta un solo ally", async () => {
    const { deps, writes } = makeDeps({ members: MEMBERS });
    await ingestGuild({}, deps, { allyCode: "111", only: "333" });
    expect(writes.map(w => w.path)).toEqual(["players/333"]);
  });
  it("un miembro con fetch que falla se salta y NO aborta el run", async () => {
    const { deps, writes } = makeDeps({ members: MEMBERS, failOn: ["222"] });
    const res = await ingestGuild({}, deps, { allyCode: "111" });
    expect(res.ok).toBe(1);
    expect(res.fallidos).toBe(1);
    expect(res.errores[0].ally).toBe("222");
    expect(writes.map(w => w.path)).toEqual(["players/333"]); // el que sí funcionó
  });
  it("sin meta/characters lanza (hay que ingestar Yusepi antes)", async () => {
    const { deps } = makeDeps({ members: MEMBERS });
    deps.getDoc = async () => null;
    await expect(ingestGuild({}, deps, { allyCode: "111" })).rejects.toThrow(/meta\/characters/);
  });
});
