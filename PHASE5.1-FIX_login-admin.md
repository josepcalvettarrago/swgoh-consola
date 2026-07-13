# FASE 5.1 — FIX: login compacto + datos maestros de admin

> Handoff para Claude Code. Dos objetivos independientes en la misma sesión:
> **A)** rediseñar el overlay de acceso `#login` (hoy inusable: campos gigantes, formularios apilados).
> **B)** dejar a mano las **credenciales/procedimientos maestros de administrador** (el admin no recuerda su acceso).
>
> Regla de oro del proyecto: **inspecciona antes de tocar, no inventes firmas ni IDs.** Edición quirúrgica
> (mínima, con `git restore` de red de seguridad). No toques la estética holotable/Sith ni el idioma español.

---

## 0. Reconocimiento (obligatorio antes de escribir código)

Localiza y **lee** las piezas reales antes de nada. No asumas nombres:

```
grep -rn "id=\"login\"\|#login" web/src/            # overlay de acceso
sed -n '/:root/,/}/p' web/src/index.template.html   # nombres REALES de variables CSS (--bg, --cyan, --line, --txt…)
grep -rn "Código de invitación\|Repite la contraseña\|N.º de gremio\|Entrar\|Registrarse\|ver demo" web/src/
grep -rn "registerUser\|loginUser" web/src/auth.js  # firmas cliente (campos que espera cada llamada)
grep -n "ADMIN_ALLY\|GUILD_ID\|AUTH_SECRET" worker/wrangler.toml
```

Apunta y respeta: los **IDs reales** de cada input (p. ej. `#lg-ally`, `#rg-invite`…), los **nombres reales**
de las variables CSS del `:root`, y las **firmas** de `registerUser/loginUser` (qué claves de objeto esperan).
El CSS de más abajo es **referencia**: mapea sus `var(--…)` a los nombres que existan de verdad.

---

## PARTE A — Login compacto (el problema visible)

### Diagnóstico esperado
Los inputs se ven de ~150–180 px de alto y los dos formularios (Entrar + Registrarse) están **apilados** en una
columna de >1000 px. Causa casi segura: el overlay es un contenedor a pantalla completa (`height:100vh` /
`flex-direction:column`) y los campos **no tienen `height` propio** → se estiran para rellenar, o heredan
`flex:1`/`align-items:stretch`. Confírmalo en el CSS real antes de aplicar el fix.

### Objetivo de diseño
Un **modal único centrado** (no una columna a pantalla completa) con **dos pestañas** *Entrar* / *Registrarse*:
solo se muestra el formulario activo. Campos de altura fija. Debe caber sin scroll en un móvil de 380 px de ancho
y en desktop; el de *Registrarse* (5 campos) puede tener scroll interno si hace falta, nunca la página entera.

Estructura objetivo (adáptala a los IDs/markup reales; **no** rehagas la lógica JS de auth, solo el layout/CSS y,
si hace falta, el mínimo markup para las pestañas):

```
#login  (overlay: fixed inset:0, fondo oscuro + blur, place-items:center)
└─ .lg-card  (modal, width:min(92vw,420px), borde cyan tenue, radius, sombra/resplandor)
   ├─ .lg-head    → título "SWGOH · Consola" + subtítulo pequeño ("Acceso al gremio")
   ├─ .lg-tabs    → [ Entrar ] [ Registrarse ]   (toggle; el activo con subrayado/acento cyan)
   ├─ form#lg-in  (Entrar)      : Código de aliado · Contraseña · botón "Entrar"
   ├─ form#lg-up  (Registrarse) : Invitación · Nº de gremio · Ally · Contraseña · Repite · botón "Crear cuenta"
   ├─ .lg-msg     → línea de estado/error (una sola, reutilizable)
   └─ .lg-foot    → enlace "ver demo →" (mantiene el comportamiento actual)
```

### CSS de referencia (usa las variables REALES del `:root`; ajusta nombres)

