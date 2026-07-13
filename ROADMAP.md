# PROYECTO: SWGOH Consola Yusepi — Roadmap de industrialización

> Stack objetivo: **GitHub** (código) + **Cloudflare** (Worker + cron + Pages) + **Firebase** (Firestore + Auth).
> **Fuente de datos: swgoh.gg API** (`api.swgoh.gg`) como fuente principal. Comlink queda como fase opcional futura.

---

## CONTEXTO
Dashboard single-file HTML (~190 KB) para gestión de cuenta F2P de SWGOH.
- Jugador: **Yusepi**, ally code **355463284**, gremio **"Catalonian Republic"**.
- Objetivo del jugador: desbloquear **TODOS los Galactic Legends** (7/10; próximo: **Lord Vader**).
- Estética: consola Sith/holotable (Chakra Petch / Rajdhani / Share Tech Mono; `--ember #ff3546`, `--holo #3ad6e6`, gold; fondo *void* con scanlines). **MANTENERLA SIEMPRE.**
- Idioma de toda la UI y de la comunicación: **ESPAÑOL**.
- Estado actual: 8 tabs funcionales (Mods, Lord Vader roadmap, GLs, Counters, Roster, Conquest, Mejoras, **Progreso**). Motor de sinergias `assemble()` compartido entre Counters y Conquest. Avatares vía CDN de swgoh.gg en todas las tabs.
- Datos actuales: JSON estáticos **embebidos** en el HTML como fallback (`RD` = roster 298 chars, `DATA` = plan/mods/gremio, `IMGBYNAME` = 333 imágenes). En vivo llegan de swgoh.gg vía GitHub Actions → Firestore → Worker read-only.

---

## ESTADO ACTUAL (2026-07-11)

