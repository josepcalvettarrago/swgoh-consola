# FASE 5 — Gremio multiusuario

Diseño de la apertura de la consola al gremio (~50 miembros). Tres sub-fases: **5.1 login + config
remota** (hecha, `v5.1-auth`), **5.2 rosters multi-miembro**, **5.3 panel admin**.

## Flujo de acceso (requisito del usuario)

Para entrar hay que tener **código de invitación** + **nº de gremio** + **código de aliado (ally code)**,
y cada miembro **genera su propia contraseña**. Sin emails.

```
Registrarse: [invitación] [nº gremio] [ally] [contraseña ×2]  →  cuenta + sesión
Entrar:      [ally] [contraseña]                              →  sesión (JWT, 30 días)
```

## Decisión: auth propio en el Worker (NO Firebase Auth)

El roadmap original decía "Firebase Auth". Se descartó conscientemente:

| | Firebase Auth | Auth propio en el Worker (elegido) |
|---|---|---|
| Email | obligatorio (o email sintético hack) | no hace falta |
| Bundle | +~100 KB de SDK en el HTML único | 0 KB (fetch normal) |
| Reset de contraseña | roto sin email real | admin borra la cuenta → re-registro |
| Reglas Firestore | por-usuario | sigue **deny-all**; todo pasa por el Worker |
| Coste | otra dependencia | ~200 líneas auditables (`worker/src/auth.js`) |

## Fase 5.1 — implementada

### Criptografía (worker/src/auth.js, Web Crypto puro)
- **Contraseñas e invitación:** PBKDF2-SHA256, 100.000 iteraciones, salt aleatorio de 16 bytes por
  registro. En Firestore solo `{ hash, salt, iters }` en base64url — **nada en claro**.
- **Sesión:** JWT **HS256** firmado con el secret del Worker `AUTH_SECRET`
  (`wrangler secret put AUTH_SECRET`; en local `.dev.vars`). Claims `{ sub: ally, gid, adm, name, iat,
  exp }`, TTL 30 días. Verificación con `crypto.subtle.verify` (tiempo constante).
- Los handlers reciben la capa Firestore **inyectada** (`db = { getDoc, setDoc, deleteDoc }`) →
  testeables en memoria sin red (tests/worker-auth.test.js).

### Modelo de datos (Firestore, base `swgohapi`)
```
auth/{guildId}            { inviteHash, inviteSalt, inviteIters, rotatedAt }
users/{ally}              { ally, guildId, name, passHash, salt, iters, role, createdAt }
users/{ally}/data/config  { config: JSON(8 claves), updatedAt(ms cliente), savedAt(ISO servidor) }
```
- `role`: `"admin"` si el ally es `env.ADMIN_ALLY` (wrangler.toml), si no `"member"`.
- El **reset** (admin borra `users/{ally}`) NO borra la subcolección → el miembro conserva su config
  al re-registrarse (intencionado).

### Reglas de registro (todas se comprueban en el Worker)
1. El gremio existe (`guild/{guildId}` de la ingesta).
2. La invitación coincide con el hash de `auth/{guildId}`.
   **Bootstrap:** si no hay invitación activa, solo puede registrarse `ADMIN_ALLY` (después la rota).
3. El ally está en la **lista real de miembros** (`guild.members[]` — la ingesta es la fuente de verdad).
4. No existe `users/{ally}` (si existe → 409, "pide al admin un reset").
5. Contraseña ≥ 8 caracteres.

### Endpoints (worker/src/index.js)
| Método/ruta | Auth | Hace |
|---|---|---|
| `POST /api/auth/register` | invitación | crea cuenta + devuelve JWT |
| `POST /api/auth/login` | — | 401 **genérico** + retardo fijo si falla |
| `GET /api/me` | Bearer | claims verificadas por el servidor |
| `GET /api/config` | Bearer | config remota del usuario |
| `PUT /api/config` | Bearer | guarda (whitelist de 8 claves, ≤32 KB) |
| `POST /api/admin/invite` | Bearer adm | **rota** el código de invitación |
| `DELETE /api/admin/users/:ally` | Bearer adm | **reset** de cuenta |

Los endpoints de lectura de datos de juego siguen públicos en 5.1 (solo existen los datos de Yusepi);
en 5.2 pasan a Bearer. CORS: `GET, POST, PUT, DELETE` + header `authorization`.

### Cliente (HTML único, estética intocable)
- **Overlay `#login`** (index.template.html): Entrar / Registrarse + enlace **"ver demo"** → consola con
  los datos embebidos de Yusepi y banner honesto (nunca en blanco, y el HTML sigue siendo compartible).
- `web/src/auth.js` (puro, `fetchImpl` inyectable, nunca lanza): `loginUser/registerUser/fetchMe/
  pullConfig/pushConfig/rotateInvite/resetUser` + `parseToken` (el cliente solo decodifica claims/exp;
  la firma la verifica el Worker en cada petición).
- **Sesión** en `store.js` (`swgoh.auth.session`); chip en la cabecera con "salir" (borra sesión y recarga).
- **Sync de config** (main.js `syncConfig` + `onConfigChange` de store.js): al entrar, pull →
  **last-write-wins** por `updatedAt`; después cada `save*` dispara un push **debounced** (~2 s).
  localStorage queda de **caché offline** — sin sesión o sin red todo funciona como hasta ahora.
- **Honestidad:** si el miembro autenticado no tiene roster ingestado (todos menos Yusepi en 5.1), banner
  "tu roster llega en la Fase 5.2 — viendo datos de demostración". Nunca se finge que el embebido es suyo.

