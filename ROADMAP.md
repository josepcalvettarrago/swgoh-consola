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
- Estado actual: 7 tabs funcionales (Mods, Lord Vader roadmap, GLs, Counters, Roster, Conquest, Mejoras). Motor de sinergias `assemble()` compartido entre Counters y Conquest. Avatares vía CDN de swgoh.gg en todas las tabs.
- Datos actuales: JSON estáticos **embebidos** en el HTML (`RD` = roster 298 chars, `DATA` = plan/mods/gremio, `IMGBYNAME` = 333 imágenes). Provienen de swgoh.gg — el esquema ya encaja con su API.

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
| API / cron | **Cloudflare Worker** | llama a `api.swgoh.gg`, normaliza, escribe en Firestore; cron cada 6-12 h (respeta rate limit 1/seg) |
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

## FASE 0 — Repo y estructura (1 sesión) — EMPEZAMOS AQUÍ
Ver `PHASE0.md` para el paso a paso detallado. Resumen:
- Repo GitHub privado `swgoh-consola`.
- Estructura: `/web` (HTML + assets), `/worker` (Cloudflare Worker, preparado para credenciales swgoh.gg y Firebase), `/firebase` (config + reglas Firestore), `/scripts` (parsers Python/Node existentes), `/tests`, `/docs`.
- Extraer el JS embebido a módulos (`data.js`, `engine.js`, `ui.js`) con build trivial (esbuild) que **siga produciendo UN SOLO HTML final**.
- Suite **vitest** para `assemble()`, `cqRun`, `genCounter` (regresión antes de tocar nada).
- **Definición de hecho:** el HTML resultante renderiza idéntico al actual; tests verdes; deploy de prueba en Cloudflare Pages.

## FASE 1 — Pipeline de datos vía swgoh.gg (1-2 sesiones) — más simple ahora
- **Sin infra extra.** Cloudflare Worker con **cron (cada 6-12 h)**: llama a `api.swgoh.gg/player/{allyCode}` y `/guild/{id}` con header `x-gg-bot-access` → normalizar al esquema `RD` `{i,n,s,r,c,a,t,g,rl,p,gl,ld,im}` → escribir en **Firestore** (colecciones: `players`, `snapshots`, `guild`).
- Respetar rate limit ~1 req/seg (encolar las llamadas del gremio; no en paralelo).
- Endpoints del Worker: `/api/roster/:ally`, `/api/guild/:id`, `/api/meta/characters`.
- El HTML pasa de `RD` embebido a `fetch()` con **fallback** al embebido si no hay red.

## FASE 2 — Diff engine + tracker (1-2 sesiones)
- Cada snapshot calcula diff vs anterior: relics subidos, gear, GP, mods nivelados, rango de arena.
- Nueva tab **"Progreso"**: línea temporal de snapshots, fases del roadmap Vader **auto-marcadas**, comparativa con los 49 del gremio.

## FASE 3 — Advanced Counter Generator GAC 3v3/5v5 (2-3 sesiones) ⭐ GAMECHANGER
- Input: ally code del rival → Worker trae su roster de swgoh.gg → `RD_ENEMY` (mismo esquema).
- UI: selector de la defensa del rival (**3 o 5** chars, datalist como Conquest).
- Motor: leer el kit real de la defensa (`ability_classes` + factions) → detectar amenazas (revive, TM-train, contraataque, buffs, sigilo…) → cruzar con **base curada** `/data/counter_db.json` (~30 arquetipos meta; fuente swgoh.gg/gac/counters) → proponer **mi mejor counter** con explicación por amenaza neutralizada.
- **Disclaimer visible:** no modela los mods/datacrons exactos del rival (limitación de datos públicos).

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
