# Changelog

Todas las fases del proyecto SWGOH Consola. Formato: fecha · fase · resumen en español.

## Fase 5.3 — Panel de administración del gremio — `v5.3-admin`

- **Cierra la Fase 5.** Nueva **pestaña 12 "Gremio"**, visible **solo con sesión `role=admin`** (la tab va
  `hidden` por defecto y solo se desoculta para el admin; el Worker ya exige `adm:1` en `/api/admin/*` —
  defensa en profundidad). Yusepi ya no necesita `curl` para administrar.
- **Endpoint `GET /api/admin/overview`** (`handleAdminOverview`, puro con deps inyectadas): cruza **en el
  Worker** el resumen del gremio (`guild/{id}.members`) × cuentas registradas (`users`) × rosters
  ingestados (`players`) en **una sola llamada** (sin 50 fetches en cliente). **Seguridad:** nunca
  devuelve `passHash`/`salt`, solo `ally`/`role`/`createdAt`; filtra por `guildId` del token. `listDocs`
  se añade a la capa `db` inyectada.
- **UI:** estado de los ~50 sobre el ranking por GP (reutiliza `guildRanking` + markup `pg-grow`/`gr-*`):
  badges **registrado**/pendiente y **roster ✓ fecha**/sin roster, chip **ADMIN**, y por fila registrada un
  botón **Resetear** (con `window.confirm`). Card de **invitación**: el admin teclea el código nuevo y
  **Rotar** (reusa `handleRotateInvite`). Estado vacío honesto si el overview falla.
- **Cliente** (`web/src/auth.js`): `fetchAdminOverview` (GET+Bearer). `main.js` liga
  `adminApi = { fetchOverview, rotateInvite, resetUser }` con apiBase+token y lo pasa a `init` **solo** si
  `session.role==="admin"`.
- **Diferido a Fase 6** (anotado en `DEBTS.md`): drill-down del roster por miembro y "TW readiness" por
  jugador (mal definida y cara para 5.3).
- Verificación: **299 tests verdes** (286 + 13: cruce del overview + exclusión de `passHash` + filtro por
  gremio, gate 401/403 de la ruta admin, cliente con Bearer, render admin/member/demo + reset + rotar).
  Build → 1 HTML (534 KB). **Pendiente:** probar el ciclo admin real contra el Worker desplegado (`DEBTS.md`).
- Tag: `v5.3-admin`.

## Fase 5.2 — Rosters multi-miembro — `v5.2-guild-rosters`

- **Cada miembro ve SU propio roster.** Antes solo el de Yusepi estaba en Firestore; ahora la ingesta baja
  el roster de todos los miembros del gremio y los endpoints de lectura se cierran tras sesión.
- **Ingesta de gremio** (`scripts/ingest-guild.mjs`): lee `guild/{id}.members[]` y baja el roster de cada
  miembro a `players/{ally}` (solo `rd`+meta; mods/naves/snapshots/progreso siguen siendo de Yusepi por
  coste/tiempo). Núcleo `ingestGuild` con dependencias inyectadas (red + Firestore) → **testeable sin red**.
  Flags `--dry`/`--limit N`/`--only {ally}`. Un miembro con perfil privado/404 se **salta y se registra**,
  nunca aborta el run. Corre en local (`scripts/ingest-guild-local.ps1`, IP residencial, tarea aparte).
- **Refactor sin cambio de comportamiento:** el cliente curl anti-fingerprint (JA3) se extrae de
  `ingest.mjs` a `scripts/gg-fetch.mjs`, compartido por ambas ingestas.
- **Worker:** las 5 lecturas por-jugador (`roster/progress/snapshots/mods/fleet`) y `guild` pasan a exigir
  **Bearer**; helper puro `canReadAlly` (solo tu propio ally, o cualquiera si eres admin) → si no, **403**;
  sin sesión, **401**. `meta/characters` **sigue público** (mapa global, lo necesita el Scout en demo).
