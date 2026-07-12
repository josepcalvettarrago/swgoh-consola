# FASE 4.6 + 4.7 — De-hardcodeo · **Objetivo de ascensión y prioridades configurables**
### Guía y prompt para Claude Code

> Idioma: **español** en toda la UI, comentarios y prosa. Estética: **intocable** (Sith/holotable, `--ember #ff3546`, `--holo #3ad6e6`, gold, scanlines).
> Motores nuevos **puros y testeables**. La consola **nunca en blanco** si falta el endpoint o falla la API (fallback embebido).
> **Regla de oro de esta fase:** hoy la consola está clavada a Yusepi (objetivo = Lord Vader, plan = SLKR+Vader, huecos = Ahsoka/Hondo). El propósito es **de-hardcodearla** para que *cualquier* usuario elija su objetivo y su orden de farmeo **antes** de abrir el gremio (Fase 5). No es cosmético: es un **prerrequisito** de la Fase 5.
> **Cambios quirúrgicos, no rupturas.** `node --check` + tests verdes antes de cerrar. La estética debe quedar pixel-equivalente o mejor.

---

## CONTEXTO — estado tras Fase 4.5 (`v4.5-datacrons`)

- **Fase 4 completa.** 11 tabs funcionales: **Mods**, **Vader**, **GL**, **Counters**, **Roster**, **Conquest**, **Mejoras**, **Progreso**, **Flota**, **TW**, **Datacrons**. **203 tests verdes.** Build esbuild → 1 HTML (~190 KB).
- Read path **operativo en producción** (Worker `swgoh-consola…workers.dev`, Firestore `swgohapi`). Ingesta (write path) corre **en local** al iniciar sesión. Motores ya **agnósticos del roster** (`assemble`, `vaderplan`, `mods`, `fleet`, `twdefense`, `datacrons`, `diff`, `counters`).
- **La grieta que abre esta fase:** los motores son agnósticos, pero los **objetivos y el plan NO lo son**. Verificado en el bundle:
  - **La tab 2 entera es Vader.** `#p-vader`, título *"Protocolo de ascensión — Lord Vader"*, anillo `#lvring`/`#lvpct`/`#lvfacts`, `DATA.lv` (14 unidades con sus gaps), `VADER_COSTS`, roadmap semanal `#tl`/`#rmnote`. Todo asume que el objetivo es Vader.
  - **La tab GL** hardcodea `gl_missing`, `ahsoka_gap`, `hondo_gap` — el orden de GLs y los huecos **de Yusepi**.
  - **El bloque `DATA`** trae `plan` (narrativa SLKR+Vader), `mods_plan`, `relocate`, `proposals` (Top 5 de Yusepi), `guild` — editorial escrita para él.
- **Nota a corregir en el roadmap:** la Fase 5 dice *"los motores ya son agnósticos (solo cambia RD)"*. Es cierto a medias. Esta fase (4.6/4.7) es lo que hace que sea **verdad de punta a punta**.

---

## DECISIONES YA TOMADAS (no re-preguntar)

- **(a) Cobertura de la DB: CATÁLOGO COMPLETO.** `unlock_db.json` cubre **todos** los personajes desbloqueables por evento: **solo journeys** (prio 1), **guild/legendary journeys** (prio 2) y **Galactic Legends** (prio 3). Esto llena el hueco de contenido que hoy no existe (no hay guía de journeys ni legendaries).
- **(b) El plan semanal se mantiene EDITABLE A MANO.** No se auto-genera narrativa semanal para ~40 personajes. Conciliación honesta:
  - La **DB de requisitos** (qué unidades, a qué estrella/gear/relic) es la **guía de farmeo** objetiva → **catálogo completo, curado**.
  - El **plan semanal** (`DATA.plan`, texto narrativo) es un **artefacto opcional por objetivo**, **editable y persistido**. Sembrado donde ya existe (Vader). Vacío y rellenable en el resto. **No inventar planes semanales**; donde no hay plan curado se muestra la lista derivada de ETA (que el motor ya produce) + un lienzo editable.

---

## HALLAZGOS DE CÓDIGO — verificados sobre el bundle. **NO los re-descubras.**

### Los dos motores a generalizar (ya aceptan overrides por `opts` — el trabajo es pequeño)