| Fase | Estado | Tag | Notas |
|---|---|---|---|
| **0 — Estructura** | ✅ Hecha | `v0-estructura` | Monolito troceado en módulos + build a un solo HTML. |
| **0.1 — Hotfix GL** | ✅ Hecha | `v0.1-hotfix-gl` | `assemble()` garantiza máx. 1 Leyenda Galáctica por equipo. |
| **1 — Pipeline** | ✅ Hecha | `v1-pipeline` | swgoh.gg → normalizador → Firestore + Worker + fetch con fallback. |
| **1.1 — Ingesta a Actions** | ✅ Hecha | `v1.1-ingesta-actions` | Cloudflare bloquea el egress del Worker. La ingesta se movió a **GitHub Actions** con `curl`. (Ver 1.2: Actions tampoco sirve.) |
| **1.3 — Read path (Worker) en producción** | ✅ Desplegado | — | Worker de lectura **desplegado y operativo en producción** (`swgoh-consola.josep-calvet-tarrago.workers.dev`), sirviendo datos reales de Firestore `swgohapi`. No solo "hecho en tests": verificado end-to-end. Continuación de `v2-progreso`. |
| **2 — Diff engine + Progreso** | ✅ Hecha | `v2-progreso` | Diff engine puro + dedup, pestaña Progreso, fix gremio. **72 tests verdes.** Read path ya operativo en prod (ver Fase 1.3) → la pestaña Progreso lee datos en vivo, no el `RD` embebido. |
| **1.2 — Ingesta LOCAL (write path live)** | ✅ Operativa | — | swgoh.gg también da **403 al IP de datacenter de GitHub Actions** (ni curl-impersonate lo esquiva → bloqueo por IP). La ingesta corre **en local** (`scripts/ingest-local.ps1`) al **iniciar sesión** (acceso directo en la carpeta de Inicio; cron de Actions desactivado). Escribe en **Firestore live**. |
| **3 — Counter Generator GAC (Scout)** | ✅ Hecha | `v3-counters` | Scout 3v3/5v5 dirigido por metadata (kit fijo por personaje): `detectThreats` + `counter_db` curado (27) + `assemble()`. Tablero meta previo intacto. §5 (nivel del rival) descartado: swgoh.gg da challenge+sin CORS. **95 tests verdes.** |
| **3.1 — GAC War Room** | ✅ Hecha | `v3.1-warroom` | Tablero multi-equipo (2–6) con presupuesto de roster compartido (exclusividad), fix del bug 3v3 (`assemble(size)`), bloqueo de mi defensa fija y persistencia `localStorage`. **116 tests verdes.** |
| **3.2–3.5 — War Room UX/visual** | ✅ Hecha | `v3.2-picker` … `v3.5-filtros` | Selector con avatares (3.2), reskin holomesa GAC (3.3), defensa fija holomesa + teclado (3.4), búsqueda avanzada por Lado/Rol/Facción/Mecánica (3.5). **122 tests verdes.** |
| **4.1 — Auditoría de mods + Grandivory** | ✅ Hecha | `v4.1-modaudit` | Auditoría dinámica de 1700 mods por el pipeline (ingesta compacta → `mods/{ally}` → endpoint read-only `/api/mods` → HTML con fallback). Motor puro `mods.js` (ofensores por inversión + quick-wins). Export honesto a Grandivory. **141 tests verdes.** |
| **4.2 — Planificador energía → Vader** | ✅ Hecha | `v4.2-vaderplan` | Card computada en la pestaña Vader: gap relic/gear en vivo + orden priorizado + ETA en semanas con energía diaria configurable/persistida. Motor puro `vaderplan.js`, 100% cliente. **153 tests verdes.** |
| **4.3 — Fleet Arena module** | ✅ Hecha | `v4.3-fleet` | Pestaña Flota: flotas meta montables (naves 7★) + arranque + crew (pilotos en vivo). Pipeline de naves (`compactShips` → `ships/{ally}` → `/api/fleet` read-only) + `SHIP_META` + `fleet_db` curado. Motor puro `fleet.js`. **167 tests verdes.** |
| **4.4 — Defensa de TW** | ✅ Hecha | `v4.4-twdefense` | Pestaña TW: monta tu defensa (escuadrones sin solapar desde tu roster) por zonas configurables + contexto de gremio (GP). Motor puro `twdefense.js`, 100% cliente. **183 tests verdes.** |
| **4.5 — Planificador de datacrones** | ✅ Hecha | `v4.5-datacrons` | Pestaña Datacrons: recomendador CURADO por temporada (tienes 0) cruzando `datacron_db` con el roster. Motor puro `datacrons.js`, 100% cliente. **203 tests verdes.** |
| **4.6 — Objetivo de ascensión configurable** | ✅ Hecha | `v4.6-ascension` | De-hardcodeo: tab "Vader"→"Ascensión" con selector de objetivo (`unlock_db`: 10 GLs + 3 legendaries; Vader migrado 57/17) + motor `ascension.js` + plan editable + tab GL derivada. Prerrequisito de la Fase 5. **224 tests verdes.** |
| **4.7 — Prioridades de farmeo editables** | ✅ Hecha | `v4.7-prios` | Hub de prioridades en "Mejoras": tiers reordenables + cola "próximo a farmear" (pins/override) + Top 5 derivado del estado. Catálogo ampliado (21 objetivos, 3 tiers). **237 tests verdes.** Cierra la Fase 4. |
| **5.1 — Login del gremio + config remota** | ✅ Hecha | `v5.1-auth` | Auth propio en el Worker (invitación + gremio + ally + contraseña propia; PBKDF2 + JWT). Overlay de login con modo demo honesto; config por-usuario sincronizada con Firestore (last-write-wins). **270 tests verdes.** |
| **5.2 — Rosters multi-miembro** | ✅ Hecha | `v5.2-guild-rosters` | Ingesta de gremio (`ingest-guild.mjs`: roster de cada miembro → `players/{ally}`) + cierre de las lecturas por-jugador tras sesión (solo tu ally, o admin). Cada miembro ve SU roster; demo = embebido. **286 tests verdes.** |
| 5 · 6 · 6.5 | ⬜ Pendientes | — | — |

**✅ Ingesta (write path) — OPERATIVA en local:**
- swgoh.gg → normaliza → **Firestore** (base con nombre **`swgohapi`**, `europe-west3`, proyecto `swgoh-13551`).
- Corre al iniciar sesión desde tu IP (Cloudflare bloquea tanto el Worker como el datacenter de Actions). Log en `%LOCALAPPDATA%\swgoh-consola\ingest.log`.
- Dedup por hash: los runs sin cambios no escriben snapshot ni evento (los eventos ya escritos **persisten**; la línea temporal es un registro permanente, no un "desde la última vez que miraste").
- Service account en `firebase/*adminsdk*.json` (**gitignored**, nunca subido).
- Coste **0** (Firestore plan Spark: 20k escrituras/día gratis; consumo real ~6/run).

