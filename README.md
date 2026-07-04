# SWGOH Consola de Mando — Yusepi

Dashboard F2P para gestión de la cuenta de SWGOH de **Yusepi** (ally code `355463284`,
gremio *Catalonian Republic*). Estética consola Sith/holotable. Idioma: **español**.

Objetivo del jugador: desbloquear **todos los Galactic Legends** (7/10; próximo: Lord Vader).

## Estado

**Fase 0 (estructura)** completada: el monolito `SWGOH_Consola_Yusepi.html` se ha troceado
en módulos con un build que reproduce un único HTML. Sin cambios visuales ni de lógica.
Los datos siguen embebidos (`data.js`); la conexión a swgoh.gg llega en la Fase 1.

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
