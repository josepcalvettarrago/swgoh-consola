// Barril de datos: reexporta los blobs embebidos y las constantes compartidas.
// Fase 1 sustituirá roster/meta por fetch() a swgoh.gg con fallback a estos.
export { DATA } from "./data/meta.js";
export { IMGBYNAME } from "./data/images.js";
export { CHAR_META } from "./data/characters.js";
export { MODS_EMBED } from "./data/mods.js";
export { SHIP_META, SHIPS_EMBED } from "./data/ships.js";
export { RD } from "./data/roster.js";
export { ENEMIES, SIDES, ROLE_ES, KEYMECH } from "./data/enemies.js";