**✅ Read path — OPERATIVO en producción.**
- Worker desplegado: `https://swgoh-consola.josep-calvet-tarrago.workers.dev`
  (`wrangler deploy`, vars `FIRESTORE_DB=swgohapi`, `ALLY_CODE`, `GUILD_ID`,
  `PAGES_ORIGIN` en `wrangler.toml`; secret `FIREBASE_SERVICE_ACCOUNT` vía
  `Get-Content ... | wrangler secret put ...` — nunca pegado a mano, rompe
  los saltos de línea del PEM).
- Fix aplicado en `worker/src/firestore.js` (`listDocs`): se eliminó el
  `orderBy=__name__ desc` (exigía crear un índice compuesto en Firestore,
  no soportado por el creador de índices estándar). Ahora se listan los
  documentos sin orden en la query y se ordenan en JS por `_id`
  (los IDs son timestamps ISO, por lo que el orden cronológico es exacto)
  antes de aplicar el `limit`. Cero índices manuales que mantener.
- `API_BASE` fijado en `web/src/main.js` apuntando al Worker de arriba.
- Verificado end-to-end: `/api/roster/:ally` y `/api/progress/:ally`
  devuelven datos reales de Firestore (`swgohapi`), no el `RD` embebido.
  `/api/progress/355463284` responde `{"events":[],"latest":{...}}`:
  meta en vivo correcta; `events` vacío es el comportamiento esperado
  con 1 solo snapshot (el dedup solo escribe evento cuando hay diff
  entre dos ingestas — se poblará en el próximo ingest con cambios).

**🔒 Seguridad:** service-account rotado y guardado en `firebase/` (gitignored). El repo GitHub
(`josepcalvettarrago/swgoh-consola`, privado) no contiene secretos.

---

## DECISIÓN DE FUENTE DE DATOS (evaluado)

**swgoh.gg API es la fuente principal. No se necesita Comlink para empezar.**

| Criterio | swgoh.gg API | Comlink |
|---|---|---|
| Infraestructura | **Cero** — HTTP directo desde el Worker | Binario persistente en Railway/Fly.io |
| Roster / guild por ally code | ✓ | ✓ |
| Datacrones + eficiencia de mods por tirada | ✓ **exclusivo** | ✗ |
| GP / stats de unidades | ✓ ya calculados | ✗ los calculas tú |
| Rate limit | ~1 req/seg (con API key `x-gg-bot-access`) | ~20 req/seg por IP |
| Frescura | puede ir desfasado horas | tiempo real |
| Esquema | idéntico al `RD` actual | requiere normalización pesada |

**Conclusión:** swgoh.gg cubre las Fases 1–4 sin montar servidor. El único punto donde Comlink gana es *frescura en tiempo real*, irrelevante para planificación semanal F2P. Comlink pasa a **Fase 6.5 opcional** (solo si se necesita tiempo real o el rate limit de 1/seg queda corto con el gremio entero de 50).

- API key de swgoh.gg → `wrangler secret` (`SWGOH_GG_API_KEY`), header `x-gg-bot-access`. **Nunca en el repo.**

---

## DECISIONES DE ARQUITECTURA (adaptadas a tu stack)

| Pieza | Dónde vive | Notas |
|---|---|---|
| Código / CI | **GitHub** | repo privado `swgoh-consola`, acciones para lint + tests + deploy |
| Frontend (HTML) | **Cloudflare Pages** | build produce un único HTML; deploy automático desde GitHub |
| Ingesta / cron | **GitHub Actions** | `scripts/ingest.mjs` baja swgoh.gg con `curl`, normaliza y escribe en Firestore; cron 8 h (Cloudflare bloquea el egress del Worker → ver Fase 1.1) |
| API de lectura | **Cloudflare Worker** | solo lee de Firestore y sirve el RD/gremio/progreso con CORS (no hace egress a swgoh.gg) |
| Persistencia | **Firebase Firestore** | snapshots por ally code; NO usamos D1 (evitamos duplicar backend) |
| Auth (Fase 5) | **Firebase Auth** | login del gremio sin construirlo a mano |
| Comlink (opcional) | Railway / Fly.io | solo si algún día se necesita tiempo real (Fase 6.5) |

**Regla de oro de secrets:** API keys y service-account JSON de Firebase van como `wrangler secret`, **nunca** en el repo.

