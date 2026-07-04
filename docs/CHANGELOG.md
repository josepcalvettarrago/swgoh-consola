# Changelog

Todas las fases del proyecto SWGOH Consola. Formato: fecha · fase · resumen en español.

## Fase 0 — Troceo del monolito (estructura)

- Convertido el único `SWGOH_Consola_Yusepi.html` (~190 KB) en un repo modular:
  - `web/src/data.js` — datos embebidos (`DATA`, `IMGBYNAME`, `RD`, `ENEMIES`) + constantes.
  - `web/src/engine.js` — lógica pura: `assemble()`, `lookupByName()`, `portrait()`, `teamRow()`.
  - `web/src/ui.js` — render del DOM: pestañas, roster explorer, conquest, counters, meters.
  - `web/src/main.js` — bootstrap.
  - `web/src/styles.css` — estilos.
- Build con esbuild (`scripts/build.js`) que reinyecta CSS + JS en `index.template.html`
  y produce un único `web/dist/SWGOH_Consola_Yusepi.html`.
- Tests de regresión (vitest) que congelan la salida del motor `assemble()` antes de trocear.
- Sin cambios visuales ni de lógica. **Encoding normalizado a UTF-8** (se corrigió el mojibake
  del HTML de referencia: acentos, flechas `→`, `×`, `★`, `⚡`).
- Scaffolding preparado (sin desplegar) para Fase 1 (`worker/`) y Fase 5 (`firebase/`).
- Tag: `v0-estructura`.
