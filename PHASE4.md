# FASE 4 — Módulos de valor · **4.1 Auditoría de mods dinámica + export a Grandivory**
### Guía y prompt para Claude Code

> **ESTADO ACTUAL (reconciliado) — la Fase 4 fue más allá de 4.1.** Este documento documenta en detalle la
> **4.1**; el resto de sub-fases se entregaron después. Resumen de lo realmente hecho:
> - **4.1 · Auditoría de mods + Grandivory** — `v4.1-modaudit` (motor `mods.js`, endpoint `/api/mods`).
> - **4.2 · Planificador de energía → Vader** — `v4.2-vaderplan` (`vaderplan.js`, 100% cliente).
> - **4.3 · Fleet Arena** — `v4.3-fleet` (pestaña Flota, `fleet.js`, `/api/fleet`, `SHIP_META`+`fleet_db`).
> - **4.4 · Defensa de TW** — `v4.4-twdefense` (pestaña TW, `twdefense.js`).
> - **4.5 · Planificador de datacrones** — `v4.5-datacrons` (pestaña Datacrons, `datacrons.js`, guía curada).
> - **4.6 · Objetivo de ascensión configurable** — `v4.6-ascension` (de-hardcodeo: tab "Vader"→"Ascensión",
>   `unlock_db.json` + `ascension.js`, plan editable, tab GL derivada). **224 tests.** Prerrequisito de la Fase 5.
> - **4.7 · Prioridades editables** — pendiente (`v4.7-prios`). Especificación completa en **`PHASE4.6.md`**.
>
> Las especificaciones detalladas de **4.6 y 4.7** viven en **`PHASE4.6.md`**. Lo que sigue abajo es la guía
> original de la **4.1** (se conserva como referencia histórica).

> Idioma: **español**. Estética: **intocable** (Sith/holotable, `--ember`, `--holo`, scanlines).
> Motor nuevo **puro y testeable** en `engine.js`. La consola **nunca en blanco** si falta el endpoint o falla la API.
> **Honestidad F2P:** esto es un **auditor** (detecta déficits objetivos), **no** un optimizador completo. El optimizador es Grandivory — por eso exportamos a él.

---

## CONTEXTO (estado tras Fase 3.5)

- Read path **operativo en producción**: Worker `swgoh-consola…workers.dev` sirve `/api/roster/:ally`,
  `/api/guild/:id`, `/api/progress/:ally`, `/api/snapshots/:ally`, `/api/meta/characters` desde Firestore `swgohapi`.
- Ingesta (write path) corre **en local** al iniciar sesión (Cloudflare bloquea Worker y datacenter → ver Fase 1.2/1.3).
- **122 tests verdes.** Build esbuild → 1 HTML (~190 KB). 8 tabs: **Arena/Mods**, Vader, GL, Counters, Roster, Conquest, Mejoras, Progreso.
- La pestaña **"Arena / Mods"** actual es un **diagnóstico ESTÁTICO**: 4 números pre-cocinados en `DATA.mod_health`
  (`{unleveled,total,spd20,sixdot}`) + un plan de SLKR **hardcodeado** (`DATA.mods_plan`) + una lista de reubicación
  **fija** (`DATA.relocate`). **No lee el inventario real de 1700 mods** — solo pinta 4 cifras y un plan escrito a mano.

### ⚠️ La diferencia clave de esta fase respecto a la Fase 3
La Fase 3 fue **metadata-only y cero cambios en el Worker** (el kit es fijo por personaje). **La Fase 4.1 es distinta:
es el primer módulo que empuja datos NUEVOS de TU cuenta por TODO el pipeline** (ingesta → Firestore → Worker → HTML).
El inventario de mods **ya se descarga** en el export de swgoh.gg que baja tu ingesta local; lo que falta es **conservarlo,
compactarlo, servirlo y auditarlo**. No hay ningún muro de red aquí: son **tus** datos, ya en tu máquina.

---

## HALLAZGOS DE DATOS — verificados sobre tu export real (`SWGOH_actual.json`). **NO los re-descubras.**

El export crudo de swgoh.gg tiene 4 claves de nivel superior: `data` (perfil), `units` (362), `mods` (**1700**), `datacrons` (**0**, ver abajo).