---

## PRINCIPIOS
1. Cada fase deja el proyecto **funcional y desplegable**. Nada a medias.
2. El HTML actual es la **referencia visual y de UX**: toda migración debe ser pixel-equivalent o mejor.
3. **F2P-first**: nunca sugerir gasto. Honestidad en las limitaciones (heurístico vs dato real).
4. **Validar siempre**: `node --check` / tests verdes antes de cerrar un cambio.
5. Commits atómicos, mensajes en **español** descriptivos.

---

## FASE 0 — Repo y estructura (1 sesión) — ✅ HECHA (`v0-estructura`)
Ver `PHASE0.md` para el paso a paso detallado. Resumen:
- Repo GitHub privado `swgoh-consola`.
- Estructura: `/web` (HTML + assets), `/worker` (Cloudflare Worker, preparado para credenciales swgoh.gg y Firebase), `/firebase` (config + reglas Firestore), `/scripts` (parsers Python/Node existentes), `/tests`, `/docs`.
- Extraer el JS embebido a módulos (`data.js`, `engine.js`, `ui.js`) con build trivial (esbuild) que **siga produciendo UN SOLO HTML final**.
- Suite **vitest** para `assemble()`, `cqRun`, `genCounter` (regresión antes de tocar nada).
- **Definición de hecho:** el HTML resultante renderiza idéntico al actual; tests verdes; deploy de prueba en Cloudflare Pages.

## FASE 1 — Pipeline de datos vía swgoh.gg (1-2 sesiones) — ✅ HECHA (`v1-pipeline` + `v1.1-ingesta-actions`)
- Plan original: Cloudflare Worker con cron llamando a swgoh.gg. **Realidad (Fase 1.1):** Cloudflare
  bloquea el egress del Worker hacia swgoh.gg (managed challenge + fingerprint TLS JA3/JA4 que
  rechaza a undici/Node con 403; `curl` sí pasa). Por eso la **ingesta se movió a GitHub Actions**
  (`scripts/ingest.mjs`, `curl`, cron 8 h + manual) y el **Worker quedó solo-lectura**.
- Normalizador (`worker/src/normalize.js`, puro): player × characters por `base_id` → esquema `RD`
  `{i,n,s,r,c,a,t,g,rl,p,gl,ld,im}`. Validado: 298 = 298 unidades.
- Firestore (`worker/src/firestore.js`): REST + JWT RS256 (Web Crypto). Colecciones: `players/{ally}`,
  `snapshots/{ally}/…`, `guild/{id}`, `meta/characters`.
- Endpoints del Worker (read-only): `/api/roster/:ally`, `/api/guild/:id`, `/api/meta/characters`.
- El HTML consume el Worker con **fallback** al `RD` embebido si algo falla. Nunca en blanco.

## FASE 2 — Diff engine + pestaña "Progreso" (+ fix gremio) — ✅ HECHA (`v2-progreso`)
- **Diff engine puro** (`web/src/diff.js`, re-exportado desde `engine.js`): `diffSnapshots(prev,curr)`
  con deltas estructurados (relic/gear/stars/power/nuevo + GP y arena). Semántica de arena correcta:
  rango menor = mejora. `compactSnapshot` + `snapshotHash` (FNV-1a) para el **dedup**.
- **Ingesta con snapshots + eventos + dedup**: escribe `history/{ts}` (compacto) y `events/{ts}`
  (diff ya calculado, se lee barato). Doc *head* con el último hash: si coincide, no escribe nada
  (cero spam en runs sin cambios).
- **Fix del gremio** (descubierto con `curl`, no adivinado): el path real es
  **`/api/guild-profile/{id}/`** (200); `/api/guild/{id}/` daba 404. Resumen por miembro ordenado
  por GP. *Honestidad:* `arena_rank` y el nº de GL por miembro **no vienen** en la API → se omiten.
- **Worker read-only, nuevos endpoints**: `/api/progress/:ally`, `/api/snapshots/:ally`.
- **Pestaña "Progreso"** (aditiva, estética intocable): línea temporal de eventos en español,
  roadmap de Vader **auto-marcado** (cruce con el RD en vivo), comparativa de gremio con Yusepi
  destacado. Fallbacks: 0/1 snapshot → "Aún no hay histórico"; sin gremio → oculto; API caída →
  RD embebido.
