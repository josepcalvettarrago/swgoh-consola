# Changelog

Todas las fases del proyecto SWGOH Consola. Formato: fecha · fase · resumen en español.

## Fase 3.4 — Defensa fija holomesa + navegación por teclado — `v3.4-lockholo-kbd`

- **Defensa fija con aspecto GAC:** el bloqueo deja de ser una lista de chips. Sigue siendo una
  subpestaña **colapsable** (`<details>`) y, al desplegarse, se ve como una **mini-holomesa** (borde
  cian, fondo con escaneo) con las unidades bloqueadas en **ranuras circulares** (retrato con anillo
  por lado + `×` para quitar).
- **Navegación por teclado en el selector:** además del clic, **↑/↓** resaltan filas (saltando las ya
  elegidas, con auto-scroll) y **Enter** añade la resaltada. Aplica a zonas y bloqueo (mismo
  `wirePicker`). El clic sigue funcionando igual.
- **Cero cambios de motor/estado:** `genBoard`/`assemble`/`store`/persistencia intactos; solo UI.
- Tests: bloqueo con `.wr-slot.filled`, panel abierto con `.wr-lockslots`, y teclado ↑+Enter →
  **119 verdes**.
- Tag: `v3.4-lockholo-kbd`.

## Fase 3.3 — Rediseño visual "holomesa GAC" — `v3.3-holotable`

- **El War Room parece la Grand Arena del juego** (todo CSS, sin imágenes del juego — restricción
  single-file/CSP): marco de **holomesa** con barra de **nodos** luminosos, **brackets** de esquina,
  **escaneo** y un **emblema GAC** central (SVG inline). Zonas como **territorios cian biselados**.
- **Ranuras circulares tipo "Edit Defenses":** cada zona muestra `size` huecos — llenos con **retrato
  circular** (anillo por lado, ya nativo del tema: Luz=azul, Oscuro=rojo, Neutral=oro) y vacíos
  **punteados con `+`** que abren el selector de personajes. Contador `N/size` estilo pastilla.
- El bisel de cada territorio va en un **pseudo-elemento** (`::before` con `clip-path`), así que **no
  recorta** el desplegable del selector. **Cero cambios de motor/estado**: `genBoard`, persistencia,
  exclusividad, unicidad de GL y el picker (Fase 3.2) intactos; solo presentación + markup de ranuras.
- Alcance honesto: holomesa **plana** (sin 3D isométrico ni arte del juego); se parece en estilo, no
  es una réplica pixel a pixel.
- Tests: render jsdom actualizado (ranuras, clic en hueco revela el picker) → **118 verdes**.
- Tag: `v3.3-holotable`.

## Fase 3.2 — Selector de personajes con avatares — `v3.2-picker`

- **UX del War Room, operable con ratón:** las zonas enemigas y el bloqueo de defensa dejan de
  depender de teclear el nombre + Enter. Nuevo **selector clicable con avatares** (`.wr-picker`):
  buscas por texto y **haces clic** en la fila del personaje (con retrato, lado y facción) para
  añadirlo. Clic = añadir (no hace falta botón aparte ni Enter, aunque Enter sigue eligiendo el primero).
- Reutilizable en zonas (los 333 personajes) y bloqueo (solo mi roster). Índice precomputado
  (`buildPickIndex`), filtro con tope de 30 resultados y avatares vía `portrait()`. Lista **inline**
  (no se recorta con el `overflow` de la zona) y el clic gana al `blur` (`mousedown`).
- Sustituye el input + `<datalist>` anterior. Estética y motor intactos.
- **Deuda técnica registrada** en `ROADMAP.md`: el reparto óptimo global del tablero (hoy voraz) queda
  como candidato a fase futura.
- Tests: render jsdom actualizado a la ruta **solo ratón** (buscar → clic) → **117 verdes**.
- Tag: `v3.2-picker`.

## Fase 3.1 — GAC War Room (tablero multi-equipo) — `v3.1-warroom`

- **Bug 3v3 corregido:** el counter salía con 5 unidades en 3v3. `assemble()` gana un parámetro
  `size` (default 5 → comportamiento histórico intacto, garantizado por los snapshots). En 3v3
  el equipo es de 3; en 5v5, de 5.
- **War Room** (el sub-modo Scout deja de ser de un equipo): montas el **tablero de defensa**
  del rival con **2–6 equipos** (uniforme 3v3/5v5; nº de equipos configurable) y el motor
  **reparte tu roster** entre ellos. **`genBoard`** (puro, reutiliza `assemble()`):
  - **Exclusividad estricta:** cada personaje se gasta una sola vez — nunca aparece en dos counters.
  - **Reparto auto** (los más difíciles primero, por amenazas + confianza del arquetipo) o **manual**
    (orden del tablero); resultados siempre en orden de tablero.
  - **`shortfall`** cuando el presupuesto se agota (counter incompleto por unidades ya gastadas).
