# Deuda técnica — SWGOH Consola

Cosas verificadas parcialmente o pospuestas a propósito. Cada entrada dice **qué falta**, **por qué**
y **cómo saldarla**. No es el ROADMAP (fases futuras) — son cabos de fases ya "hechas".

---

## D1 · Probar el Worker de auth desplegado (Fase 5.1)
**Estado:** pendiente · **Origen:** `v5.1-auth`

La 5.1 (auth propio: PBKDF2 + JWT) está verificada **solo con jsdom + Firestore en memoria** (270 tests).
No se ha ejecutado nunca contra el Worker real ni en navegador.

**Cómo saldarla (local, IP residencial):**
1. Poner el secret nuevo: crear `worker/.dev.vars` con `AUTH_SECRET=<cadena aleatoria larga>` y
   `FIREBASE_SERVICE_ACCOUNT=<json en una línea>` (o `wrangler secret put AUTH_SECRET` para prod).
2. `cd worker && wrangler dev`.
3. **Bootstrap admin** (sin invitación, solo `ADMIN_ALLY`=355463284):
   `POST /api/auth/register {ally:"355463284", password:"…", guildId:"U6tWH0WuSDyl_g7lmgZm-w", invite:""}`
   → debe devolver token con `role:"admin"`.
4. Recorrer el ciclo con `curl` (Bearer del token): `GET /api/me`, `PUT`/`GET /api/config`,
   `POST /api/admin/invite {invite:"…"}`, registrar un segundo ally con esa invitación,
   `DELETE /api/admin/users/{ally}` (reset), re-login.
5. **Navegador real:** servir el HTML apuntando `API_BASE` al `wrangler dev`, comprobar overlay de login,
   "ver demo", persistencia de sesión y **sync de config** (cambiar energía/objetivo → recargar → se
   mantiene desde Firestore).
6. **Ciclo admin (Fase 5.3):** con la sesión admin, abrir la pestaña **"Gremio"** y verificar que
   `GET /api/admin/overview` puebla la tabla (registrado/roster), que **Rotar invitación** cambia el código
   (registrar un ally con el nuevo, fallar con el viejo) y que **Resetear** borra la cuenta.

**Definición de saldada:** el ciclo completo (auth + admin) funciona contra `wrangler dev` y el navegador;
anotar en `docs/CHANGELOG.md` que la Fase 5 quedó verificada end-to-end.

---

## D2 · Rate-limit por IP en el Worker (Fase 5.1)
**Estado:** pendiente · **Origen:** `v5.1-auth`

`POST /api/auth/login` solo se protege con 401 genérico + retardo fijo + PBKDF2 caro. **No hay límite por
IP** (el Worker no usa KV/Durable Objects). Un atacante puede probar contraseñas en paralelo.

**Cómo saldarla:** contador en KV por IP (o Cloudflare Turnstile en el formulario de login). Encaja en la
Fase 6 (pulido). Hasta entonces, mitigado por el coste de PBKDF2 (100k iteraciones) y contraseñas ≥ 8.

---

## D3 · Verificación en navegador real de la Fase 4 (Ascensión/GL/Mejoras/Datacrons/Flota/TW)
**Estado:** pendiente · **Origen:** Fase 4 (4.1–4.7)

Toda la Fase 4 está verificada con jsdom (render tests), **nunca en un navegador real**. Falta un repaso
visual de las pestañas nuevas (estética, anillos, meters, reordenar tiers, editor de plan).

**Cómo saldarla:** abrir `web/dist/SWGOH_Consola_Yusepi.html` en Chrome/Firefox y recorrer las 12 pestañas.

---

## D5 · Detalle por miembro y TW readiness en el panel admin (Fase 5.3)
**Estado:** diferido a Fase 6 · **Origen:** `v5.3-admin`

El panel "Gremio" muestra estado (registrado/roster) + ranking por GP, pero **no** deja pinchar a un
miembro para ver su roster/GL, ni calcula "readiness de TW" por jugador.

**Cómo saldarla:** con los rosters ya en `players/{ally}` (Fase 5.2) y `canReadAlly` (admin lee cualquiera),
añadir un drill-down que haga `GET /api/roster/{ally}` bajo demanda y muestre GL/GP/unidades clave; y una
métrica de readiness (p. ej. nº de squads de defensa montables con `planTWDefense` sobre su roster). No
había función de readiness de gremio (habría que crearla).