- Tests: diff, dedup, Vader, gremio, capa pura de Progreso y **render real en jsdom** → 72 verdes.

## FASE 3 — Advanced Counter Generator GAC 3v3/5v5 (2-3 sesiones) ⭐ GAMECHANGER — ✅ HECHA (`v3-counters`)
- **Corrección de rumbo (verificada):** el plan original decía "*el Worker trae el roster del rival
  de swgoh.gg*". **Inviable** — Cloudflare bloquea ese egress (fingerprint TLS + IP de datacenter;
  ver Fase 1.1/1.3). La Fase 3 se dirige por **metadata**: el **kit es fijo por personaje**, así que
  las amenazas de cualquier defensa se leen **sin** el roster en vivo del rival. Resuelve la
  **elección** del counter (el 90% del valor), no la **inversión** real del rival.
- UI **Scout** (sub-modo aditivo en Counters; el "tablero meta" `ENEMIES[]` se conserva): selector
  **3v3/5v5**, datalist **global** (333 personajes desde `CHAR_META`), chips y ⚡ generar.
- Motor puro (`web/src/counters.js`): `detectThreats` (kit → amenazas: revive, TM-train, contraataque,
  muro, buffs, sigilo, control, DoT, aislamiento, plaga) → `matchArchetype` contra **base curada**
  `web/src/data/counter_db.json` (**27** arquetipos; **curado a mano**, no scrapeado) → `genScout`
  reutiliza `assemble()` (unicidad de GL intacta) y explica **amenaza neutralizada** por unidad.
- **Metadata** `CHAR_META` embebida (sembrada del endpoint read-only `/api/meta/characters`, no de
  swgoh.gg) + refresco en runtime con fallback → el datalist nunca queda vacío.
- **Disclaimer visible:** no modela mods/datacrons ni orden de turnos del rival (limitación de datos públicos).
- **§5 (nivel real del rival) descartado por sonda:** swgoh.gg responde 403 `Cf-Mitigated: challenge`
  y **sin CORS** incluso desde IP residencial → capa oculta, Scout en manual, **cero cambios en el Worker**.
- Tests: motor + render jsdom → **95 verdes** (72 previos + 23).

### Fase 3.1 — GAC War Room (`v3.1-warroom`)
- **Fix bug 3v3:** `assemble(pool, forced, needs, size = 5)` — parámetro con default; los snapshots
  del motor quedan idénticos. En 3v3 el counter es de 3; en 5v5, de 5.
- **`genBoard`** (puro, reutiliza `assemble()`): tablero de **2–6 equipos** enemigos con **presupuesto
  de roster compartido** → cada personaje se gasta una sola vez (**exclusividad**). Reparto **auto**
  (difíciles primero) o **manual**; `shortfall` cuando el pool se agota.
- **Bloqueo de mi defensa fija** (mis unidades fuera del pool de ataque), **presupuesto** visible
  (roster/en defensa/gastados/libres) y **persistencia** `localStorage` (`web/src/store.js`) con
  **resetear tablero**. **Cero cambios en el Worker.**
- El "Tablero meta" `ENEMIES[]` sigue intacto como sub-modo. Tests: `board`+`store`+render → **116 verdes**.

### Fase 3.2 — Selector con avatares (`v3.2-picker`)
- **Selector clicable con avatares + búsqueda** (`.wr-picker`) en las zonas enemigas y en el bloqueo:
  escribes para filtrar y **haces clic** en la fila (con retrato) para añadir — totalmente operable con
  ratón, sin depender de Enter ni de teclear el nombre exacto. Sustituye el input+`datalist` anterior.
- Índice precomputado (`buildPickIndex`) + filtro con tope de 30 y avatares vía `portrait()`. Estética
  y motor intactos. Tests render a la ruta ratón → **117 verdes**.

### Fase 3.3 — Rediseño visual "holomesa GAC" (`v3.3-holotable`)
- El War Room se re-skinea para **parecerse a la Grand Arena del juego** (todo CSS): marco de holomesa
  (nodos, brackets, escaneo, emblema GAC en SVG inline) y zonas como **territorios cian biselados**.
- **Ranuras circulares tipo "Edit Defenses"**: huecos vacíos con `+` (abren el selector) y llenos con
  retrato de anillo por lado. Bisel en `::before` (no recorta el picker). **Cero cambios de motor.**
- Holomesa **plana** (sin 3D). Tests render → **118 verdes**.