```css
#login{position:fixed;inset:0;z-index:100;display:grid;place-items:center;
  background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(6px);
  padding:24px;overflow:auto}
.lg-card{width:min(92vw,420px);max-height:calc(100dvh - 48px);overflow:auto;
  background:linear-gradient(180deg,color-mix(in srgb,var(--panel,#0b1622) 92%,transparent),var(--panel,#0b1622));
  border:1px solid color-mix(in srgb,var(--cyan) 45%,transparent);border-radius:14px;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--cyan) 12%,transparent),0 18px 60px rgba(0,0,0,.55),
             0 0 40px color-mix(in srgb,var(--cyan) 10%,transparent);
  padding:22px 22px 18px}
.lg-head{margin-bottom:14px}
.lg-head h2{margin:0;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan)}
.lg-head p{margin:4px 0 0;font-size:12px;color:var(--muted,#7d93a8)}
.lg-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;
  border-bottom:1px solid color-mix(in srgb,var(--cyan) 18%,transparent)}
.lg-tabs button{appearance:none;background:none;border:0;cursor:pointer;padding:9px 0;
  font:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted,#7d93a8);border-bottom:2px solid transparent;transition:.18s}
.lg-tabs button[aria-selected="true"]{color:var(--cyan);border-bottom-color:var(--cyan)}
/* CLAVE del fix: campos con altura fija, sin flex-grow, box-sizing correcto */
#login .fld{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
#login label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#7d93a8)}
#login input{box-sizing:border-box;height:44px;flex:0 0 auto;width:100%;
  padding:0 13px;font:inherit;font-size:14px;color:var(--txt,#dfe9f2);
  background:color-mix(in srgb,var(--bg) 60%,#000 10%);
  border:1px solid color-mix(in srgb,var(--cyan) 22%,transparent);border-radius:8px;
  transition:border-color .15s,box-shadow .15s}
#login input::placeholder{color:color-mix(in srgb,var(--muted,#7d93a8) 70%,transparent)}
#login input:focus{outline:0;border-color:var(--cyan);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--cyan) 16%,transparent)}
#login .btn-primary{width:100%;height:46px;margin-top:4px;cursor:pointer;
  font:inherit;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--bg);
  background:linear-gradient(180deg,color-mix(in srgb,var(--cyan) 92%,#fff 8%),var(--cyan));
  border:0;border-radius:8px;transition:filter .15s}
.lg-card .btn-primary:hover{filter:brightness(1.08)}
.lg-card .btn-primary:disabled{filter:grayscale(.5) brightness(.7);cursor:not-allowed}
.lg-msg{min-height:16px;margin-top:10px;font-size:12px;text-align:center;color:var(--muted,#7d93a8)}
.lg-msg.err{color:var(--danger,#ff6b6b)}
.lg-msg.ok{color:var(--cyan)}
.lg-foot{margin-top:14px;text-align:center}
.lg-foot a{font-size:12px;color:var(--muted,#7d93a8);text-decoration:none;border-bottom:1px dotted}
.lg-foot a:hover{color:var(--cyan)}
[hidden]{display:none!important}
```

### Comportamiento (JS mínimo, no reescribas la auth)
- Toggle de pestañas: alterna `hidden` entre `#lg-in`/`#lg-up` y `aria-selected` en los botones. Por defecto *Entrar*.
- **Enter** envía el formulario visible. El botón pasa a `disabled` + texto "Entrando…/Creando…" durante la llamada.
- Validación inline barata en *Registrarse*: contraseña ≥ 8 y "Repite" coincide → si no, `.lg-msg.err` y no llames al Worker.
- Errores del Worker (401/409/…): muéstralos en `.lg-msg.err` con el texto que ya devuelve la API (mantén el 401 genérico).
- **No** cambies `web/src/auth.js` ni los endpoints. Solo layout, estados y, como mucho, wiring de las pestañas.
- El campo **Invitación** del registro debe poder enviarse **vacío** (lo necesita el bootstrap del admin, ver Parte B).
  Si hoy es `required`, quítalo; el Worker ya decide (bootstrap si no hay invitación activa y el ally es `ADMIN_ALLY`).

---

## PARTE B — Datos maestros de administrador

Contexto real (de `PHASE5.md`, auth propio en el Worker, **no** Firebase Auth): el admin **no tiene** una
contraseña "de fábrica". El admin es quien tenga el ally `ADMIN_ALLY` (debe ser **355463284**, Yusepi). Ese ally
puede **registrarse sin invitación** (bootstrap) y ahí **elige su contraseña**. No hay reset por email: el "reset"
es borrar `users/{ally}` (la subcolección `data/config` se conserva).

### B.1 — Verificar estado (no cambies nada aún, solo reporta)
```
grep -n "ADMIN_ALLY\|GUILD_ID" worker/wrangler.toml     # ¿ADMIN_ALLY == 355463284? ¿GUILD_ID real?
```
- Confirma `ADMIN_ALLY = "355463284"`. Si no lo es, **corrígelo** en `wrangler.toml` (y anótalo como cambio a desplegar).
- `AUTH_SECRET` es un secret: no se ve en el toml. Deja instrucción para que el usuario compruebe con
  `wrangler secret list` (debe aparecer `AUTH_SECRET`; si no, `wrangler secret put AUTH_SECRET` con cadena larga aleatoria).
- ¿Existe ya `users/355463284` en Firestore (base `swgohapi`)? No tienes red hacia Firestore desde aquí: **no adivines**.
  Documenta las dos ramas en `ADMIN.md` (B.3) para que el usuario ejecute la que aplique.

