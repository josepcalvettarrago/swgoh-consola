# FASE 0.1 (hotfix) + FASE 1 — Pipeline de datos swgoh.gg
### Guía y prompts para Claude Code

> Idioma de commits, docs y UI: **español**. Estética: **intocable**. Fuente de datos: **swgoh.gg API**.
> Regla de oro: cada paso deja el proyecto funcional, con tests verdes y sin secrets en el repo.

---

## ⚠️ FASE 0.1 — HOTFIX: máximo una Leyenda Galáctica por equipo

**Problema:** `assemble()` (en `engine.js`) puede devolver equipos con más de una unidad `gl:1`, tanto en Counters como en Conquest. En el juego es imposible: solo puede haber **una** Leyenda Galáctica por escuadrón.

### Prompt para Claude Code

```
Bug en engine.js: assemble() permite más de una Leyenda Galáctica (unidades con gl:1)
en el mismo equipo de 5. Eso es imposible en el juego. Corrígelo respetando estas reglas:

1. Un equipo (líder + miembros) NUNCA puede tener más de una unidad con gl:1.
2. Lógica de la corrección dentro de assemble():
   - Si el líder elegido es GL (gl:1), excluye del pool de candidatos TODAS las demás
     unidades gl:1 antes de rellenar el equipo.
   - Si el líder no es GL, al rellenar: en cuanto añadas una unidad gl:1, marca un flag
     y descarta el resto de gl:1 para los huecos siguientes.
   - Aplica lo mismo al cálculo de subs/banquillo si procede (que no propongan una 2ª GL
     como suplente si ya hay una en el equipo).
3. No cambies el resto de la heurística (KEYMECH, power, cohesión de facción, roles).
   Solo añade la restricción de unicidad de GL.

Añade un test permanente en tests/engine.test.js:
   - Para varios inputs (incluyendo pools ricos en GLs), assemble() nunca devuelve un
     equipo con más de una unidad gl:1. Verifícalo sobre líder + miembros + subs.

Valida con npm test (deben seguir verdes los 8 anteriores + el nuevo).
Commit en español y tag v0.1-hotfix-gl.
```

**Criterio de hecho 0.1:** test de unicidad GL verde · `npm test` todo verde · commit + tag `v0.1-hotfix-gl` · entrada en `docs/CHANGELOG.md`.

---

## FASE 1 — Pipeline de datos vía swgoh.gg

Objetivo: que el roster deje de estar embebido y venga en vivo de swgoh.gg a través de un
Cloudflare Worker que normaliza y persiste en Firestore, **manteniendo el embebido como fallback**.

### Prompt inicial para Claude Code

```
Lee ROADMAP.md y PHASE1.md. Ejecuta SOLO la Fase 1 (el hotfix 0.1 ya está hecho).

Stack: Cloudflare Worker (+cron) + Firebase Firestore. Fuente: swgoh.gg API.
Mi ally code: 355463284. Gremio: "Catalonian Republic".

ANTES de escribir el normalizador, haz una llamada real a la API y enséñame la FORMA
del JSON de un jugador y del endpoint de personajes. No inventes nombres de campos:
trabaja contra la respuesta real. Propón el mapeo campo-a-campo y espera mi OK antes
de codificar el normalizador.

Reglas:
- Respeta el rate limit (~1 req/seg con la API key): encola, no lances en paralelo.
- El HTML debe seguir funcionando aunque la API falle (fallback al RD embebido).
- Ningún secret en el repo. Usa wrangler secret.
- No toques la estética ni la lógica de negocio de la UI. Solo cambia el ORIGEN de los datos.
- Commits atómicos en español.
```

### Pasos detallados

**1. Verificar la forma real de la API (primero, sin código de producción)**
- Endpoints a confirmar (la doc pública está en `api.swgoh.gg`):
  - Jugador: `player/{allyCode}` — roster del jugador con estrellas/gear/relic/power por unidad.
  - Gremio: `guild/{guildId}` (o vía el perfil del jugador para obtener el guild id).
  - Personajes (metadata): `characters` — alignment, role, categories, ability_classes, image. **No requiere ally code.**
- Auth: header `x-gg-bot-access: <SWGOH_GG_API_KEY>`, límite ~1 req/seg.
- Guarda una respuesta de ejemplo en `tests/fixtures/` para los tests del normalizador.