### Fase 3.4 — Defensa fija holomesa + teclado (`v3.4-lockholo-kbd`)
- **Bloqueo (defensa fija)** con aspecto de mini-holomesa al desplegar el `<details>`: unidades en
  ranuras circulares (borde cian + escaneo), en vez de chips.
- **Selector navegable con teclado**: ↑/↓ resaltan (saltando las ya elegidas, auto-scroll) y Enter
  añade; el clic sigue igual. Aplica a zonas y bloqueo. **Cero cambios de motor.** → **119 verdes**.

### Fase 3.5 — Búsqueda avanzada en el selector (`v3.5-filtros`)
- Barra de filtros tipo Conquest en el selector (zonas y bloqueo): **Lado · Rol · Facción · Mecánica**
  combinados con Y + texto. Facetas por contexto (todo el juego vs mi roster), **persisten en la sesión**
  y las comparten las zonas; botón Limpiar. Re-filtra en vivo. **Cero cambios de motor.** → **122 verdes**.

---

## DEUDA TÉCNICA / BACKLOG
- **Reparto óptimo global del War Room** (candidato a fase futura). Hoy `genBoard`
  ([web/src/counters.js](web/src/counters.js)) asigna **voraz** (orden auto: los equipos más difíciles
  primero). **No garantiza** el reparto globalmente óptimo del roster entre los 2–6 equipos: podría
  existir una combinación mejor probando permutaciones o una asignación tipo **húngara** con
  coste = sinergia por emparejamiento. Se difiere por coste/complejidad; el voraz es predecible,
  determinista y suficiente para el uso real. Origen: feedback Fase 3.1.

## FASE 4 — Módulos de valor (1 sesión c/u, orden por impacto)

### Fase 4.1 — Auditoría de mods + export a Grandivory (`v4.1-modaudit`) — ✅ HECHA
- **Pipeline (primer dato NUEVO de la cuenta de punta a punta):** `compactMods()` compacta el export
  (dropea `stat_min/max/unscaled/value` crudo, conserva `display_value`) → la ingesta local escribe
  `mods/{ally}` con dedup por hash (~396 KB, 1 doc; guarda de paginado si >900 KB). Endpoint
  **read-only** `GET /api/mods/:ally` desplegado y verificado (curl 200 + MCP).
- **Motor puro** `web/src/mods.js`: `modQuality` (estado OBJETIVO, no "fit") + `auditMods` (global +
  ofensores por inversión + quick-wins). `SET_MAP` verificado empíricamente. Determinista.
- **UI dinámica:** estado global calculado (742/17/238/649 en vivo), ofensores relic'd con mods pobres,
  quick-wins (nivel/reubicar, sin gasto), grid filtrable. `loadMods()` con fallback embebido → nunca en
  blanco. Export honesto a Grandivory (deep-link inexistente verificado → abrir + copiar ally code).
- Datacrones (0) → sin panel vacío. Worker read-only. **141 tests verdes.**
- Planificador de datacrones (curado por temporada) → **abordado en Fase 4.5** (ya no diferido).

### Fase 4.2 — Planificador de energía / ETA hacia Lord Vader (`v4.2-vaderplan`) — ✅ HECHA
- **Cliente 100%** (cero Worker/pipeline). `web/src/vaderplan.js` (puro): cruza el roster en vivo
  (relic/gear) con `DATA.lv` → gap por unidad, **orden priorizado** (barato primero) y **ETA en
  semanas** con **energía diaria configurable y persistida** (`store.js`).
- **Honesto:** gear en energía→días; relic en días/nivel curados (mats/créditos, no pura energía).
  `VADER_COSTS` transparente/editable + disclaimer. Reproduce el gap real (57 relic + 17 gear). **153 tests.**

### Fase 4.3 — Fleet Arena module (`v4.3-fleet`) — ✅ HECHA
- **Pipeline de naves** (antes se tiraban): `compactShips()` (combat_type 2) → ingesta escribe
  `ships/{ally}` (dedup) → endpoint **read-only** `/api/fleet/:ally` (desplegado + verificado) → HTML
  con fallback `SHIPS_EMBED`. `SHIP_META` (70, de `/api/ships/`) + `fleet_db.json` **curado** (10 flotas).
