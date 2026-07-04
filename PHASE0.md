# FASE 0 — Arranque del repo (guía paso a paso para Claude Code)

> Objetivo: convertir el HTML monolítico en un repo mantenible **sin cambiar ni un píxel** de lo que ya funciona.
> Modelo recomendado: **Opus, effort alto** (decisiones de estructura). Idioma de commits y docs: **español**.
> Regla sagrada: al final de la fase, el HTML generado debe renderizar **idéntico** al actual.

---

## PASOS DETALLADOS

### 1. Estructura del repo
```
swgoh-consola/
├─ web/
│  ├─ src/
│  │  ├─ data.js        # RD, DATA, IMGBYNAME (los 3 grandes JSON)
│  │  ├─ engine.js      # assemble(), genCounter(), cqRun(), lookupByName()...
│  │  ├─ ui.js          # renderers de cada tab + tabs + meters
│  │  └─ styles.css     # todo el <style> actual
│  ├─ index.template.html   # esqueleto con marcadores de inyección
│  └─ dist/                 # HTML final generado (gitignored o publicado)
├─ worker/              # Cloudflare Worker (vacío en F0, preparado para F1)
│  ├─ src/index.js
│  └─ wrangler.toml     # SIN secrets; documenta SWGOH_GG_API_KEY como var
├─ firebase/            # config + reglas (vacío-plantilla en F0)
│  ├─ firestore.rules
│  └─ firebase.json
├─ scripts/             # parsers Python/Node ya existentes
├─ tests/
│  ├─ engine.test.js    # vitest: assemble, cqRun, genCounter
│  └─ snapshot.test.js  # regresión del HTML generado
├─ docs/
│  └─ CHANGELOG.md
├─ .gitignore
├─ package.json
├─ ROADMAP.md
└─ README.md
```

### 2. Build de un solo archivo (esbuild)
- Script `build.js` que: bundlea `src/*.js` → un solo JS, inyecta CSS y JS en
  `index.template.html` reemplazando marcadores tipo `<!--INJECT:CSS-->` y
  `<!--INJECT:JS-->`, y escribe `dist/SWGOH_Consola_Yusepi.html`.
- `npm run build` produce el HTML. `npm run dev` con watch opcional.
- **Criterio de éxito**: `diff` entre el HTML original y el generado = vacío
  (o solo difieren en orden de propiedades/espacios, documentado como equivalente).

### 3. Tests de regresión (hazlos ANTES de trocear)
- `snapshot.test.js`: carga el HTML original, extrae el `<script>`, y guarda hashes
  de las salidas de `assemble()` para un set fijo de inputs. Tras el troceo, deben
  coincidir.
- `engine.test.js` (vitest), casos mínimos:
  - `assemble()` con el pool completo devuelve equipo coherente (5 miembros, líder válido).
  - Counter de Jabba → needScore alto (cobertura anti-revive).
  - Conquest con Ahsoka forzada → queda como líder Jedi.
  - `lookupByName('Jabba the Hutt (GL)')` resuelve imagen; nombre colectivo → fallback iniciales.
- `npm test` verde es requisito para cerrar la fase.

### 4. Higiene del repo
- `.gitignore`: `node_modules/`, `dist/` (si publicas por CI), `.dev.vars`, `*.local`.
- `package.json` con scripts: `build`, `dev`, `test`, `lint`.
- `README.md` en español: qué es, cómo buildear, cómo correr tests, mapa de carpetas.
- `docs/CHANGELOG.md`: primera entrada "Fase 0 — troceo del monolito, sin cambios visuales".

### 5. Preparar (sin usar aún) el terreno de Fase 1
- `worker/wrangler.toml` con `[vars]` documentando `SWGOH_GG_API_KEY` (valor real irá como
  `wrangler secret put`, nunca commiteado).
- `firebase/firestore.rules` con reglas restrictivas por defecto (deny-all; se abre en F5).
- Nada de esto se despliega en F0; solo queda listo.

### 6. Deploy de prueba (Cloudflare Pages)
- Conectar el repo GitHub a Cloudflare Pages, build command `npm run build`,
  output dir `web/dist`. Verifica que la consola carga igual online.

---

## DEFINICIÓN DE HECHO (Fase 0)
- [ ] Repo GitHub privado creado y estructurado.
- [ ] HTML troceado en `data.js` / `engine.js` / `ui.js` / `styles.css`.
- [ ] `npm run build` genera un HTML idéntico (o equivalente justificado) al original.
- [ ] `npm test` verde (regresión + motor).
- [ ] Deploy de prueba en Cloudflare Pages funcionando.
- [ ] `docs/CHANGELOG.md` con la entrada de Fase 0 en español.
- [ ] Commit + tag `v0-estructura`.

## QUÉ **NO** HACER EN FASE 0
- No conectar a swgoh.gg todavía (eso es F1).
- No tocar Firestore ni Auth (F1/F5).
- No cambiar textos, colores, layout ni lógica de negocio.
- No "mejorar de paso" ningún motor: la fase es puramente estructural.