- **Cliente:** los loaders (`loadRoster/loadProgress/loadGuild/loadMods/loadFleet`) mandan
  `Authorization: Bearer` si hay sesión; el miembro autenticado baja **su** roster. Si aún no está
  ingestado (503) → embebido + **banner honesto** ("pídele al admin que corra la ingesta del gremio").
  El **modo demo** (sin sesión) ya no pide datos por-jugador en vivo: usa embebidos (no expone Firestore).
- Verificación: **286 tests verdes** (270 + 16: `canReadAlly`, guard del Worker 401/403, núcleo
  `ingestGuild` con deps inyectadas, loaders con Bearer, render de sesión/roster propio/demo). Build → 1
  HTML (527 KB). **Pendiente:** correr la ingesta real de los 50 y `PAGES_ORIGIN` definitivo (ver `DEBTS.md`).
- **Deuda anotada** (`DEBTS.md`, nuevo): probar el Worker de auth de la 5.1 desplegado (`wrangler dev` +
  `AUTH_SECRET`, registro admin, ciclo completo) y en navegador real; rate-limit por IP; repaso visual F4/F5.
- Tag: `v5.2-guild-rosters`.

## Fase 5.1 — Login del gremio + config remota — `v5.1-auth`

- **Abre la consola al gremio.** Flujo de acceso fácil: para registrarse hacen falta **código de
  invitación** + **nº de gremio** + **código de aliado**, y cada miembro **elige su propia contraseña**.
- **Auth propio en el Worker** (desviación documentada del plan "Firebase Auth": el flujo sin email no
  encaja y el SDK sumaría ~100 KB al HTML único). `worker/src/auth.js`: PBKDF2-SHA256 (100k iteraciones,
  salt por usuario, nada en claro) + sesión **JWT HS256** firmada con el secret `AUTH_SECRET` (30 días).
  Firestore sigue **deny-all**: todo pasa por el Worker.
- **Registro honesto y validado:** el ally debe estar en la **lista real de miembros** del gremio
  (`guild/{id}` de la ingesta); la invitación es **una por gremio y rotable** por el admin (hasheada en
  `auth/{guildId}`); cuenta duplicada → 409 y **reset por el admin** (sin email no hay auto-reset).
  Bootstrap sin huevo-y-gallina: sin invitación activa solo puede registrarse `ADMIN_ALLY`. Login con
  **401 genérico** (no revela si el ally existe) + retardo fijo; se documenta que **no hay rate-limit
  real por IP** (mitigación en Fase 6 con KV/Turnstile).
- **Endpoints nuevos** (index.js): `POST /api/auth/register|login`, `GET /api/me`, `GET|PUT /api/config`,
  `POST /api/admin/invite`, `DELETE /api/admin/users/:ally` (admin). CORS ampliado
  (POST/PUT/DELETE + `authorization`). `firestore.js` gana `deleteDoc`. El Worker deja de ser solo-lectura
  **únicamente** para cuentas/config de usuario — los datos de juego siguen escribiéndose solo desde la
  ingesta local.
- **Cliente:** overlay de login (estética holotable, aditivo) con Entrar/Registrarse y **"ver demo"**
  (datos embebidos de Yusepi con banner honesto — la consola nunca en blanco); chip de sesión con "salir";
  si el miembro autenticado aún no tiene roster ingestado, **banner honesto** ("llega en la Fase 5.2").
- **Config por-usuario sincronizada:** las 8 claves de `store.js` (bloqueo, tablero, energía, TW, objetivo,
  plan, prioridades, pins) viajan a `users/{ally}/data/config` — pull al entrar (**last-write-wins** por
  `updatedAt`), push **debounced** en cada save, localStorage de caché offline. `swgoh.auth.session` +
  `swgoh.config.updatedAt` nuevas en `store.js`.