**`web/src/vader.js` → `vaderProgress(rd, opts)`**
- Lee `opts.lv || DATA.lv` y `opts.plan || DATA.plan`.
- Empareja unidades por **nombre**: `byName = Map(rd.R.map(u => [u.n, u]))`. Relic actual = `u.rl`, gear actual = `u.g`.
- Target relic por unidad = `u.need`. **Hardcode a eliminar:** `byName.has("Lord Vader")` (comprobación de desbloqueo).
- Devuelve `{ units, phases, pct, vaderUnlocked, unitsDone, unitsTotal }`. Las `phases` vienen de `plan[].targets[{name, from, to}]`.

**`web/src/vaderplan.js` → `vaderPlan(rd, { costs = VADER_COSTS, dailyGearEnergy = 480, lv })`**
- Mismo emparejamiento por `u.n`; relic `u.rl`, gear `u.g`.
- Target relic = `u.need`. **Hardcode a parametrizar:** `tgtGear = 13` (fijo) y `byName.has("Lord Vader")`.
- Devuelve `{ units, order, totals:{ relicGap, gearGap, days, weeks, unlocked, dailyGearEnergy } }`. `order` = unidades ordenadas *no-hechas primero, luego por días* → **es la lista derivada que reutilizamos como "qué farmear ahora"**.
- `VADER_COSTS = { gearEnergyPerLevel:3600, relicDaysPerLevel:{1..9}, note }`. Curado F2P, transparente. **Reutilizable tal cual** para cualquier objetivo (los costes son por nivel, no por personaje).

### ⚠️ Conflicto de nomenclatura de campos (crítico — no confundir)
En `DATA.lv.units` el campo `relic` es un **fallback de "actual offline"** y `need` es el **target de relic**. En la nueva `unlock_db` **el campo `relic` será el TARGET** (requisito para desbloquear). Para evitar el choque:
- La `unlock_db` usa **nombres de campo de REQUISITO explícitos**: `{ name, stars, gear, relic }` = umbrales objetivo.
- El "actual" **se lee SOLO del roster en vivo** (`u.rl`/`u.g`); se elimina el fallback a "actual estático" (solo servía sin conexión y ahora induce a error).
- Adaptación del motor: `tgtRelic = unit.relic`, `tgtGear = unit.gear ?? 13`, `stars` informativo. Migra la entrada de Vader a este esquema y actualiza sus tests en el mismo commit.

### Persistencia — `web/src/store.js`
- Patrón `readJSON/writeJSON(storage, key, fallback)`; claves ya usadas: `swgoh.gac.locked`, `swgoh.gac.board`, `swgoh.vader.energy`, `swgoh.tw.format`.
- **Añadir:** `K_TARGET = "swgoh.ascension.target"` (id del objetivo elegido), `K_PRIOS = "swgoh.ascension.prios"` (orden de tiers / overrides de prioridad), `K_PLAN = "swgoh.ascension.plan"` (mapa `targetId → plan editado a mano`). Reutiliza `swgoh.vader.energy` para la energía (renómbrala a `swgoh.ascension.energy` con **migración**: si existe la vieja, cópiala).

### Render de la tab (IDs reales) — `ui.js`/`main.js`
- Energía: `#vp-energy` (input), stats `#vp-stats`, lista `#vp-list`, nota `#vp-note`. Anillo/hechos: `#lvring`, `#lvpct`, `#lvfacts`. Roadmap: `#tl`, `#rmnote`. Nota de nave: `#shipnote`.
- `renderVaderPlan()` usa `RD2` (roster en vivo), `vpEnergy`, `portrait(lookupByName(u.name))`.
- **Wiring de la tab:** botón `data-p="vader"` (línea ~613) y panel `#p-vader`. Hay literales `"vader"` en el dispatch de render (≈ líneas 1130, 1379, 1389, 3976). **Haz `grep -n '"vader"'` y `grep -n 'p-vader'` y generalízalos de forma consistente.**

### Picker de objetivo — infra que ya existe
- `CHARACTERS.json` (333) con `base_id`, `name`, `alignment`, `categories`, `role`, `image`, `combat_type`. `IMGBYNAME`/`portrait()` ya resuelven avatar por nombre. El componente `.wr-picker` (War Room, Fase 3.2) ya hace **selector clicable con avatar + búsqueda**: reutilízalo para elegir objetivo.

