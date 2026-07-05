// Normalizador: une el roster del jugador (swgoh.gg /api/player) con la metadata de
// personajes (/api/characters) y produce el esquema RD {i,n,s,r,c,a,t,g,rl,p,gl,ld,im}
// idéntico al embebido, más V (facetas) reconstruido. Puro y testeable (sin red).
//
// Mapeo (verificado contra la API real):
//   i  = characters.base_id                    n  = characters.name
//   s  = characters.alignment -> L/D/N         r  = characters.role
//   c  = characters.categories                 a  = characters.ability_classes
//   t  = player.rarity                         g  = player.gear_level
//   rl = max(0, player.relic_tier - 2)         p  = player.power
//   gl = player.is_galactic_legend -> 1/0      ld = categories.includes("Leader") ? 1:0
//   im = slug de characters.image (entre tex.charui_ y .png)
// Solo personajes: combat_type === 1 (se descartan naves).

const ALIGN = { "Light Side": "L", "Dark Side": "D", "Neutral": "N" };
const ROLES = ["Attacker", "Tank", "Support", "Healer"];

export function slugFromImage(url) {
  if (!url) return null;
  const m = String(url).match(/tex\.charui_(.+?)\.png/);
  return m ? m[1] : null;
}
export function relicLevel(relicTier) {
  return Math.max(0, (Number(relicTier) || 0) - 2);
}

// Array de characters -> mapa base_id -> metadata (solo combat_type===1).
export function buildCharMap(characters) {
  const arr = Array.isArray(characters) ? characters : (characters && characters.data) || [];
  const map = {};
  for (const c of arr) {
    if (c.combat_type !== 1) continue; // fuera naves
    const cats = c.categories || [];
    map[c.base_id] = { n: c.name, s: ALIGN[c.alignment] || "N", r: c.role, c: cats, a: c.ability_classes || [], im: slugFromImage(c.image), ld: cats.includes("Leader") ? 1 : 0 };
  }
  return map;
}

// player JSON + charMap -> { R, V }.
export function normalizeRoster(playerJson, charMap) {
  const units = (playerJson && playerJson.units) || [];
  const R = [];
  for (const wrap of units) {
    const d = wrap.data || wrap;
    if (d.combat_type !== 1) continue;       // solo personajes
    const meta = charMap[d.base_id];
    if (!meta) continue;                     // sin metadata -> ignorar
    R.push({
      i: d.base_id, n: meta.n, s: meta.s, r: meta.r, c: meta.c, a: meta.a,
      t: d.rarity, g: d.gear_level, rl: relicLevel(d.relic_tier), p: d.power,
      gl: d.is_galactic_legend ? 1 : 0, ld: meta.ld, im: meta.im,
    });
  }
  return { R, V: buildFacets(R) };
}

// Reconstruye RD.V desde R: factions (recuento desc), roles (fijos), abilities (frecuencia top 35).
export function buildFacets(R) {
  const facCount = {}, abCount = {};
  for (const u of R) {
    for (const c of u.c) { if (c !== "Leader") facCount[c] = (facCount[c] || 0) + 1; }
    for (const a of u.a) { abCount[a] = (abCount[a] || 0) + 1; }
  }
  const sortEnt = o => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { factions: sortEnt(facCount), roles: [...ROLES], abilities: sortEnt(abCount).slice(0, 35) };
}

// Normalizador de GREMIO (Fase 2). Entrada: JSON de swgoh.gg /api/guild-profile/{id}/
// (forma { data: { name, galactic_power, member_count, members:[…] } }). Produce un RESUMEN
// compacto por miembro para la comparativa, ordenado por GP descendente.
//
// ⚠️ Honestidad: el guild-profile NO trae arena_rank ni recuento de GL por miembro — así que
// NO se inventan. El ranking honesto es por GP (y season score / squad power, que sí vienen).
// glCount/arenaRank por miembro requerirían tirar del roster completo de cada uno (best-effort
// opcional, fuera del mínimo de la fase).
export function normalizeGuild(guildJson) {
  const G = (guildJson && guildJson.data) || guildJson || {};
  const members = (G.members || [])
    .map(m => ({
      ally: m.ally_code,
      name: m.player_name,
      gp: m.galactic_power || 0,
      squad: m.squad_power || 0,
      league: m.league_name || null,
      season: m.lifetime_season_score || 0,
      level: m.player_level || 0,
    }))
    .sort((a, b) => b.gp - a.gp);
  return {
    guildId: G.guild_id || null,
    name: G.name || null,
    gp: G.galactic_power || 0,
    avgGp: G.avg_galactic_power || 0,
    memberCount: G.member_count || members.length,
    members,
  };
}

// Meta del jugador para players/{ally} (y cabecera en fases futuras).
export function playerMeta(playerJson) {
  const d = (playerJson && playerJson.data) || {};
  return {
    name: d.name, gp: d.galactic_power, arena: d.arena_rank, skill: d.skill_rating,
    guildId: d.guild_id, guild: d.guild_name, updated: (d.last_updated || "").slice(0, 10),
  };
}