- **Defensa fija (bloqueo):** marcas unidades **tuyas** como siempre-en-defensa; salen del pool de
  ataque. Persistente y editable.
- **Presupuesto de roster** visible: total / en defensa / gastados / libres.
- **Persistencia** `web/src/store.js` → `localStorage` (bloqueo + tablero), con **resetear tablero**
  (no borra el bloqueo). **Cero cambios en el Worker/Firestore.**
- El **Tablero meta** `ENEMIES[]` anterior se conserva intacto como sub-modo. Estética sin cambios
  (CSS aditivo con las vars del tema).
- Tests: `board.test.js` (12) + `store.test.js` (11) + `counters-render.test.js` reescrito (8) →
  **116 verdes** (95 previos + 21). Snapshots de `assemble()` sin regresión. Build → 1 HTML (377 KB).
- Tag: `v3.1-warroom`.

## Fase 3 — Advanced Counter Generator (Scout GAC 3v3/5v5) — `v3-counters`

- **Scout de defensa** (nuevo, pestaña Counters): montas la defensa que ves en tu pantalla de
  GAC/TW (3 o 5 defensores desde un datalist **global** de los 333 personajes) y el motor lee
  las **amenazas del kit** (`ability_classes` + `categories`) y propone tu mejor counter. El
  "tablero meta" `ENEMIES[]` anterior se conserva como sub-modo secundario, intacto.
- **Desbloqueo por metadata, no por fetch al rival:** ninguna infraestructura puede traer el
  roster del rival de swgoh.gg (403 por fingerprint TLS + IP de datacenter — verificado en
  Fase 1.1/1.3). Pero el **kit es fijo por personaje**, así que las amenazas se leen sin el
  roster en vivo. Honestidad: resuelve la **elección** del counter, **no** la **inversión** real
  del rival (mods/relic/velocidad) → disclaimer visible en cada resultado.
- **Motor puro** (`web/src/counters.js`, testeable, sin DOM): `THREAT_MAP` (tabla amenaza→señal→
  anti-needs como dato), `detectThreats`, `threatsToNeeds`, `matchArchetype`, `genScout`.
  **Reutiliza `assemble()`** (inyectada para evitar el ciclo engine↔counters); mantiene la
  **unicidad de GL**. Re-exportado desde `engine.js` como diff/vader.
- **Base curada** `web/src/data/counter_db.json`: 27 arquetipos meta (match por líder+facción,
  amenazas, teams de counter y `needs` de fallback). **Curado a mano, no scrapeado** (`source`
  honesto en cada entrada; swgoh.gg no expone feed de counters y su egress está bloqueado).
- **Metadata global embebida** `web/src/data/characters.js` (`CHAR_META`, 333): sembrada del
  endpoint read-only `/api/meta/characters` (Firestore `swgohapi`), **no** de swgoh.gg. En
  runtime se refresca desde ese endpoint (`loadCharMeta`) y **cae** al embebido si falla — el
  datalist del Scout nunca queda vacío.
- **§5 (nivel real del rival) — NO implementado, por diseño.** Sonda ejecutada: swgoh.gg
  responde **403 `Cf-Mitigated: challenge`** (interstitial "Just a moment…") y **sin cabecera
  CORS**, incluso desde IP residencial. Ambas condiciones de fallo del gate → la capa se
  descarta; el Scout queda en modo manual. **Cero cambios en el Worker.**
- Tests: `counters.test.js` (17) + `counters-render.test.js` (6, jsdom) → **95 verdes**
  (72 previos + 23). Build esbuild → 1 HTML (366 KB; +176 por metadata+DB, aceptable).
- Tag: `v3-counters`.

## 2026-07-09 — Read path en producción (continuación de `v2-progreso`)

- **Read path desplegado y verificado en producción.** El Worker de lectura
  (`swgoh-consola.josep-calvet-tarrago.workers.dev`) sirve datos reales de Firestore `swgohapi`:
  `/api/roster/:ally` y `/api/progress/:ally` devuelven datos en vivo, no el `RD` embebido. La
  pestaña Progreso deja de mostrar el estado vacío pese a tener datos en Firestore.
- **Fix de índice en `listDocs` (`worker/src/firestore.js`):** se eliminó el `orderBy=__name__ desc`
  de la query (obligaba a crear un índice compuesto en Firestore, no soportado por el creador de
  índices estándar). Ahora se listan los documentos sin orden y se ordenan **en JS** por `_id`
  (timestamps ISO → orden cronológico exacto) antes del `limit`. Cero índices manuales que mantener.
