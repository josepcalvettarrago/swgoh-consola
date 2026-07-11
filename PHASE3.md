# FASE 3 — Advanced Counter Generator GAC (Scout 3v3 / 5v5)
### Guía y prompt para Claude Code

> Idioma: **español**. Estética: **intocable** (Sith/holotable, `--ember`, `--holo`, scanlines).
> Motor nuevo **puro y testeable** en `engine.js`. Reutiliza `assemble()`, no lo reescribas.
> Regla de oro: la consola nunca se queda en blanco si falta metadata o falla la API.

---

## CONTEXTO (estado tras Fase 2)

- Read path **operativo en producción**: Worker `swgoh-consola…workers.dev` sirve `/api/roster/:ally`,
  `/api/guild/:id`, `/api/progress/:ally`, `/api/snapshots/:ally` y `/api/meta/characters`
  desde Firestore `swgohapi`. El HTML consume roster + progreso + gremio con fallback embebido.
- Ingesta (write path) corre **en local** al iniciar sesión. **72 tests verdes.** Build esbuild → 1 HTML.
- La pestaña **Counters** actual usa un array **hardcodeado** `ENEMIES[]` con `needs` predefinidos y
  `genCounter()` que llama a `assemble(RD2.R, [], e.needs)`. Es un "tablero meta" fijo, no un scout real.

### ⚠️ Restricción arquitectónica que condiciona esta fase (verificada, NO la re-descubras)
El plan original del ROADMAP decía *"el Worker trae el roster del rival de swgoh.gg"*. **Es inviable:**
Cloudflare bloquea el egress hacia swgoh.gg en dos capas —(1) **fingerprint TLS** que rechaza a Node/undici
con 403 (la API solo pasa desde navegador; el Worker no), y (2) **reputación de IP** que 403ea a las IP de
datacenter (GitHub Actions, Railway, Fly…)—. Es el motivo por el que la ingesta se movió a local (Fase 1.2/1.3).
**Ningún camino automatizado desde infraestructura (Worker, Actions, servidor hosted) llega a swgoh.gg.**
La API key `x-gg-bot-access` **no** lo rescata (si lo hiciera, tu propia ingesta no habría tenido que irse a local).
No construyas ese camino: perderás la sesión contra un 403.

### El desbloqueo real: metadata (kit) ≠ nivel del rival
Ya tenemos `CHARACTERS.json` (333 personajes con `ability_classes`, `categories`, `alignment`, `role`, `image`).
El **kit** de un personaje es **fijo por personaje, no por jugador** → se puede leer la amenaza de cualquier
defensa **sin** el roster en vivo del rival. **Importante y honesto:** esto resuelve la **ELECCIÓN del counter**
(qué equipo llevar) —el 90% del valor y justo lo que el 403 impedía— pero **NO** la **INVERSIÓN real del rival**
(estrellas, gear, reliquia, mods, velocidad, GP), que es específica de su cuenta y no está en la metadata.
El nivel del rival lo ves **en la pantalla del juego** al colocar/atacar; llevarlo a la consola es una
**capa de scoring OPCIONAL** (§5), no un prerrequisito para que el Scout funcione.

---

## OBJETIVO FASE 3

Transformar Counters de "tablero fijo" a **Scout de defensas**:

1. **Constructor de defensa** (modo Scout): el usuario elige **3 o 5** defensores de un datalist **global**
   (todos los personajes del juego, desde la metadata) — tal como ve la defensa en su pantalla de GAC/TW.
2. **Detección de amenazas** (`detectThreats`, puro): lee `ability_classes` + `categories` de cada defensor
   y deriva arquetipos de amenaza (revive, TM-train, contraataque, muro/taunt, buffs, sigilo, control-lock,
   DoT, aislamiento…).
3. **Base curada** `counter_db.json` (~25-30 arquetipos meta, keyed por líder/facción): si la defensa
   coincide con un arquetipo conocido y **poseo** el counter → recomendación curada de alta confianza.
4. **Counter con mi roster en vivo**: traduce amenazas → `needs` y reutiliza `assemble(RD2.R, forced?, needs)`.
   Render con **explicación por amenaza neutralizada** + disclaimer de mods/datacrons.
5. **(Opcional) Nivel real del rival como capa de scoring** — best-effort, solo vía navegador. Ver §5.

El "tablero meta" actual (`ENEMIES[]`) se conserva como **quick-pick secundario** (aditivo, no lo borres).

---