### B.2 — Script de rescate del admin (idempotente, seguro)
Crea `scripts/admin-reset-local.mjs` (**gitignored**, usa el service account local, nunca lo commitees):
- Uso: `node scripts/admin-reset-local.mjs 355463284`
- Efecto: **borra `users/355463284`** si existe (deja intacta la subcolección `data/config`). Imprime si existía o no.
- Tras correrlo, el admin queda libre para re-registrarse por bootstrap y **elegir contraseña nueva**.
- Reutiliza el cliente Firestore/credenciales que ya usan los scripts de ingesta (`firebase/…`); **no** dupliques secretos.
- Añádelo a `.gitignore` junto al resto de `scripts/*local*` si sigue ese patrón; verifica que el service account
  ya está ignorado (`firebase/*adminsdk*.json`).

### B.3 — Documento maestro `ADMIN.md` (gitignored, en la raíz)
Créalo y añádelo a `.gitignore`. Contenido (rellena los valores que verifiques; **la contraseña la anota el
usuario en su gestor, NUNCA aquí**):

```markdown
# Credenciales y operaciones de administrador — NO COMMITEAR

## Identidad admin
- Ally code admin: 355463284
- Nº de gremio (GUILD_ID): <valor real de wrangler.toml>
- Rol admin: automático porque ally == ADMIN_ALLY en worker/wrangler.toml

## Secrets del Worker (dónde viven, NO su valor)
- AUTH_SECRET     → wrangler secret (comprobar: `wrangler secret list`)
- FIREBASE_SERVICE_ACCOUNT → wrangler secret (+ copia local en firebase/, gitignored)
- .dev.vars local: AUTH_SECRET para `wrangler dev`

## Primer acceso del admin (BOOTSTRAP — cuando NO existe users/355463284)
1. Abrir la consola → pestaña "Registrarse".
2. Invitación: **DEJAR VACÍO** (el bootstrap solo lo permite el ADMIN_ALLY).
3. Nº de gremio: <GUILD_ID>.  Ally: 355463284.  Contraseña ×2: la que elijas (≥ 8) → guárdala en tu gestor.
4. Entras como admin. Luego, pestaña "Gremio" → tarjeta Invitación → escribe el código a repartir → "Rotar".

## Olvidé la contraseña del admin (RESET)
1. `node scripts/admin-reset-local.mjs 355463284`   (borra la cuenta; tu config se conserva)
2. Repite el BOOTSTRAP de arriba con una contraseña nueva.

## Operaciones recurrentes de admin
- Rotar invitación del gremio: pestaña "Gremio" → Invitación → nuevo código → "Rotar".
  (Las cuentas y sesiones existentes NO se ven afectadas.)
- Resetear a un miembro (olvidó su clave): pestaña "Gremio" → fila del miembro → "Resetear".
  El miembro se re-registra con la invitación vigente; conserva su config.

## Notas
- No hay reset por email por diseño (auth propio, sin emails).
- La invitación es una por gremio; si se filtra, rótala.
```

---

## Trampas conocidas
- **No** metas ninguna contraseña, hash ni secret en el repo ni en `ADMIN.md`. Todo lo sensible vive en el gestor
  del usuario o en `wrangler secret`. `ADMIN.md` y `scripts/admin-reset-local.mjs` **van a `.gitignore`**.
- No reintroduzcas Firebase Auth ni toques `worker/src/auth.js` salvo que un test lo exija; el diseño 5.1 es correcto.
- No relajes el 401 genérico del login ni el retardo fijo (anti-enumeración).
- No rompas el enlace "ver demo" ni el banner honesto de datos de demostración.
- Estética y textos en español intactos; usa **solo** las variables CSS existentes (mapea las de la referencia).

## Definición de hecho
- [ ] `#login` renderiza como modal centrado con pestañas; inputs de altura fija (~44 px); sin columna kilométrica;
      cabe sin scroll de página en móvil (380 px) y desktop. Registro permite invitación vacía.
- [ ] Entrar y Registrarse funcionan (estados disabled/loading, errores en `.lg-msg`); validación de contraseña.
- [ ] `ADMIN_ALLY = "355463284"` confirmado/corregido en `wrangler.toml`.
- [ ] `scripts/admin-reset-local.mjs` creado, idempotente, gitignored; `ADMIN.md` creado y gitignored.
- [ ] `node --check` OK y **tests verdes** (no debe bajar de 299; añade test si tocas markup con IDs que algún test lee).
- [ ] Actualiza `PHASE5.md` (nota "5.1-fix: login compacto + rescate admin") y `DEBTS.md` si procede.
- [ ] Commit + tag `v5.1-login-fix`. Sin `git push` ni deploy sin permiso explícito del usuario.
```