### `mods[]` — cada mod (ejemplo real, campos que importan)
```jsonc
{
  "id": "H7sAPmZdTfuugAo3rfRPTw",   // id único del mod
  "character": "IG90",              // base_id donde está equipado (NUNCA vacío en tu cuenta: 0 mods sueltos)
  "slot": 2,                        // 2..7  → 6 formas (cuadrado, flecha, rombo, triángulo, círculo, cruz)
  "set": "4",                       // id de set (1..8) → mapear a nombre/bonus/piezas (ver ⚠️ mapeo)
  "rarity": 5,                      // PUNTOS (dots): 5 o 6 (6 = máximo)
  "tier": 5,                        // COLOR: 1 gris · 2 verde · 3 azul · 4 morado · 5 dorado
  "level": 1,                       // 1..15  (en tu cuenta SOLO hay 1 o 15: subido o intacto)
  "reroll_count": 0,
  "primary_stat":   { "stat_id": 48, "name": "Offense", "display_value": "0.63%", "value": 0.0063 },
  "secondary_stats":[
    { "stat_id": 42, "name":"Defense", "display_value":"8", "value":80000,
      "roll":1, "stat_rolls":[0.16789], "stat_min":490000, "stat_max":980000 }
    // ... hasta 4 secundarias
  ]
}
```

### 🔴 GOTCHAS de datos (críticos — el motor será incorrecto si los ignoras)
1. **`value` viene ESCALADO; usa `display_value` para el número humano.** Ej.: velocidad con `value:70000` es **7** de velocidad
   (`display_value:"7"`). Salud con `value:4230000` es **423**. **Siempre** parsea `display_value` para umbrales y para mostrar.
2. **Velocidad = `stat_id 5`.** Es el rey. Un mod "bueno" en el meta = velocidad alta como secundaria.
3. **Eficiencia de tirada:** `secondary_stats[].roll` = nº de veces que rolló esa secundaria; `stat_rolls[]` = percentil (0–1)
   de cada roll dentro de `[stat_min, stat_max]`. Media de `stat_rolls` ≈ calidad objetiva de esa secundaria.
4. **`units[].data`** trae inversión y aporte de mods por personaje — úsalo para **priorizar** la auditoría:
   `gear_level`, `relic_tier`, `rarity` (estrellas), `power`, `combat_type` (1 pj / 2 nave),
   `stats["5"]` = **velocidad final** del personaje, `stat_diffs["5"]` = **velocidad que aportan sus mods**.
5. **Set ids 1..8:** es una **constante conocida** de swgoh.gg (nombre + bonus + piezas: 4 piezas = Velocidad/Ofensiva/Daño Crítico;
   2 piezas = Salud/Defensa/Prob.Crítica/Potencia/Tenacidad). **⚠️ NO adivines el mapeo numérico** — deriva/verifica el id→nombre
   (mislabel = bug silencioso). `units[].data.mod_set_ids` indica los sets completados por personaje.

### Cifras reales de TU cuenta (siembra los tests con estos valores exactos)
| Métrica | Valor | Nota |
|---|---:|---|
| Mods totales | **1700** | 298 personajes, 64 naves |
| Sin subir (level < 15) | **742** | 44 % del inventario intacto |
| Con velocidad ≥ 20 | **17** | ≥15: 50 · ≥10: 143 · media (de las que tienen): **7** · máx en un mod: **27** |
| De 6 puntos | **238** | resto a 5 puntos |
| Por color | gris 267 · verde 159 · azul 368 · morado 257 · **dorado 649** | 794 por debajo de morado |
| Mods sueltos (sin personaje) | **0** | pero maneja el caso vacío igual |

**Top ofensores reales** (relic ≥5 con casi nada de velocidad de mods → historia central de la auditoría):
`Aayla Secura R5G13 → +0 vel de mods`, `Han Solo R10G13 → +0`, `JK Revan R6G13 → +0`, `Rey (Scavenger) R9G13 → +0`,
`Amilyn Holdo R7G13 → +3`, `Cal Kestis R9G13 → +3`, `Jango Fett R9G13 → +3`… (relic 7 con mods grises = el arreglo más barato que hay).