---

## FASE 4.6 — Objetivo de ascensión configurable (`v4.6-ascension`)

### 1) Dato nuevo: `web/src/data/unlock_db.json` (catálogo completo, curado)
Una entrada por personaje desbloqueable por evento. **Requisitos verificados** (swgoh.wiki); relic/gear reales por unidad.

```jsonc
{
  "id": "LORDVADER",                    // base_id de la unidad que se desbloquea
  "name": "Lord Vader",
  "tier": "galactic_legend",            // "journey" | "legendary" | "galactic_legend"
  "prio_default": 3,                    // 1 solo journey · 2 guild/legendary · 3 GL
  "alignment": "Dark Side",
  "faction": "Empire/Sith",
  "ship": { "name": "BTL-B Y-wing", "required": true, "stars": 7 },  // opcional
  "units": [                            // REQUISITOS = umbrales objetivo (no "actual")
    { "name": "CT-7567 \"Rex\"", "stars": 7, "gear": 13, "relic": 5 },
    { "name": "Grand Moff Tarkin", "stars": 7, "gear": 13, "relic": 7 }
    // …
  ],
  "source": "swgoh.wiki/Lord_Vader",
  "notes": ""
}
```

- **Journeys y legendaries** suelen pedir **gear** (p. ej. G12/G13) y `relic: 0` → el motor ya lo maneja (gap de relic 0). Por eso `tgtGear` **debe** salir de `unit.gear`, no ser fijo.
- **Migra la entrada de Vader** desde `DATA.lv` a este esquema (usando `relic` = el antiguo `need`). Deja `DATA.lv` como **alias derivado** de la entrada `LORDVADER` para no romper nada que aún lo lea, o elimínalo y actualiza sus referencias + tests en el mismo commit.
- **Presenta el esquema + la lista de tiers cubiertos (journey/legendary/GL) para aprobación ANTES de rellenar las ~40 entradas.** Rellenar el catálogo entero es curado a mano: hazlo por tandas (GLs → legendaries → journeys) con la fuente citada por entrada.

### 2) Motor nuevo: `web/src/ascension.js` (puro)
Capa de selección + prioridad por encima de los dos motores existentes (generalizados):
- `resolveTarget(db, id)` → entrada del objetivo (o el default `LORDVADER`).
- `planFor(rd, target, opts)` → delega en `vaderPlan`/`vaderProgress` **parametrizados** (`lv = target`, `unlockName = target.name`, `tgtGear` por unidad). Devuelve `{ progress, plan, order, totals }`.
- `priorityQueue(db, prios, rd)` → para cada tier en el orden del usuario, lista los objetivos **no desbloqueados** (la unidad `id` no está en `rd.R`) ordenados por cercanía (menor gap total primero). **Regla:** en el tier `galactic_legend`, surface **de uno en uno** (principio "un GL a la vez"; coherente con `assemble()` máx. 1 GL/equipo).

Generaliza los dos motores **manteniendo compatibilidad**: `vaderPlan`/`vaderProgress` siguen existiendo y, sin `opts`, se comportan igual (default = entrada Vader). Los tests previos deben quedar verdes sin tocarlos salvo la migración de campos.

### 3) UI — la tab "Vader" se convierte en "Ascensión"
- **Botón `data-p="vader"` → etiqueta "Ascensión"** (mantén la clave interna o renómbrala a `ascension`; si la renombras, actualiza TODO el wiring — ver hallazgos). Panel `#p-vader` → título **dinámico**: *"Protocolo de ascensión — {objetivo}"*.
- **Selector de objetivo** arriba (reutiliza `.wr-picker`): busca por nombre, avatar, filtra por tier/alineación. Al elegir, persiste `K_TARGET` y **re-renderiza toda la tab** (anillo, hechos, planificador de energía, roadmap) para ese objetivo. Default = Lord Vader.
- **Planificador de energía** (`#vp-*`): idéntico, pero para el objetivo elegido. La lista `order` es el "qué farmear ahora" derivado.
- **Plan semanal editable** (decisión b): panel con el plan **curado** si el objetivo lo trae (Vader), o **lienzo editable** (textarea por fases o markdown ligero) si no. Persiste en `K_PLAN[targetId]`. Botón *"Restablecer al curado"* si existe seed. **Nunca autogenerar narrativa.**
- **Tab GL:** `gl_missing`/`gapAhsoka`/`gapHondo` dejan de ser fijos → se **derivan** de `unlock_db` (tier `galactic_legend`) + roster en vivo. Yusepi verá lo mismo que hoy porque los datos coinciden, pero cualquier usuario verá **los suyos**.
- **Fallbacks:** si no hay endpoint/roster en vivo → `unlock_db` embebido + `RD` embebido. Nunca en blanco. Sin objetivo elegido → Vader por defecto.

