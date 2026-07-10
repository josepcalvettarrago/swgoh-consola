// Barril de datos: reexporta los blobs embebidos y las constantes compartidas.
// Fase 1 sustituirá roster/meta por fetch() a swgoh.gg con fallback a estos.
export { DATA } from "./data/meta.js";
export { IMGBYNAME } from "./data/images.js";
export { CHAR_META } from "./data/characters.js";
export { RD } from "./data/roster.js";
export { ENEMIES, SIDES, ROLE_ES, KEYMECH } from "./data/enemies.js";