- **Motor puro** `web/src/fleet.js` (`planFleet`): montables (naves 7★) / casi / bloqueadas + arranque +
  **crew** (pilotos con relic desde `RD`). Pestaña **Flota (09)**. Honesto: meta curada, la fuerza real
  depende de pilotos/mods. Con el roster real: **7/10 montables**. **167 tests.**

### Fase 4.4 — Constructor de defensa de TW (`v4.4-twdefense`) — ✅ HECHA
- **100% cliente.** `web/src/twdefense.js` (`planTWDefense`): greedy no-solapante que monta
  `zonas × defensas/zona` escuadrones desde el roster (reutiliza `assemble`; GL única por escuadrón),
  repartidos por zonas; `ranOut` si el roster se agota. Formato **configurable/persistido** (`store.js`).
- **Honesto:** la API de gremio solo da GP (sin rosters) → construye TU defensa + contexto de gremio
  (rango por GP). No simula combates. Pestaña **TW (10)**. **183 tests.**

### Fase 4.5 — Planificador de datacrones (`v4.5-datacrons`) — ✅ HECHA
- **100% cliente** (guía estática + roster; cero Worker/pipeline). Recupera el planificador diferido en
  4.1: tienes **0** datacrones → **recomendador CURADO por temporada**, no auditor personal.
- `web/src/data/datacron_db.json` (14 rutas evergreen `alineación→facción→personaje`, targets/facciones
  verificados) + motor puro `web/src/datacrons.js` (`planDatacrons`): marca `usable` (poseo el L9 y su
  facción), relic/gear del target, orden determinista. Pestaña **Datacrons (11)**.
- **Honesto:** el set rota y no se puede traer en vivo → texto cualitativo, sin cifras inventadas; el
  callout "0 datacrons" se mantiene y enlaza a la pestaña. **203 tests.**

### Fase 4.6 — Objetivo de ascensión configurable (`v4.6-ascension`) — ✅ HECHA
- **De-hardcodeo (prerrequisito de la Fase 5):** la tab 2 dejó de estar clavada a Vader. `unlock_db.json`
  (catálogo curado: **10 GLs + 3 legendaries** GAS/JKR/DR; Vader **migrado y verificado** → reproduce
  57 relic + 17 gear) + motor puro `web/src/ascension.js` (`resolveTarget`/`planFor`/`priorityQueue`,
  "un GL a la vez").
- Motores `vader.js`/`vaderplan.js` **generalizados con compatibilidad hacia atrás** (target relic/gear
  por unidad; `unlockName` param). Tab **"Vader" → "Ascensión"**: selector de objetivo (avatar+búsqueda+
  tier), planificador y anillo por objetivo, **plan semanal editable** persistido por objetivo, y tab GL
  **derivada** de `unlock_db` + roster. `store.js`: `K_TARGET`/`K_PLAN`/`K_PRIOS` + **migración** de la
  clave de energía (`swgoh.vader.energy` → `swgoh.ascension.energy`).
- **Honesto:** requisitos verificados donde se pudo (fuente por entrada); lo no confirmado marcado
  "por confirmar"; el plan semanal **no se autogenera** (curado solo donde existe = Vader). **224 tests.**

### Fase 4.7 — Prioridades de farmeo editables (`v4.7-prios`) — ✅ HECHA
- **Cierra el de-hardcodeo.** La pestaña **"Mejoras"** pasa de Top 5 hardcodeado a **hub de prioridades**:
  `ascension.js` gana `priorityQueue({pins})` (override individual, "un GL a la vez" tras pins) y
  `deriveProposals(state)` (Top-N derivado de datacrones/mods/objetivo/flota/gremio). 100% cliente, puro.
- **UI:** tablero de tiers reordenable (persistido `swgoh.ascension.prios`), cola "próximo a farmear" con
  **pins** (`swgoh.ascension.pins`) y "ir al objetivo", Top 5 derivado. Catálogo ampliado a **21 objetivos**
  (los 3 tiers con contenido; journey long tail pendiente, requisitos antiguos marcados "por confirmar").
- **237 tests.** **Fase 4 completa.**

## FASE 5 — Gremio multi-usuario (sub-fases 5.1 / 5.2 / 5.3; diseño completo en PHASE5.md)

