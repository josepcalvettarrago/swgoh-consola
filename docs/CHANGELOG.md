# Changelog

Todas las fases del proyecto SWGOH Consola. Formato: fecha · fase · resumen en español.

## Fase 1 — Pipeline de datos vía swgoh.gg

- **Fuente en vivo:** el roster deja de estar solo embebido. Un Cloudflare Worker
  (`worker/src/index.js`) llama al endpoint **público** de swgoh.gg (`/api/player`,
  `/api/characters`, `/api/guild`) — sin API key, con cabecera user-agent — encolando a
  ~1 req/seg (`queue()`), normaliza y persiste en Firestore. Comlink queda como plan B
  opcional (Fase 6.5) si el rate limit aprieta.
- **Normalizador** (`worker/src/normalize.js`, puro/testeable): une player × characters por
  `base_id` y produce el esquema RD `{i,n,s,r,c,a,t,g,rl,p,gl,ld,im}`. Reglas verificadas
  contra la API real: `s = alignment→L/D/N`, `rl = max(0, relic_tier−2)`, `im` = slug de
  `image`, `ld = categories.includes("Leader")`, filtro `combat_type===1` (fuera naves).
  Validado contra el JSON real completo: **298 = 298 unidades**, idéntico salvo `power` de
  1 unidad (deriva real del roster desde el snapshot embebido — comportamiento deseado).
- **Firestore** (`worker/src/firestore.js`): REST API con JWT RS256 firmado con Web Crypto.
  Esquema: `players/{ally}` (RD + meta), `snapshots/{ally}/history/{ts}`, `guild/{id}`,
  `meta/characters`.
- **Frontend con fallback** (`main.js` `loadRoster()` + `ui.js` `init(rd)`): intenta el roster
  en vivo desde el Worker y cae SIEMPRE al RD embebido si algo falla (red caída, backend sin
  configurar, forma inesperada). La consola nunca se queda en blanco.
- **Cron** cada 8 h (`wrangler.toml`) refresca Yusepi + gremio.
- Tests: normalizador contra fixtures reales + fallback → **27 verdes**. Cero secrets en git.
- Diferencia menor documentada: `V.abilities` = top-35 por frecuencia (el embebido tenía 34);
  solo afecta al desplegable de filtros del roster, no a la lógica.
- **Pendiente de deploy por el usuario** (necesita cuenta Cloudflare + Firebase):
  `wrangler secret put FIREBASE_SERVICE_ACCOUNT`, `wrangler deploy`, `GET /debug/refresh`
  para poblar Firestore, y fijar `API_BASE` en `main.js` a la URL del Worker.
- Tag: `v1-pipeline`.

## Fase 0.1 — Hotfix: máximo una Leyenda Galáctica por equipo

- `assemble()` (engine.js) podía proponer equipos con varias unidades `gl:1` (imposible en
  el juego: solo una GL por escuadrón). Añadida la restricción de unicidad con un helper
  `teamHasGL()` y tres guardas (bucle de forzados, relleno y suplentes). No se toca el resto
  de la heurística (KEYMECH, power, cohesión, roles).
- Nuevo test permanente de unicidad GL en `tests/engine.test.js` (varios inputs, incluido
  forzar dos GLs y líder GL). `npm test` → 12 verdes.
- Snapshots del motor regenerados: reflejan el cambio esperado (p. ej. el equipo por defecto
  pasa de SLKR+Jabba+JMLS+GLRey+GLLeia a SLKR + no-GL). Diferencia justificada por el fix.
- Tag: `v0.1-hotfix-gl`.

## Fase 0 — Troceo del monolito (estructura)

- Convertido el único `SWGOH_Consola_Yusepi.html` (~190 KB) en un repo modular:
  - `web/src/data.js` — datos embebidos (`DATA`, `IMGBYNAME`, `RD`, `ENEMIES`) + constantes.
  - `web/src/engine.js` — lógica pura: `assemble()`, `lookupByName()`, `portrait()`, `teamRow()`.
  - `web/src/ui.js` — render del DOM: pestañas, roster explorer, conquest, counters, meters.
  - `web/src/main.js` — bootstrap.
  - `web/src/styles.css` — estilos.
- Build con esbuild (`scripts/build.js`) que reinyecta CSS + JS en `index.template.html`
  y produce un único `web/dist/SWGOH_Consola_Yusepi.html`.
- Tests de regresión (vitest) que congelan la salida del motor `assemble()` antes de trocear.
- Sin cambios visuales ni de lógica. **Encoding normalizado a UTF-8** (se corrigió el mojibake
  del HTML de referencia: acentos, flechas `→`, `×`, `★`, `⚡`).
- Scaffolding preparado (sin desplegar) para Fase 1 (`worker/`) y Fase 5 (`firebase/`).
- Tag: `v0-estructura`.