- Verificación: **270 tests verdes** (237 + 33: PBKDF2/JWT, handlers con Firestore en memoria, cliente con
  fetch inyectado, sync last-write-wins, render jsdom del overlay/demo/sesión). Build → 1 HTML (527 KB).
  **Pendiente:** probar el Worker desplegado (secrets `AUTH_SECRET` + vars) y navegador real.
- Tag: `v5.1-auth`.

## Fase 4.7 — Prioridades de farmeo editables + cola "próximo a farmear" — `v4.7-prios`

- **Cierra el de-hardcodeo (prerrequisito de la Fase 5):** la pestaña **"Mejoras"** deja de ser un Top 5
  hardcodeado de Yusepi y pasa a un **hub de prioridades** genérico.
- **Motor** (`ascension.js`, puro): `priorityQueue` gana `opts.pins` (override individual: los objetivos
  **fijados** suben al frente de su tier; **"un GL a la vez"** se respeta tras los pins; sin `opts` =
  idéntico a 4.6). Nuevo `deriveProposals(state)`: Top-N **derivado del estado en vivo** (datacrones
  aprovechables, mods sin subir, gap del objetivo activo, flota montable, ranking de gremio), ordenado por
  impacto. Determinista.
- **UI (Mejoras):** **tablero de tiers reordenable** (↑/↓, persistido) · **cola "próximo a farmear"**
  derivada del roster (por tier: próximo objetivo con % de cercanía, unidades que faltan, **📌 fijar/soltar**
  y **→ ir al objetivo** que abre Ascensión) · **Top 5 derivado** (sustituye `DATA.proposals`). El bonus
  hardcodeado de Yusepi se retira.
- **Persistencia** (`store.js`): `swgoh.ascension.prios` (orden de tiers) y `swgoh.ascension.pins`
  (objetivos fijados), con "Restablecer orden".
- **Catálogo** (`unlock_db.json`): **tanda representativa** — +1 journey (JKL) y +7 legendaries clave
  (GM Yoda, Emperor Palpatine, CLS, Padmé, Wat Tambor, Grievous, Gran Inquisidor). **21 objetivos** con los
  **3 tiers con contenido**. Nombres/ids validados contra CHAR_META; requisitos aproximados marcados
  **"por confirmar"** (los eventos antiguos son gear/estrella; el long tail de journeys queda pendiente).
- Estética intocable, consola nunca en blanco. **237 tests verdes** (224 + nuevos). Build → 1 HTML (513 KB).
- Tag: `v4.7-prios`. **Fase 4 completa.**

## Fase 4.6 — Objetivo de ascensión configurable — `v4.6-ascension`

- **De-hardcodeo (prerrequisito de la Fase 5):** la pestaña 2, antes clavada a **Lord Vader**, pasa a
  **"Ascensión"** con **objetivo configurable**. Cualquier usuario elige a quién ascender y el planificador
  calcula gap/ETA/orden con **su** roster en vivo.
- **Catálogo curado** `web/src/data/unlock_db.json`: **10 Galactic Legends + 3 legendaries** (GAS, Jedi
  Knight Revan, Darth Revan). La entrada **Lord Vader está migrada y verificada** (reproduce el gap real
  **57 relic + 17 gear**). Requisitos verificados donde se pudo (fuente por entrada); lo no confirmado se
  marca **"por confirmar"**. Los base_id de target y todos los nombres de unidad están verificados contra
  CHAR_META. **Journeys y el resto de legendaries: tanda siguiente (4.7).**
- **Motores generalizados con compatibilidad hacia atrás:** `vader.js`/`vaderplan.js` leen el target de
  relic (`need` viejo o `relic` nuevo) y el **gear objetivo por unidad** (`gear ?? 13`, ya no fijo a 13), con
  `unlockName` parametrizable. Sin `opts` se comportan igual que antes (tests de regresión intactos).
- **Motor nuevo** `web/src/ascension.js` (puro): `resolveTarget`, `planFor` (delega en los motores de Vader),
  `priorityQueue` (cola por tier, **un GL a la vez**). Re-exportado desde `engine.js`.