### 4) Tests (DoD)
- `ascension.js`: `resolveTarget` (id válido/inválido→default), `planFor` con un **journey solo-gear** (relic 0, gap de gear correcto), `planFor` con Vader = idéntico al `vaderPlan` actual (regresión), `priorityQueue` (orden por tier + un solo GL surfaced), unidad ya desbloqueada excluida.
- Migración de campos: la entrada `LORDVADER` reproduce el gap real (57 relic + 17 gear).
- Render jsdom: selector cambia objetivo → título y `#vp-list` cambian; plan editable persiste y recarga.
- `node --check`, HTML sin regresiones visuales, **suma de tests verde** (esperado ~215+).

---

## FASE 4.7 — Prioridades de farmeo editables (`v4.7-prios`)

- **Tablero de prioridades**: tiers **prio 1 solo journeys · prio 2 guild/legendary · prio 3 GLs**, reordenables por el usuario (drag o botones ↑/↓), persistido en `K_PRIOS`. Override de prioridad por objetivo concreto (subir/bajar uno suelto).
- **Cola "próximo a farmear"** derivada de `priorityQueue` + roster en vivo: el siguiente objetivo de cada tier según el orden del usuario, con % de cercanía y unidades que faltan. Esto **sustituye** la narrativa fija de "qué viene después".
- **`proposals` (Top 5) dinámicos:** hoy son texto de Yusepi. Pásalos a **derivados** (o editables por usuario): p. ej. "auditoría de mods", "datacrons", huecos del objetivo activo. Mantén editable a mano como en (b) si el usuario quiere fijar los suyos.
- **Plan semanal**: sigue editable a mano (4.6); aquí se conecta a la cola de prioridades (el plan del objetivo activo se muestra según su posición en la cola).
- Tests: orden de tiers respeta `K_PRIOS`, override individual, cola excluye desbloqueados, "un GL a la vez" intacto. DoD igual que 4.6.

---

## TRAMPAS CONOCIDAS (bloqueadas de antemano)

1. **No confundas `relic` (target en `unlock_db`) con el antiguo `need`/`relic`-fallback de `DATA.lv`.** El "actual" SOLO del roster en vivo (`u.rl`/`u.g`).
2. **`tgtGear` NO es 13 fijo.** Journeys/legendaries piden gear variable; sácalo de `unit.gear`.
3. **Emparejamiento por NOMBRE (`u.n`), no por base_id**, porque así funcionan hoy los motores y `DATA.lv`. Mantén esa convención en `unlock_db.units[].name` (idéntico al display name del roster). El base_id solo se usa para `id`/picker/detección de desbloqueo.
4. **Wiring de la tab:** si renombras la clave `"vader"`, hay literales en el dispatch de render (varias líneas) + `#p-vader`. Grepéalos TODOS o deja la clave interna y cambia solo la etiqueta visible.
5. **No autogeneres el plan semanal.** Catálogo completo de *requisitos*, sí; narrativa semanal, solo curada o editada por el usuario.
6. **Un GL a la vez** en la cola de prioridades (no propongas dos GLs simultáneos).
7. **Estética intocable** y **nunca en blanco** (fallback embebido de `unlock_db` + `RD`).
8. **Migración de la clave de energía** (`swgoh.vader.energy` → `swgoh.ascension.energy`) sin perder el valor guardado del usuario.

---

## ACTUALIZAR DOCUMENTACIÓN (en el mismo trabajo)