### Datacrones: la verdad honesta
`datacrons: []` está **vacío** y usas **0** (dato ya reflejado en la cabecera). **No hay nada personal que auditar.**
→ **NO construyas una pestaña/panel de datacrones vacía** (violaría "nada a medias"). Mantén el callout honesto de "0 datacrons"
en la cabecera. Un **planificador** de datacrones (meta curado por temporada, como `counter_db`) se **difiere** a una sub-fase
futura y se marcaría como **curado, no dato personal**. Fuera de esta sesión.

---

## OBJETIVO FASE 4.1

Convertir "Arena / Mods" de **diagnóstico estático** a **auditoría dinámica** del inventario real, alimentada por el pipeline,
y ofrecer **export a Grandivory Mod Optimizer**. En concreto:

1. **Pipeline:** conservar los mods (compactados) en la ingesta → Firestore → **nuevo endpoint read-only `/api/mods/:ally`** → HTML con **fallback embebido**.
2. **Motor puro** (`engine.js`): `modQuality(mod)` + `auditMods({units,mods,roster})` → estado global, **ofensores por inversión** y **quick-wins computados** (adiós al `relocate` hardcodeado).
3. **UI** (evoluciona la pestaña actual, aditivo, estética intocable): tarjetas de estado dinámicas, tabla de ofensores con avatares, quick-wins reales, filtros.
4. **Export Grandivory:** deep-link garantizado por ally code (+ JSON opcional *verify-first*).

El plan de SLKR y las 4 cifras estáticas **se sustituyen** por su equivalente **calculado** (mismos números, ahora en vivo).

---

## Prompt inicial para Claude Code

```
Lee ROADMAP.md y PHASE4.md. Ejecuta SOLO la Fase 4.1 (Auditoría de mods + export Grandivory).
NO abordes datacrones (0 usados → nada que auditar), ni 4.2/4.3/4.4 en esta sesión.

Estado: read path en prod (Worker read-only + Firestore swgohapi), ingesta local, 122 tests
verdes, build esbuild → 1 HTML. Estética INTOCABLE, español, cero secrets.

Contexto de datos ya verificado en PHASE4.md (NO lo re-descubras): el export de swgoh.gg trae
mods[] (1700) con id, character, slot(2-7), set(1-8), rarity(dots 5/6), tier(color 1-5),
level(1-15), primary/secondary con stat_rolls. GOTCHA #1: secondary_stats[].value viene
ESCALADO — usa display_value para el número humano (velocidad=stat_id 5). units[].data trae
gear_level/relic_tier/rarity/power/combat_type + stats["5"] (vel final) y stat_diffs["5"]
(vel que aportan los mods) → úsalo para priorizar. Cifras reales para sembrar tests: 1700
totales, 742 sin subir (level<15), 17 con velocidad>=20, 238 de 6 puntos, dorado 649.

A DIFERENCIA de la Fase 3 (metadata-only, cero Worker), esta fase SÍ toca el pipeline: son
MIS datos y no hay muro de red. Extiende: (1) la ingesta para conservar mods COMPACTADOS
(dropea stat_min/max/unscaled_roll_values; conserva lo que audita el motor), respetando el
límite de 1 MB por documento de Firestore (chunkea si hace falta); (2) un endpoint read-only
NUEVO /api/mods/:ally en el Worker (mismo patrón/CORS que /api/roster); (3) el HTML: consume
/api/mods con FALLBACK a un snapshot compacto embebido (como RD/DATA). Worker SIEMPRE
read-only: toda la lógica de escritura va en la ingesta.

Motor: PURO y testeable en engine.js. modQuality(mod) puntúa estado OBJETIVO del mod
(puntos, color, nivel, velocidad secundaria y su calidad de tirada) — NO el "fit" con el
personaje (eso es de Grandivory). auditMods() devuelve estado global + ofensores priorizados
por inversión (relic/gear) + quick-wins. Determinista.

Honestidad obligatoria: esto es un AUDITOR de déficits objetivos, no un optimizador. Por eso
el export a Grandivory. Para el export, el camino GARANTIZADO es un deep-link por ally code
(Grandivory baja los datos de swgoh.gg él mismo) — VERIFICA la URL actual antes de fijarla.
Un JSON descargable de import es OPCIONAL y verify-first: si no confirmas el esquema de import
vigente, NO lo inventes; entrega solo el deep-link + copiar ally code.

Reglas: ediciones quirúrgicas brace-safe (git restore si algo se rompe); node --check + vitest
verdes antes de cerrar; la consola nunca en blanco; unicidad de GL de assemble() intacta.
Commits atómicos en español. Tag final: v4.1-modaudit.

Empieza mostrándome, para aprobar ANTES de codificar: (1) el plan de ficheros que tocarás,
(2) el esquema EXACTO del mod compactado (y el tamaño estimado del payload/estrategia de
chunking en Firestore), y (3) la tabla de puntuación de modQuality y los umbrales de la
auditoría. No codifiques el motor hasta que lo apruebe.
```