- **UI:** selector de objetivo (avatar + búsqueda + filtro por tier), anillo/hechos/planificador por objetivo,
  **plan semanal editable y persistido por objetivo** (no se autogenera; roadmap curado solo donde existe =
  Vader), y **tab GL derivada** de `unlock_db` + roster (poseídos/faltantes por cercanía + huecos). El
  emparejamiento sigue siendo **por nombre**; la clave interna de la tab (`vader`) se mantiene (solo cambia la
  etiqueta visible).
- **Persistencia** (`store.js`): `swgoh.ascension.target`/`.plan`/`.prios` + **migración** de la energía
  (`swgoh.vader.energy` → `swgoh.ascension.energy`) sin perder el valor guardado del usuario.
- Estética intocable, consola nunca en blanco (fallback embebido). **224 tests verdes** (203 + nuevos; se
  añade `ascension.test.js` + `ascension-render.test.js`; regresión Vader idéntica). Build → 1 HTML (496 KB).
- Tag: `v4.6-ascension`.

## Fase 4.5 — Planificador de datacrones (guía curada por temporada) — `v4.5-datacrons`

- Nueva pestaña **Datacrons (11)**: recupera el planificador que la Fase 4.1 **difirió** (tienes **0**
  datacrones → nada personal que auditar). NO es un auditor de datos personales: es un **recomendador
  CURADO por temporada** —mismo patrón que `counter_db` (Fase 3) y `fleet_db` (Fase 4.3)—.
- **Datos evergreen y honestos:** el set de datacrones **rota** cada temporada y **no se puede traer en
  vivo** (egress a swgoh.gg bloqueado + no viene en el export). Por eso `datacron_db.json` cura **rutas**
  `alineación (L3) → facción (L6) → personaje (L9)` **estables** para squads meta, con texto **cualitativo**
  (qué potencia y por qué), **sin cifras inventadas**. Nota clara: en el juego eliges el set más cercano.
- **Motor puro** `web/src/datacrons.js` (`planDatacrons`): cruza la guía con el roster en vivo → marca
  `usable` (poseo el personaje L9 **y** tengo su facción), relic/gear del target, recuento de facción.
  Orden determinista: aprovechables → tier (S<A<B) → id. Nunca lanza.
- **14 rutas curadas** (First Order/SLKR, Sith/SEE, Jedi/JML+JMK, Rebeldes/GL Leia, República/GAS+Padmé,
  Nightsister/Great Mothers, Cazarrecompensas/Jabba, Imperio/Thrawn, Separatistas/Grievous,
  Resistencia/GL Rey, Old Republic/JKR, Sith/Darth Revan). **base_ids de target y tags de facción
  verificados** contra CHAR_META/RD (test de integridad).
- El callout **"0 datacrons"** de Arena/Mods se **mantiene** y ahora **enlaza** a la nueva pestaña.
- **100% cliente:** cero Worker, cero pipeline, cero endpoint (guía estática + roster ya cargado). Tests:
  `datacrons.test.js` (13) + `datacrons-render.test.js` (7, jsdom) → **203 verdes**. Build → 1 HTML (472 KB).
  (Se añade `vitest.config.js` con `testTimeout` mayor para que `npm test` sea verde bajo carga.)
- Tag: `v4.5-datacrons`.

## Fase 4.4 — Constructor de defensa de TW (+ contexto de gremio) — `v4.4-twdefense`

- Nueva pestaña **TW (10)**: monta **tu defensa** de Territory War desde tu roster completo —
  `zonas × defensas/zona` escuadrones fuertes **sin repetir personajes**, repartidos por zonas.
- **Gate de honestidad:** la API de gremio da **GP por miembro, no rosters** → NO se simula qué monta
  cada compañero. El módulo construye TU defensa (datos que sí tenemos) + **contexto de gremio** (tu
  rango por GP, vía `guildRanking`). Disclaimer visible; no simula combates.
