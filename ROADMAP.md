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

## ESTADO ACTUAL (2026-07-09)

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
| 4 · 5 · 6 · 6.5 | ⬜ Pendientes | — | — |

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

## FASE 4 — Módulos de valor (1 sesión c/u, orden por impacto)
- **Datacrones + auditoría de mods** completa (swgoh.gg da inventario de crons y eficiencia por tirada — *exclusivo de esta fuente*) + **export a Grandivory Mod Optimizer**.
- **Planificador de energía diaria** hacia Lord Vader (nodos + ETA por unidad).
- **Fleet Arena module** (tu gremio es fuerte en flota: vía fácil de cristales).
- **Simulador defensivo de TW** (con datos del gremio).

## FASE 5 — Gremio multi-usuario (3-4 sesiones)
- **Firebase Auth** para el login del gremio (esto es lo que Firebase te ahorra construir).
- Colección `players` en Firestore; alta por ally code con enlace-invitación.
- Cada miembro ve **SU** consola: los motores ya son agnósticos del roster (solo cambia `RD`).
- Panel admin para Yusepi: estado de los 50, TW readiness, ranking.
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