### `ROADMAP.md`
- **Tabla de ESTADO ACTUAL:** confirma 4.1–4.5 como ✅ (ya listadas) y **añade filas** `4.6 — Objetivo configurable` y `4.7 — Prioridades editables` con su tag y nº de tests al cerrar. Actualiza la lista de tabs de la línea de estado: **"Vader" → "Ascensión"**.
- **Bloque FASE 4:** añade secciones `### Fase 4.6` y `### Fase 4.7` con el resumen de lo entregado (esquema `unlock_db`, motor `ascension.js`, selector, plan editable, prioridades).
- **FASE 5:** corrige la nota optimista *"solo cambia RD"* → indica que el de-hardcodeo (objetivo + prioridades + `unlock_db`) se resuelve en **4.6/4.7**, y que la Fase 5 ya solo mueve la config por-usuario de `localStorage` a Firestore + añade Auth. **4.6/4.7 son prerrequisito de la 5.**

### `PHASE4.md`
- Está **desfasado**: solo documenta la 4.1. **Reconcílialo** para reflejar lo realmente entregado en 4.1–4.5 (tags `v4.1-modaudit … v4.5-datacrons`, 203 tests, tabs Flota/TW/Datacrons) y **añade** las especificaciones de 4.6 y 4.7 (este documento las contiene; incorpóralas al doc del proyecto).

### `docs/CHANGELOG.md`
- Entradas en español para 4.6 y 4.7 (Definición de Hecho del proyecto).

---

## PROMPT INICIAL — listo para pegar en Claude Code

> Vamos con la **Fase 4.6** del proyecto SWGOH Consola (y dejamos preparada la 4.7). Objetivo: **de-hardcodear** la consola para que cualquier usuario elija su **objetivo de ascensión** y su **prioridad de farmeo**, antes de abrir el gremio (Fase 5). Idioma español, estética Sith/holotable intocable, motores puros y testeables, consola nunca en blanco.
>
> **Decisiones ya tomadas:** (a) `unlock_db.json` cubre el **catálogo completo** (solo journeys = prio 1, guild/legendary = prio 2, GLs = prio 3); (b) el **plan semanal se mantiene editable a mano** (no autogenerar narrativa; seed curado solo donde existe, p. ej. Vader).
>
> **Antes de escribir código:** lee `PHASE4.6.md`, `ROADMAP.md` y el HTML actual. Confirma que entiendes (1) el conflicto de nomenclatura `relic`/`need`, (2) `tgtGear` variable por unidad, (3) el emparejamiento por nombre, (4) el wiring de la tab `"vader"`. Luego **preséntame para aprobación**: el **esquema de `unlock_db.json`** y la **lista de tiers/entradas** que vas a curar (por tandas: GLs → legendaries → journeys), con la fuente por entrada. **No rellenes el catálogo ni escribas motores hasta que apruebe el esquema.**
>
> Tras la aprobación: crea `web/src/data/unlock_db.json`, generaliza `vader.js`/`vaderplan.js` (compatibilidad hacia atrás) y añade `web/src/ascension.js` (puro), migra la entrada de Vader al nuevo esquema, generaliza la tab a **"Ascensión"** con selector de objetivo (reutiliza `.wr-picker`), planificador por objetivo, plan editable persistido y tab GL derivada de la DB. Añade claves a `store.js` con migración de la de energía. Escribe tests (regresión Vader idéntica, journey solo-gear, priorityQueue con un GL a la vez, render jsdom). `node --check` + todos los tests verdes.
>
> Al terminar: **actualiza `ROADMAP.md` y `PHASE4.md`** (secciones 4.6/4.7, tabla de estado, corrección de la nota de la Fase 5, tab "Vader"→"Ascensión") y añade entrada en `docs/CHANGELOG.md`. Commit atómico + tag `v4.6-ascension`.
>
> La 4.7 (prioridades editables + cola "próximo a farmear" + proposals dinámicos) la abordamos en una sesión aparte; déjala especificada pero no la implementes ahora salvo que te lo pida.

---

**Definición de Hecho (4.6 y 4.7, por separado):** ✓ `node --check` + tests verdes · ✓ HTML sin regresiones visuales (estética intacta) · ✓ deploy funcional · ✓ commit + tag · ✓ nota en `docs/CHANGELOG.md` en español · ✓ `ROADMAP.md` y `PHASE4.md` actualizados.