## Prompt inicial para Claude Code

```
Lee ROADMAP.md y PHASE3.md. Ejecuta SOLO la Fase 3.

Estado: read path en prod (Worker read-only + Firestore swgohapi), ingesta local,
72 tests verdes, build esbuild → 1 HTML. Estética INTOCABLE, español, cero secrets.

Restricción crítica (verificada, no la re-descubras): NINGUNA infraestructura (Worker,
Actions, servidor hosted) puede hacer fetch a swgoh.gg — Cloudflare bloquea por fingerprint
TLS y por IP de datacenter; la API key no lo rescata. NO construyas un camino automatizado
"servidor → roster del rival". La Fase 3 se dirige por metadata: usa CHARACTERS.json (kit
fijo por personaje) para leer amenazas de cualquier defensa sin el roster en vivo del rival.
Eso resuelve la ELECCIÓN del counter, no la INVERSIÓN real del rival.

Reglas: motor nuevo PURO y testeable en engine.js; REUTILIZA assemble(), no lo reescribas;
la consola nunca en blanco si falta metadata; la regla de unicidad de GL de assemble() se
mantiene; ediciones quirúrgicas y brace-safe (git restore si algo se rompe); node --check
+ vitest verdes antes de cerrar. counter_db.json es CURADO (no scrapeado): márcalo como tal.
El scoring por nivel real del rival (§5) es OPCIONAL y solo best-effort desde el navegador;
NO toques el Worker para ello y cae siempre a modo manual. Commits atómicos en español.
Tag final: v3-counters.

Empieza mostrándome: (1) el plan de ficheros que tocarás, (2) el esquema exacto de
counter_db.json y la tabla amenaza→need que vas a implementar, para que lo apruebe ANTES
de codificar el motor.
```

---

## PASOS DETALLADOS

### 1. Metadata de personajes disponible en el cliente — `char_meta`
- Fuente: `CHARACTERS.json` (333 chars). Colócalo en el repo (`web/src/data/characters.json`).
- Añade un paso de build que **recorte** a solo los campos necesarios y lo embeba como `CHAR_META`
  (patrón `IMGBYNAME`): por `base_id` → `{ n, a: ability_classes, c: categories, s: alignment→L/D/N, r: role, im }`.
  Trim ≈ 80-120 KB; aceptable (el HTML ya ronda 190 KB) y hace el Scout **offline-safe**.
- En runtime, intenta refrescar desde `GET /api/meta/characters` (ya existe en el Worker) y **cae** a
  `CHAR_META` embebido si falla. Nunca dejes el datalist vacío.
- Para **mis** unidades el kit ya está en `RD` (`a`, `c`); `CHAR_META` cubre los personajes del rival que **no** poseo.

### 2. Base curada de counters — `web/src/data/counter_db.json`
Semilla ~25-30 arquetipos del meta actual (Nightsister/GLLeia, Sith/SEE, First Order/SLKR, Jedi/JMK,
GAS/501st, Bounty Hunters/Jabba, Bad Batch, Iden Empire, Gungans, Inquisitorius…). **Esquema exacto:**

```jsonc
{
  "id": "ns_glleia",
  "label": "Nightsisters (GL Leia lead)",
  "match": {
    "leader": ["GLLEIA"],                          // base_ids que disparan el arquetipo como líder (peso alto)
    "faction": ["Nightsister"],                    // tag presente en ≥ minFaction miembros
    "anyOf": ["MERRIN","GREATMOTHERS","MOTHERTALZIN","MORGANELSBETH","TALIA"],
    "minFaction": 3
  },
  "threats": ["revive","tm_train","plague","counter"],   // amenazas de cabecera (informativas)
  "counters": [                                          // ordenado mejor→ok; base_ids que YO podría tener
    { "team": ["GLREY","HANSOLO","CHEWBACCALEGENDARY","C3POLEGENDARY","..."],
      "note": "Rey ignora el ciclo de revive con burst y Han abre con daño masivo antes de que Talzin plaguee." },
    { "team": ["SITHPALPATINE","..."], "note": "SEE fractura al líder y anula el turno-meter del equipo." }
  ],
  "needs": ["Anti-Revive","Buff Immunity","Remove Turn Meter"], // fallback anti-mecánicas para assemble()
  "confidence": "alto",                                 // alto | medio
  "source": "swgoh.gg/gac/counters (curado manualmente)"
}
```