**2. El normalizador (clave — reutiliza la lógica de `scripts/`)**
- El export de jugador de swgoh.gg **no trae facción/side/role**: hay que **unir** cada unidad del jugador con la metadata de `characters` por `base_id`. Descarga `characters` una vez y cachéala.
- Mapeo al esquema `RD` `{i,n,s,r,c,a,t,g,rl,p,gl,ld,im}`:

  | Campo RD | Origen | Nota |
  |---|---|---|
  | `i` | base_id | clave de unión |
  | `n` | name (metadata) | |
  | `s` | alignment → L/D/N | Light/Dark/Neutral |
  | `r` | role (metadata) | |
  | `c` | categories (metadata) | array |
  | `a` | ability_classes (metadata) | array |
  | `t` | rarity/stars (jugador) | |
  | `g` | gear_level (jugador) | |
  | `rl` | relic_tier (jugador) | **⚠️ verificar offset**: swgoh.gg suele almacenar `relic_tier` con desfase (R mostrado ≈ relic_tier − 2). **Reproduce exactamente lo que hacía el parser de `scripts/`** para que RD quede idéntico. |
  | `p` | power (jugador) | |
  | `gl` | categories incluye "Galactic Legend" → 1 | |
  | `ld` | misma derivación que el parser actual | leader |
  | `im` | image (metadata) → slug | extraer slug de la URL del CDN |

- **Test obligatorio:** con la fixture guardada, el normalizador produce entradas RD con la MISMA forma que `data/roster.js` actual (mismos campos, mismos tipos, relic con el mismo criterio).

**3. Firestore — esquema**
- `players/{allyCode}`: último RD normalizado + meta (nombre, GP, rango de arena, `updatedAt`).
- `snapshots/{allyCode}/history/{timestamp}`: copia puntual para el diff engine de la Fase 2.
- `guild/{guildId}`: lista de miembros + resumen.
- Acceso Worker→Firestore vía **Firestore REST API** con service account (firmar JWT → access token). El JSON del service account va como `wrangler secret` (`FIREBASE_SERVICE_ACCOUNT`).

**4. Worker — rutas y cron**
- `GET /api/roster/:ally` → `players/{ally}` desde Firestore.
- `GET /api/guild/:id` → `guild/{id}`.
- `GET /api/meta/characters` → metadata cacheada.
- Handler `scheduled` (cron cada 6–12 h): refresca a Yusepi + gremio, **encolando** las llamadas a 1 req/seg.
- CORS abierto solo al dominio de Pages.

**5. Frontend — fetch con fallback**
- En `main.js`/`ui.js`, al iniciar: intenta `fetch(${API_BASE}/api/roster/355463284)`.
  - Éxito → usa esa respuesta como `RD` y sigue el flujo normal (los motores ya son agnósticos del roster).
  - Fallo/red caída → usa el `RD` embebido del bundle. La consola nunca se queda en blanco.
- `API_BASE` como constante configurable (o var de build). Mantener el embebido en el bundle como red de seguridad.
- **Test:** simulando `fetch` que falla, la app cae al RD embebido sin romperse.

**6. Secrets (nunca en git)**
```
wrangler secret put SWGOH_GG_API_KEY
wrangler secret put FIREBASE_SERVICE_ACCOUNT   # JSON del service account, en una línea
```
- `.dev.vars` local para desarrollo, ya está en `.gitignore`.

### Definición de hecho (Fase 1)
- [ ] Mapeo campo-a-campo aprobado antes de codificar el normalizador.
- [ ] Worker despliega; el cron escribe el snapshot de Yusepi en Firestore.
- [ ] `GET /api/roster/355463284` devuelve un RD válido y con la forma correcta (relic incluido).
- [ ] El HTML carga datos en vivo **y** conserva el fallback embebido (probado con red caída).
- [ ] Rate limit respetado (llamadas del gremio encoladas a ~1/seg).
- [ ] `npm test` verde (normalizador + fallback + los previos).
- [ ] Cero secrets en el repo.
- [ ] Commit + tag `v1-pipeline` · entrada en `docs/CHANGELOG.md` en español.

### Qué NO hacer en Fase 1
- No lanzar las 50 llamadas del gremio en paralelo (romperías el rate limit).
- No tocar estética, textos ni lógica de la UI: solo cambia el ORIGEN de los datos.
- No eliminar el RD embebido: es el fallback.
- No hardcodear API keys ni el service account.
- No meter todavía Auth ni multiusuario (eso es Fase 5).

---

## Modelo recomendado
- **Arranque + diseño del normalizador y del esquema Firestore:** Opus, effort alto.
- **Implementación del Worker, rutas, fetch-fallback y tests:** Sonnet, effort medio.