- **Motor puro** `web/src/twdefense.js`: `planTWDefense` greedy no-solapante (pool que mengua,
  reutiliza `assemble()`; **unicidad de GL por escuadrón** intacta; las GL se reparten entre defensas).
  Determinista. `ranOut` si el roster no da para todos.
- **Formato configurable y persistido** (`store.js`, `loadTW/saveTW`): nº de zonas, defensas por zona,
  tamaño 3/5. Botón Regenerar.
- **100% cliente** (roster + gremio ya cargados): cero Worker, cero pipeline. Tests: `twdefense.test.js`
  (12) + `twdefense-render.test.js` (6, jsdom) → **183 verdes**. Build → 1 HTML (455 KB).
- **Cierra la Fase 4.** Tag: `v4.4-twdefense`.

## Fase 4.3 — Fleet Arena module (recomendador de flota) — `v4.3-fleet`

- Nueva pestaña **Flota (09)**: qué **flotas meta puedes montar** (naves 7★ que posees), cuáles están
  **"casi"** (falta la capital), y cuáles bloqueadas — con **orden de arranque** y **crew** (pilotos con
  relic/gear desde el roster en vivo). Filtros por lado/tier.
- **Pipeline (naves, antes se tiraban):** `compactShips()` (combat_type 2) → la ingesta local escribe
  `ships/{ally}` con dedup → nuevo endpoint **read-only** `GET /api/fleet/:ally` (desplegado y
  verificado: 200 + 64 naves). HTML con **fallback embebido** (`SHIPS_EMBED`).
- **Datos:** `SHIP_META` (70 naves de `swgoh.gg/api/ships/`; imagen `tex.charui_*` → `portrait()` vale)
  + `fleet_db.json` **curado** (10 flotas meta, base_ids verificados contra SHIP_META/CHAR_META). El
  crew se cura ahí (la API de naves no trae pilotos) y se cruza con `RD`.
- **Motor puro** `web/src/fleet.js`: `planFleet` (montable/casi/bloqueada, orden por estado+tier,
  crew readiness). Determinista.
- **Honestidad:** meta **curada** (tiers/arranque cambian); la fuerza real depende de los pilotos/mods
  — disclaimer visible. Con el roster real: **7 de 10 flotas montables**.
- Worker **read-only**. Tests: `fleet.test.js` (9) + `fleet-render.test.js` (5, jsdom) → **167 verdes**.
  Build → 1 HTML (449 KB).
- Tag: `v4.3-fleet`.

## Fase 4.2 — Planificador de energía / ETA hacia Lord Vader — `v4.2-vaderplan`

- Nueva **card computada** en la pestaña Lord Vader (aditiva; no toca el roadmap narrativo ni
  `vaderProgress`): cruza el **roster en vivo** (relic/gear por unidad) con los objetivos de Vader
  (`DATA.lv`) y estima el **trabajo restante en días** + un **orden de farmeo priorizado** (lo más
  barato/impacto primero, las hechas ✓ al final) + **ETA en semanas** hasta desbloquear.
- **Motor puro** `web/src/vaderplan.js`: `VADER_COSTS` (tabla curada y transparente) + `vaderPlan(rd,
  {costs, dailyGearEnergy})`. Determinista. Reproduce el gap real (**57 relic + 17 gear**).
- **Energía diaria configurable y persistida** (`localStorage`, `store.js`): al cambiarla se recalcula
  la ETA; el **gear** se modela energía→días, el **relic** en días/nivel curados.
- **Honestidad:** es una **estimación**, no rutas de nodo exactas; el material de relic no es pura
  energía (mats/créditos/GET). Disclaimer visible; tablas editables.
- **100% cliente:** cero Worker, cero pipeline, cero endpoint. Tests: `vaderplan.test.js` (8) +
  `vaderplan-render.test.js` (4, jsdom) → **153 verdes**.
- Tag: `v4.2-vaderplan`.

## Fase 4.1 — Auditoría de mods dinámica + export a Grandivory — `v4.1-modaudit`