---

## PASOS DETALLADOS

### 1. Pipeline: conservar mods (el trabajo nuevo de verdad)

**1a. Ingesta — compactar.** El crudo son ~2 MB (1700 mods con min/max/unscaled). Compacta a lo que audita el motor:
```jsonc
// por mod
{ "id":"…", "c":"IG90", "sl":2, "set":4, "d":5, "col":5, "lv":1,
  "p":{ "s":48, "v":"0.63%" },                 // primaria: stat_id + display_value
  "sec":[ { "s":5, "v":"7", "r":2, "q":0.31 } ]// secundarias: stat_id, display_value, nº rolls, calidad media de stat_rolls
}
```
- **Dropea** `stat_min`, `stat_max`, `unscaled_roll_values`, `name`, `value` crudo. Guarda `display_value` como `v`.
- Añade también, por unidad, un mini-payload de inversión ya presente en `RD` (`gear`, `relic`, `power`, `rarity`) + `spdMods` = `stat_diffs["5"]` y `spdFinal` = `stats["5"]` (necesarios para los ofensores; hoy `RD` no los lleva).
- **Firestore — límite 1 MB/doc.** 1700 mods compactos rondarán ~150–250 KB; probablemente entra en un doc. **Aun así,**
  mide el tamaño real y si te acercas al límite, **chunkea** (`mods/{ally}/pages/{n}`) o comprime; documenta la estrategia.
- Dedup por hash como el resto (no reescribas si no cambian).

**1b. Worker — endpoint read-only nuevo `GET /api/mods/:ally`.** Mismo patrón que `/api/roster/:ally`: lee Firestore, CORS
`PAGES_ORIGIN`, ordena en JS si hace falta (ver truco `orderBy` de Fase 1.3), **cero lógica de escritura**. Verifica el
deploy releyendo el código con el MCP de Cloudflare (`workers_get_worker_code`) como en fases previas.

**1c. HTML — consumo con fallback.** Embebe un **snapshot compacto** de mods como `MODS_EMBED` (patrón `RD`/`IMGBYNAME`),
consume `/api/mods/:ally` en runtime y **cae** al embebido si falla. **Nunca** dejes la pestaña en blanco.

### 2. Motor puro en `engine.js` (testeable, sin DOM)

```
modQuality(mod) -> { score, flags }
  // OBJETIVO, no "fit". Combina:
  //   dots (5/6), color (1..5), level (1..15),
  //   velocidad secundaria (display>0), su valor, nº de rolls, y calidad media (q).
  // flags: 'unleveled' (lv<15), 'lowColor' (col<4), 'noSpeed' (sin secundaria de velocidad),
  //        'sixDot', 'premiumSpeed' (velocidad>=15). Determinista.

auditMods({ units, mods, roster }) -> {
  global: { total, unleveled, byColor:{gris,verde,azul,morado,dorado}, byDots:{5,6},
            speedGe:{10,15,20,25}, avgSpeed },
  offenders: [ { id, name, relic, gear, spdMods, spdFinal, worstMods:[modId…], why } ],
      // personajes de ALTA inversión (relic>=5 o gear13) con mods 'unleveled'/'lowColor'/'noSpeed'.
      // ordena por (inversión alta × déficit) — los relic 7 con mods grises primero.
  quickWins: [ { kind:'level'|'move', … , gain, cost } ]
      // 'level': subir a 15 los mods que ya llevan tus mejores squads (barato, alto impacto).
      // 'move' : reubicar un mod de velocidad alta que malgasta un personaje de banquillo hacia una unidad clave
      //          (equivalente COMPUTADO del antiguo DATA.relocate, ya no hardcodeado).
}
```