- **Honestidad:** `source` deja claro que es curado, no scrapeado (no hay pipeline de counters de swgoh.gg).
- El motor usa `counters[]` si **poseo** los base_ids; si no, cae a `needs` + `assemble()`.

### 3. Motor puro en `engine.js` (testeable, sin DOM)

```
detectThreats(defenseUnits, meta) -> Set<threatId>
  // por cada defensor: resuelve su kit (RD si lo tengo, si no CHAR_META) y mapea
  // ability_classes/categories a amenazas según la TABLA (abajo). Union de todos.

threatsToNeeds(threats) -> string[]        // amenaza -> anti-mecánicas (tags de assemble)

matchArchetype(defenseUnits, counterDb) -> entry|null
  // puntúa cada entry: +peso si el líder coincide, +peso por solape faction/anyOf.
  // devuelve el mejor por encima de umbral, o null.

genScout({ defenseIds, roster, meta, counterDb }) -> {
  defense, threats, archetype|null,
  curated: [{team, note, ownedPct}]|[],   // solo si poseo los units del archetype
  heuristic: assemble(roster.R, forcedOwnedFromArchetype, threatsToNeeds(threats)),
  neutralized: [{threat, byUnitIds}], missing: [threatId]
}
```

Reglas del motor:
- **Reutiliza `assemble()`** para el counter heurístico (ya cubre líder, roles, cohesión, `needs`, unicidad de GL).
- El counter **curado** puede fijar como `forced` los units que poseo del `archetype.counters[0].team` y dejar
  que `assemble()` rellene huecos.
- `neutralized`: para cada amenaza detectada, qué unidad(es) de mi equipo la contrarrestan (por tag anti-mecánica).
- Determinista y puro: mismos inputs → mismo output (para tests).

#### Tabla amenaza → señal (kit) → anti-`needs`
| threatId    | Señales en ability_classes / categories                              | Anti-`needs` (para assemble)                          |
|-------------|----------------------------------------------------------------------|-------------------------------------------------------|
| `revive`    | Revive, Anti-Revive (propio)                                         | Anti-Revive, Buff Immunity, Healing Immunity, burst   |
| `tm_train`  | Gain Turn Meter (≥2 units), Bonus Turn, Speed Up                    | Remove Turn Meter, Speed Down, Daze                   |
| `counter`   | Counter, Retribution, Riposte                                       | Stun, Ability Block, Buff Immunity, Daze, AoE-light   |
| `wall`      | Taunt + Protection Up + rol Tank                                    | Defense Down, Armor Shred, Protection Disruption      |
| `buffs`     | Offense Up, Critical Damage Up, Advantage, Tenacity Up             | Buff Immunity, Dispel, Tenacity Down                  |
| `stealth`   | Stealth, Foresight, Evasion Up                                      | Accuracy Up, Expose, AoE, Dispel                      |
| `control`   | Stun, Ability Block, Daze, Fear                                     | Tenacity Up, cleanse/Dispel, +Tenacity               |
| `dot`       | DoT, Burning, Plague, Shock, Blight                                 | Dispel, Healing, Damage Immunity                      |
| `isolate`   | Fracture, Deathmark, Marked, Isolate                               | burst, Protection Up, Tenacity Up                     |
| `plague`    | Plague, Anti-Revive (Nightsister)                                   | Anti-Revive, Buff Immunity, no-morir-en-orden        |

> Mantén la tabla como un objeto de datos (`THREAT_MAP`) para poder ampliarla sin tocar la lógica.

### 4. UI — modo **Scout** dentro de la pestaña Counters (aditivo, estética intocable)
- Sub-toggle en la cabecera de Counters: **Scout** (nuevo, por defecto) · **Tablero meta** (el `ENEMIES[]` actual).
- Constructor de defensa: selector **3v3 / 5v5**, inputs con **datalist global** (reutiliza el patrón de
  `#cq-chardl` de Conquest, pero poblado desde `CHAR_META`/`RD` por nombre), chips de los defensores elegidos,
  botón **⚡ Generar counter**. Avatares vía `portrait()`/CDN como en el resto.
- Salida (reutiliza clases `.simhead`, `.synergy`, `.coverage`, `.simfoot`, `teamRow()`):
  - Cabecera de **amenazas detectadas** (chips) + banda de sinergia del counter.
  - Si hay `archetype`: bloque **"Counter curado"** con la nota y la confianza; si me faltan units, dilo.
  - Bloque **"Counter con tu roster (heurístico)"** = `assemble()`.
  - **Neutralizado**: por amenaza, qué unidad la cubre. **Sin cubrir**: chips gap.
  - `simfoot` con el **disclaimer**: no modela mods/datacrons exactos del rival ni el orden de turnos;
    contrasta con fuentes en vivo. (Igual de honesto que `genCounter` actual.)

