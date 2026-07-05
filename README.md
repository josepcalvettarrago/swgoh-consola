# SWGOH Consola de Mando — Yusepi

Dashboard F2P para gestión de la cuenta de SWGOH de **Yusepi** (ally code `355463284`,
gremio *Catalonian Republic*). Estética consola Sith/holotable. Idioma: **español**.

Objetivo del jugador: desbloquear **todos los Galactic Legends** (7/10; próximo: Lord Vader).

## Estado

- **Fase 0 (estructura):** monolito troceado en módulos + build a un solo HTML. ✓
- **Fase 0.1 (hotfix):** `assemble()` garantiza máximo una Leyenda Galáctica por equipo. ✓
- **Fase 1 (pipeline):** el roster puede venir **en vivo de swgoh.gg** vía un Cloudflare
  Worker (normaliza + persiste en Firestore), con **fallback al RD embebido** si algo falla. ✓
  Falta el deploy (cuenta Cloudflare + Firebase) — ver *Datos en vivo*.

## Datos en vivo (Fase 1)

Cloudflare bloquea el egress de un Worker hacia swgoh.gg (managed challenge + fingerprint TLS
que rechaza a undici/Node con 403). Por eso el flujo es:

- **Ingesta → GitHub Actions** (`.github/workflows/ingest.yml`, cron 8 h + manual): corre
  `scripts/ingest.mjs`, que baja swgoh.gg con **`curl`**, normaliza y escribe en **Firestore**.
- **Worker → solo lectura** (`worker/`): sirve el `RD` desde Firestore con CORS.
- **Frontend → fetch con fallback**: consume el Worker y cae al `RD` embebido si algo falla.

Puesta en marcha:

```bash
# 1) Ingesta (GitHub): añade el secret del repo FIREBASE_SERVICE_ACCOUNT (service account JSON)
#    y lanza el workflow "Ingesta swgoh.gg -> Firestore" (Actions -> Run workflow).
node scripts/ingest.mjs --dry        # prueba local sin escribir (solo fetch + normaliza)

# 2) Worker de lectura
cd worker
wrangler secret put FIREBASE_SERVICE_ACCOUNT   # mismo service account
wrangler deploy

# 3) Frontend: fija API_BASE en web/src/main.js a la URL del Worker y:
npm run build
```

Si `API_BASE` está vacío o el Worker falla, la consola usa el `RD` embebido (nunca queda en blanco).

## Estructura

```
web/
  src/
    data.js      # DATA, IMGBYNAME, RD, ENEMIES + constantes (datos embebidos)
    engine.js    # lógica pura: assemble(), lookupByName(), portrait(), teamRow()
    ui.js        # render del DOM: pestañas, roster, conquest, counters, meters
    main.js      # entry: arranca la app
    styles.css   # todos los estilos
  index.template.html   # esqueleto con marcadores <!--INJECT:CSS--> / <!--INJECT:JS-->
  dist/          # HTML final generado (no versionado)
scripts/build.js # esbuild: bundlea src/ e inyecta en la plantilla
tests/           # vitest: regresión del motor (assemble) + snapshot
worker/          # scaffolding Cloudflare Worker para Fase 1 (no se despliega aún)
firebase/        # reglas/plantilla Firestore para Fase 5 (deny-all por defecto)
docs/CHANGELOG.md
```

## Uso

```bash
npm install
npm run build      # genera web/dist/SWGOH_Consola_Yusepi.html
npm run dev        # build en modo watch
npm test           # tests de regresión del motor
```

Abre `web/dist/SWGOH_Consola_Yusepi.html` en el navegador para ver la consola.

## Datos

Actualizar (Fase 0, manual): descarga `swgoh.gg/api/player/355463284/`, normaliza al esquema
`RD` y sustituye en `web/src/data.js`. En la Fase 1 esto lo hará un Cloudflare Worker con cron.

## Deploy

Cloudflare Pages · build command `npm run build` · output dir `web/dist`.