### Fase 5.1 — Login del gremio + config remota (`v5.1-auth`) — ✅ HECHA
- **Desviación consciente del plan original ("Firebase Auth"):** el flujo pedido (código de invitación +
  nº de gremio + ally code + **contraseña elegida por el miembro**, sin email) no encaja con Firebase Auth
  (exige email o hacks) y su SDK sumaría ~100 KB al HTML único. En su lugar, **auth propio en el Worker**:
  PBKDF2-SHA256 (100k iters, salt/usuario) + sesión **JWT HS256** (secret `AUTH_SECRET`, 30 días).
  Firestore sigue **deny-all**: todo pasa por el Worker.
- **Registro validado contra el gremio real:** el ally debe estar en `guild/{id}.members` (ingesta);
  invitación **única por gremio, rotable** por el admin (hasheada en `auth/{guildId}`); duplicado → 409
  ("pide reset al admin" — sin email no hay auto-reset). Bootstrap: sin invitación activa solo puede
  registrarse `ADMIN_ALLY`. Login con **401 genérico** + retardo fijo (honesto: sin KV/DO no hay
  rate-limit real por IP — mitigación futura en Fase 6).
- **Cliente:** overlay de login (estética holotable, aditivo) con Entrar/Registrarse + **"ver demo"**
  (consola nunca en blanco); chip de sesión con "salir"; **banner honesto** cuando el roster mostrado no
  es el del usuario. Config por-usuario (8 claves de `store.js`) sincronizada con
  `users/{ally}/data/config` — pull al entrar (last-write-wins por `updatedAt`), push debounced en cada
  save; localStorage queda de caché offline. **270 tests.**

### Fase 5.2 — Rosters multi-miembro (`v5.2-guild-rosters`) — ✅ HECHA
- **Ingesta de gremio** (`scripts/ingest-guild.mjs`, núcleo `ingestGuild` con deps inyectadas → testeable
  sin red): lee `guild/{id}.members[]` y baja el roster de cada miembro a `players/{ally}` (solo rd+meta;
  mods/naves/snapshots siguen siendo de Yusepi). Reutiliza `normalize.js` + el curl anti-fingerprint
  extraído a `scripts/gg-fetch.mjs` (compartido con `ingest.mjs`, comportamiento idéntico). Flags
  `--dry/--limit/--only`; salta miembros con perfil privado/404 sin abortar. Corre en local
  (`ingest-guild-local.ps1`, IP residencial).
- **Worker:** las 5 lecturas por-jugador (`roster/progress/snapshots/mods/fleet`) + `guild` exigen **Bearer**;
  helper puro `canReadAlly` (solo tu ally, o cualquiera si `adm:1`). `meta/characters` sigue público.
- **Cliente:** el miembro autenticado baja **SU** roster con el token; sin ingestar aún → embebido + banner
  honesto. Demo (sin sesión) = embebido, sin pedir datos por-jugador. **286 tests.**
- **Pendiente:** `PAGES_ORIGIN` definitivo (cuando haya dominio) y correr la ingesta real de los 50.

### Fase 5.3 — Panel admin (`v5.3-admin`) — pendiente
- Vista solo-admin: estado de los 50 (registrado sí/no, GP, último snapshot), rotar invitación,
  resetear cuentas, TW readiness, ranking.
- Hosting definitivo: **Cloudflare Pages** + dominio.

## FASE 6 — Pulido
- **PWA** (manifest + service worker) para instalar en el móvil.
- Rate-limit y caché en el Worker.
- Docs de onboarding del gremio en español.

## FASE 6.5 — Comlink (OPCIONAL, solo si se necesita)
- Desplegar `swgoh-comlink` en Railway/Fly.io **únicamente si**: (a) se requiere frescura en tiempo real para scouting de GAC, o (b) el rate limit de 1/seg de swgoh.gg queda corto sirviendo a los 50 del gremio.
- Arquitectura híbrida recomendada por el ecosistema: Comlink como fuente en vivo principal + swgoh.gg como complemento para datacrones y eficiencia de mods.

---

## MODELO Y ESFUERZO POR FASE
- **Arquitectura / diseño de datos** (arranque de F1, F3, F5): **Opus**, effort alto.
- **Implementación diaria y UI**: **Sonnet**, effort medio.
- **Refactors mecánicos y tests**: **Sonnet**, effort bajo.

## DEFINICIÓN DE HECHO (toda fase)
✓ `node --check` + tests verdes · ✓ HTML sin regresiones visuales · ✓ deploy funcional · ✓ commit + tag · ✓ nota en `/docs/CHANGELOG.md` en español.