### 5. (Opcional) Nivel real del rival — capa de **scoring de viabilidad**
El Scout elige el counter **sin** el nivel del rival (§ contexto). Esta capa **solo** afina la *confianza*
("tu Rey va por encima/por debajo de su inversión"), no la elección. Es un **plus**, no bloquea el Scout.

**Única vía viable: fetch desde el NAVEGADOR (best-effort).** El navegador tiene huella TLS real y pasa el
challenge donde el Worker no. Implementación gated y honesta:
1. **Primero, una sonda de verificación**: un `fetch` de prueba cross-origin a la API pública de swgoh.gg
   para comprobar **CORS** (`Access-Control-Allow-Origin`) **y** que no devuelve el interstitial del challenge
   (HTML en vez de JSON). Enséñame el resultado de la sonda **antes** de construir la UI de esta capa.
2. Si la sonda pasa: input de ally-code del rival + botón "Traer nivel"; normaliza al esquema `RD` en cliente;
   añade badges de estrellas/gear/reliquia/velocidad y un ajuste de confianza al counter propuesto.
3. Si la sonda falla (CORS o challenge): **oculta** la capa y deja el Scout en modo manual, con una nota clara.
- **Cero cambios en el Worker.** Nada de esto persiste en Firestore.

> **Descartado — B (pipeline automatizada paralela a swgoh.gg).** Evaluado y **no es posible**: otro Worker →
> 403 por fingerprint; Actions paralelo o servidor hosted (Railway/Fly) apuntando a swgoh.gg → 403 por IP de
> datacenter; la API key no lo rescata. El único egress que pasa es una IP **residencial** (tu máquina). El
> único camino **automatizado** a datos reales del rival es **Comlink** (fuente distinta: las APIs del juego,
> no swgoh.gg; esquema crudo sin GP/stats calculados; binario self-hosted) → eso es **Fase 6.5**, no se acopla
> aquí. No lo construyas en la Fase 3.

### 6. Tests (vitest) — súmalos a los 72 existentes
- `detectThreats`: defensa NS/GLLeia → incluye `revive`+`tm_train`+`plague`; defensa Jedi/JMK → `counter`+`control`.
- `threatsToNeeds`: mapeo estable y sin duplicados.
- `matchArchetype`: acierta el arquetipo por líder; devuelve `null` bajo umbral.
- `genScout`: forma del objeto, unicidad de GL respetada, `neutralized`/`missing` coherentes, determinista.
- Render real en jsdom del panel Scout (no rompe la estética ni deja el datalist vacío).

---

## DEFINICIÓN DE HECHO (Fase 3)
✓ `node --check` + **todos** los vitest verdes (72 previos + nuevos) ·
✓ Scout genera counter con defensa manual 3 y 5, sin roster del rival ·
✓ counter_db curado con ≥25 arquetipos y `source` honesto ·
✓ Tablero meta previo intacto · estética sin regresiones · consola nunca en blanco ·
✓ (si se implementa §5) la capa de scoring está gated tras la sonda y cae a manual ·
✓ commit(s) atómicos + tag `v3-counters` · nota en `docs/CHANGELOG.md` en español ·
✓ actualizar la fila de Fase 3 en `ROADMAP.md` a ✅.

## TRAMPAS CONOCIDAS (no las repitas)
- ❌ Cualquier infraestructura → swgoh.gg (403 por fingerprint y por IP de datacenter). El Scout **no** depende de fetch en vivo.
- ❌ B: pipeline automatizada paralela (otro Worker / Actions / hosted) para el rival → mismo muro. Descartada. Camino automatizado real = Comlink (Fase 6.5).
- ❌ Vender la metadata como si diera el nivel del rival: da el **kit** (elección), no la **inversión**. El disclaimer es obligatorio.
- ❌ Reescribir `assemble()`. Solo lo **llamas** con `forced`/`needs`.
- ❌ Romper la unicidad de GL (máx. 1 Leyenda por equipo) — ya la garantiza `assemble()`.
- ❌ Dejar el datalist o el panel en blanco si falla `/api/meta/characters` → fallback a `CHAR_META`.