- Sin tag nuevo: es continuación de la Fase 2, no una fase nueva.

## Fase 2 — Diff engine + pestaña "Progreso" (+ fix gremio)

- **Diff engine puro** (`web/src/diff.js`, re-exportado desde `engine.js`): `diffSnapshots(prev,
  curr)` devuelve deltas estructurados (relic/gear/stars/power/nuevo por unidad + GP y arena de
  cuenta). Semántica de arena correcta: un rango **menor es mejor** (228 → 221 es mejora), así
  que `arenaImproved=true` cuando el número baja. Vive en su propio módulo sin dependencias para
  que la ingesta en Node no arrastre `data.js`. `compactSnapshot` + `snapshotHash` (FNV-1a) dan
  el snapshot mínimo y el dedup. El formateo a español se hace en la UI, no en el engine.
- **Snapshots + eventos con DEDUP** (`scripts/ingest.mjs`): cada run escribe
  `snapshots/{ally}/history/{ts}` (compacto) y `snapshots/{ally}/events/{ts}` (diff ya calculado,
  para leer barato en cliente). Un doc *head* (`snapshots/{ally}`) guarda el último hash: si
  coincide, **no se escribe snapshot ni evento** (nada de spam en los runs de 8 h sin cambios).
  `players/{ally}` se sigue sobrescribiendo siempre. Retención completa por ahora (documentado
  cómo podar si crece).
- **Fix del endpoint de gremio**: descubierto con `curl` (no adivinado) que el path real es
  **`/api/guild-profile/{id}/`** (200); `/api/guild/{id}/` daba 404. `normalizeGuild` (puro)
  produce un resumen por miembro ordenado por GP. Honestidad: `arena_rank` y el recuento de GL
  por miembro **no vienen** en el guild-profile — se omiten en vez de estimarlos.
- **Worker read-only, nuevos endpoints**: `/api/progress/:ally` (últimos N eventos + meta
  reciente), `/api/snapshots/:ally` (meta compacta para gráficas). `listDocs()` en `firestore.js`
  lista subcolecciones ordenadas por nombre desc. `/api/guild/:id` acepta ids con guiones.
- **Pestaña "Progreso"** (aditiva, estética intocable): (1) línea temporal de eventos con
  titulares en español y detalle expandible; (2) roadmap de Lord Vader **auto-marcado**
  (`vaderProgress` cruza el RD en vivo con los objetivos de `DATA`: fases completada/en curso/
  pendiente + anillo de %); (3) comparativa de gremio (ranking por GP con Yusepi destacado).
  Estados de fallback imprescindibles: 0/1 snapshot → "Aún no hay histórico"; sin gremio →
  bloque oculto con aviso suave; API caída → lo último conocido o vacío, y el resto de la
  consola sigue con el RD embebido (nunca en blanco).
- Tests: diff engine, dedup, auto-marcado de Vader, normalizeGuild, capa pura de Progreso y
  **render real en jsdom** (estado vacío sin excepción) → **72 verdes** (27 previos + 45 nuevos).
  Cero secrets. Build sigue produciendo un único HTML.
- Tag: `v2-progreso`.

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

## Fase 1.1 — Ingesta movida a GitHub Actions (bloqueo de Cloudflare)

- **Problema:** el egress de un Cloudflare Worker hacia swgoh.gg (también en Cloudflare)
  recibe el *managed challenge* (`Just a moment…`). Además, Cloudflare hace **fingerprinting
  TLS (JA3/JA4)**: con cabeceras de navegador idénticas, `curl` obtiene 200 pero el `fetch`
  de Node (undici) recibe **403**.
- **Solución:** la ingesta se traslada a **GitHub Actions** (`.github/workflows/ingest.yml`,
  cron 8 h + ejecución manual). El script `scripts/ingest.mjs` **reutiliza** `normalize.js` y
  `firestore.js`, y usa **`curl`** (preinstalado en los runners; huella TLS que sí pasa) para
  swgoh.gg — Firestore sigue por `fetch` (Google no aplica ese bloqueo). Validado en dry-run:
  298 unidades normalizadas, meta de Yusepi correcta.
- **Worker read-only:** ya no hace egress a swgoh.gg; solo lee de Firestore y sirve el RD con
  CORS (`/api/roster|guild|meta`). Se elimina el cron del Worker (lo orquesta GitHub Actions).
- Pendiente: endpoint de **gremio** devuelve 404 (el path/id de swgoh.gg difiere) — best-effort,
  no bloquea; se resuelve en Fase 2. 27 tests verdes.

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