### Limitaciones conocidas (documentadas, no ocultas)
- **Sin rate-limit real por IP** (el Worker no usa KV/DO): mitigación = 401 genérico + retardo fijo +
  PBKDF2 caro. Endurecer en Fase 6 (KV counter o Turnstile).
- **Sin auto-reset de contraseña** (no hay email): el admin borra la cuenta y el miembro se re-registra
  con la invitación vigente.
- La invitación es **una por gremio**: si se filtra, el admin la rota (`POST /api/admin/invite`); las
  sesiones y cuentas existentes no se ven afectadas.
- Verificación **jsdom + tests con Firestore en memoria**: falta probar el Worker desplegado
  (`wrangler dev`/prod con `AUTH_SECRET`) y navegador real.

### Despliegue (cuando haya permiso)
1. `wrangler secret put AUTH_SECRET` (cadena aleatoria larga; también en `.dev.vars` local).
2. `wrangler deploy` (sube `ADMIN_ALLY` de wrangler.toml).
3. Yusepi se registra (bootstrap, sin invitación) → `POST /api/admin/invite` con el código a repartir.
4. Publicar el HTML nuevo (Pages). `PAGES_ORIGIN` al dominio definitivo cuando exista.

## Fase 5.2 — rosters multi-miembro — IMPLEMENTADA (`v5.2-guild-rosters`)
- **`scripts/ingest-guild.mjs`** (script aparte; `ingest.mjs` intacto para Yusepi): lee
  `guild/{id}.members[]` (ya escrito por la ingesta de Yusepi) y baja el roster de cada miembro a
  `players/{ally}` (solo `rd`+meta). Núcleo **`ingestGuild(env, deps, opts)`** con red y Firestore
  **inyectados** → testeable sin tocar swgoh.gg. Flags `--dry`/`--limit`/`--only`; salta miembros con
  perfil privado/404 sin abortar; cuenta `ok`/`fallidos`/`saltados`. Corre en local
  (`scripts/ingest-guild-local.ps1`, IP residencial, tarea programada aparte, DESPUÉS de la de Yusepi).
- **`scripts/gg-fetch.mjs`** (nuevo): el cliente curl anti-fingerprint (JA3) extraído de `ingest.mjs`,
  compartido por ambas ingestas (comportamiento idéntico; los flujos de Yusepi no cambian).
- **Worker** (`worker/src/index.js`): las 5 lecturas por-jugador (`roster/progress/snapshots/mods/fleet`)
  y `guild` exigen **Bearer** antes de tocar Firestore; helper puro **`canReadAlly(claims, ally)`** en
  `auth.js` (solo tu ally, o cualquiera si `adm:1`) → 403 si no; 401 sin sesión. `meta/characters` sigue
  público. CORS ya lo permitía (5.1).
- **Cliente** (`web/src/main.js`): los loaders aceptan `token` y mandan `Authorization: Bearer`;
  `startConsole(session)` baja el roster **del propio ally**. Sin ingestar aún → embebido + banner
  honesto. Demo (sin sesión) = embebido, sin pedir datos por-jugador (no expone Firestore).
- Solo `players/{ally}` por miembro: **mods/naves/snapshots/progreso siguen siendo de Yusepi** (coste/
  tiempo) → esas pestañas del miembro caen a embebido con banner honesto. Presupuesto Firestore holgado
  (~50 × ~200 KB ≪ 1 GB free tier). **286 tests.**
- **Pendiente:** correr la ingesta real de los 50 (IP residencial) y `PAGES_ORIGIN` definitivo cuando
  haya dominio de Pages. Ver `DEBTS.md`.

## Fase 5.3 — panel admin — IMPLEMENTADA (`v5.3-admin`)
- **Pestaña 12 "Gremio"** (`#p-admin`), botón nav `hidden` por defecto y desocultado solo si
  `session.role==="admin"` (`web/src/ui.js`, tras el bloque de sesión). Defensa en profundidad: el Worker
  ya exige `adm:1` en `/api/admin/*`.
- **`GET /api/admin/overview`** (`handleAdminOverview` en `worker/src/auth.js`, puro): cruza en el Worker
  `guild/{gid}.members` × `users` (registrados, filtrados por `guildId`) × `players` (ingestados) → una
  sola respuesta `{ guild, stats, rows }`. **Nunca** devuelve `passHash`/`salt`. `listDocs` añadido a la
  capa `db` inyectada en `index.js`.
- **UI** (`renderAdmin`): stats (registrados/con-roster) + tabla de los ~50 reusando `guildRanking` +
  markup `pg-grow`/`gr-*`; badges registrado/pendiente y roster ✓/sin roster; **Resetear** por fila
  (con `window.confirm`) y card de **invitación** (el admin escribe el código nuevo → **Rotar**). Cliente
  `fetchAdminOverview` en `web/src/auth.js`; `adminApi` ligado en `main.js` solo para admin.
- **Diferido a Fase 6:** drill-down del roster por miembro y "TW readiness" por jugador (mal definida/cara).
- **286 → 299 tests.** Pendiente: probar el ciclo admin real contra el Worker desplegado (`DEBTS.md`).

## Nota de seguridad verificada (Fase 5.1)
El JSON del service account que vive en `firebase/` **nunca estuvo commiteado** (untracked; `.gitignore`
ya cubría `firebase/*adminsdk*.json`; `git log --all` vacío para esa ruta). No hizo falta rotación.
Secrets del Worker: `FIREBASE_SERVICE_ACCOUNT` + `AUTH_SECRET`, solo vía `wrangler secret` / `.dev.vars`.