Reglas del motor:
- **Sesgo velocidad-primero** (meta SWGOH y espíritu de la pestaña actual). Honestidad F2P: nunca sugiere gasto.
- `modQuality` **no** decide si el mod "encaja" con el personaje (un tanque quiere secundarias distintas a un atacante):
  eso es competencia de **Grandivory**. El auditor marca déficits **objetivos** (sin subir, color bajo, sin velocidad).
- Determinista y puro: mismos inputs → mismo output (para tests).

#### Tabla de puntuación / umbrales (mantén como objeto de datos `MOD_RULES`, ampliable sin tocar lógica)
| Señal | Umbral | Bandera / peso |
|---|---|---|
| Sin subir | `level < 15` | `unleveled` (déficit barato #1) |
| Color bajo | `tier < 4` (gris/verde/azul) | `lowColor` |
| Sin velocidad | ninguna secundaria `stat_id 5` con `display>0` | `noSpeed` |
| Velocidad premium | velocidad secundaria `display ≥ 15` | `premiumSpeed` (candidata a reubicar) |
| 6 puntos | `rarity == 6` | `sixDot` (prioriza subir estos) |
| Inversión del pj | `relic_tier ≥ 5` **o** `gear_level ≥ 13` | entra en `offenders` si sus mods fallan |

### 3. UI — evolucionar "Arena / Mods" (aditivo, estética **intocable**)
Reutiliza clases existentes (`.statgrid/.stat`, `.trow`, `.relocate`, `.meter`, `portrait()`, `lookupByName()`).
- **Estado global de tus mods** (`#modstats`): **calculado** por `auditMods().global` (reproduce 742 / 17 / 238 en vivo, ya no `DATA.mod_health`). Añade barras por color y distribución de velocidad.
- **Ofensores por inversión** (sustituye/mejora el bloque estático "Equipo a modear #1"): tabla con avatar, `R#·G#`,
  **velocidad de mods** vs **velocidad final**, y el **porqué** ("relic 7 con mods grises"). Los relic'd con `+0` de mods arriba del todo.
- **Quick-wins computados** (sustituye `DATA.relocate` hardcodeado): "sube a 15 estos N mods de tu squad de arena" y
  "mueve este mod de +X velocidad de `banquillo` → `unidad clave`". Cada uno con impacto y coste ("barato").
- **Filtros** (patrón Conquest/War Room): por color, por set, por bandera (sin subir / sin velocidad / 6 puntos), por personaje.
- **Botón de export a Grandivory** (ver §4) en la cabecera de la pestaña.
- Mantén el tono del diagnóstico de cabecera ("no es tu roster, son tus mods"), ahora con cifras **en vivo**.

### 4. Export a **Grandivory Mod Optimizer** (honesto)
- **Camino GARANTIZADO (primario):** botón que abre Grandivory **para tu ally code** — su optimizador **baja los datos de
  swgoh.gg él mismo** (huella de navegador real, no le afecta el muro). **VERIFICA la URL/patrón vigente** antes de fijarlo
  (ha cambiado con el tiempo); si no puedes verificarlo, deja **copiar ally code** + enlace a la home del optimizador.
- **Opcional (verify-first):** un JSON descargable en el esquema de import documentado de Grandivory/HotUtils.
  **Si no confirmas el esquema actual, NO lo inventes** — entrega solo el deep-link. Un import con esquema equivocado es peor que no tenerlo.
- **Cero secrets, cero Worker.** El export es 100 % cliente.

### 5. Tests (vitest) — súmalos a los 122 existentes
- `modQuality`: mod dorado/6pts/lv15 con velocidad alta → sin `unleveled`/`lowColor`/`noSpeed`; mod gris lv1 sin velocidad → las tres banderas.
- **`auditMods().global` con tu export real** → `total 1700`, `unleveled 742`, `speedGe[20] 17`, `byDots[6] 238`, `byColor.dorado 649`. (Siémbralo como fixture.)
- `offenders`: incluye a Aayla/Han/JK Revan/Rey Scavenger con `spdMods 0`; ordenados con los relic'd-y-grises primero; determinista.
- `quickWins`: no propone gasto; `move` respeta que la unidad destino sea clave; estable ante reordenación de la entrada.
- **Gotcha display_value:** un test que pruebe que una secundaria de velocidad con `value` escalado se lee como su `display_value` entero (p.ej. `"7"`, no `70000`).
- Render real en jsdom del panel: pinta con datos en vivo y con fallback embebido; **no** deja la pestaña en blanco; estética sin regresiones.

---

## SUB-FASES SIGUIENTES DE LA FASE 4 (scoped — **no** en esta sesión, una por sesión)

| Sub-fase | Qué | Disponibilidad de datos (honesto) |
|---|---|---|
| **4.2 · Planificador de energía → Lord Vader** | Nodos de farmeo + ETA por unidad para cerrar el gap de Vader (ya tienes `DATA.lv` con relic/gear gaps). | Ubicaciones de nodos = **meta curado** (swgoh.wiki), no vienen en el export. El progreso real (relic/gear) sí, ya en vivo. |
| **4.3 · Fleet Arena module** | Tu gremio es fuerte en flota (vía barata de cristales): mejor comp de flota disponible + orden de arranque. | Naves ya están en `units` (`combat_type 2`, 64 naves). Kits de naves = metadata (como personajes). |
| **4.4 · Simulador defensivo de TW** | Colocación defensiva usando datos del gremio. | El gremio ya se ingiere (pestaña Progreso). Sin `arena_rank`/nº GL por miembro (la API no los da — ver Fase 2). |
| **4.x · Planificador de datacrones** | Recomendador de reticle/ruta por temporada para tus squads clave de GAC. | **Curado por temporada** (como `counter_db`), **no** dato personal (tienes 0). Difiere hasta que craftees alguno o quieras la capa curada. |

Cada una es **1 sesión**, deja el proyecto desplegable y llevará su propio tag (`v4.2-…`, etc.).

---

## DEFINICIÓN DE HECHO (Fase 4.1)
✓ `node --check` + **todos** los vitest verdes (122 previos + nuevos, sembrados con las cifras reales) ·
✓ Pipeline extendido: ingesta conserva mods compactos · endpoint `/api/mods/:ally` read-only desplegado y **verificado con MCP** · HTML consume con **fallback embebido** ·
✓ Auditoría **dinámica**: estado global calculado (742/17/238 en vivo), ofensores por inversión y quick-wins **computados** (sin `DATA.relocate` hardcodeado) ·
✓ Export a Grandivory funcional (deep-link verificado; JSON solo si el esquema se confirmó) ·
✓ Estética sin regresiones · consola **nunca en blanco** · Worker **read-only** · unicidad de GL intacta · cero secrets ·
✓ commit(s) atómicos + tag `v4.1-modaudit` · nota en `docs/CHANGELOG.md` en español ·
✓ fila de Fase 4.1 en `ROADMAP.md` → ✅.

## TRAMPAS CONOCIDAS (no las repitas)
- ❌ Leer `secondary_stats[].value` en crudo para umbrales/mostrar → **usa `display_value`** (velocidad `70000` NO son 70000).
- ❌ Pretender que el auditor es un optimizador (fit por personaje). **No lo es** — por eso el export a Grandivory. Sé honesto en la UI.
- ❌ **Inventar** el esquema de import de Grandivory. Si no lo verificas, entrega solo el deep-link por ally code.
- ❌ Construir un panel de **datacrones vacío** (tienes 0). Mantén el callout "0 datacrons"; el planificador se difiere.
- ❌ Meter lógica de escritura en el Worker. **Read-only**; todo lo de escritura, en la ingesta.
- ❌ Reventar el **límite de 1 MB/doc** de Firestore con los 1700 mods sin compactar/chunkear.
- ❌ Dejar la pestaña en blanco si `/api/mods` falla → **fallback a `MODS_EMBED`**.
- ❌ Adivinar el mapeo **set id → nombre/piezas** (constante conocida de swgoh.gg). Verifícalo; mislabel = bug silencioso.