- La pestaña **Arena / Mods** deja de ser un diagnóstico estático (4 cifras + plan SLKR + reubicación
  hardcodeados en `DATA`) y pasa a **auditoría dinámica** del inventario real de **1700 mods**,
  alimentada por el pipeline. Primer módulo que empuja datos NUEVOS de la cuenta por TODO el pipeline.
- **Pipeline (write path):** `normalize.compactMods()` compacta el export (dropea `stat_min/max/
  unscaled/value` crudo; conserva `display_value`) → la ingesta local escribe `mods/{ally}` con
  **dedup por hash** (~396 KB, 1 doc; guarda de paginado si >900 KB). Nuevo endpoint **read-only**
  `GET /api/mods/:ally` en el Worker (mismo patrón/CORS). Desplegado y **verificado** (curl 200 +
  MCP): 1700 mods + 362 units.
- **Motor puro** `web/src/mods.js`: `modQuality` (estado OBJETIVO: puntos/color/nivel/velocidad 2ª +
  calidad de tirada — NO el "fit" con el personaje), `auditMods` (global + **ofensores por inversión**
  + **quick-wins** computados). `SET_MAP` verificado empíricamente (no adivinado). Determinista.
- **UI:** estado global calculado (742 sin subir, 17 con vel≥20, 238 de 6 puntos, 649 dorados — en
  vivo), barras por color, ofensores (relic'd/G13 con mods grises y +0 vel arriba), quick-wins
  (subir nivel / reubicar velocidad, nunca sugiere gasto) y **grid filtrable** por color/set/bandera/
  personaje. `loadMods()` con **fallback** al resumen embebido (`MODS_EMBED`, ~10 KB) → nunca en blanco.
- **Export honesto a Grandivory:** botón a `mods-optimizer.swgoh.grandivory.com` + **copiar ally code**.
  Verificado que **no hay deep-link por ally code** (la URL antigua ya no resuelve) → no se inventa; el
  JSON de import tampoco (esquema no confirmado). Es un **auditor**, no un optimizador (disclaimer en UI).
- **Datacrones:** 0 usados → no se construye panel vacío; se mantiene el callout "0 datacrons".
- Worker **read-only** (toda la escritura, en la ingesta). Fix menor: `renderCounters` cableaba TODO
  `.cgen`; ahora acotado a `#counters`. Tests: `mods.test.js` (13, cifras reales exactas) +
  `mods-render.test.js` (6, jsdom, vivo y fallback) → **141 verdes**. Build → 1 HTML (416 KB).
- Tag: `v4.1-modaudit`.

## Fase 3.5 — Búsqueda avanzada en el selector (filtros tipo Conquest) — `v3.5-filtros`

- El buscador de personajes (zonas enemigas y bloqueo) gana una **barra de filtros** tipo Conquest:
  **Lado · Rol · Facción · Mecánica**, desplegables seleccionables combinados con **Y** + el texto libre.
- **Facetas por contexto**: las zonas filtran sobre **todo el juego** (333 de la metadata); el bloqueo,
  sobre **mi roster**. El estado de filtros **persiste durante la sesión** (entre búsquedas y aperturas;
  no en `localStorage`) y lo **comparten todas las zonas**; el bloqueo tiene el suyo. Botón **Limpiar**.
- Cambiar un filtro **re-filtra en vivo** (no re-renderiza el tablero). El picker no se cierra al tocar
  los selects (se controla el foco del contenedor). Teclado (↑/↓/Enter) y clic siguen igual.
- Reutiliza el modelo de facetas de Conquest (`RD.V.factions/roles/abilities`, `ROLE_ES`). Índice del
  picker enriquecido a `{id,n,s,r,c,a}` (c/a por referencia). **Cero cambios de motor/estado.**
- Tests: barra presente en zona y bloqueo, filtrar por Lado reduce la lista (combina con texto), y los
  filtros persisten/comparten entre zonas → **122 verdes**.
- Tag: `v3.5-filtros`.

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
