import { defineConfig } from "vitest/config";

// Los tests de render (jsdom) reescriben toda la plantilla y arrancan ui.js completo; en máquinas
// con contención de CPU el default de 5s se queda corto bajo carga paralela. Subimos el timeout
// para que `npm test` sea verde de forma fiable (no cambia ninguna lógica de test).
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
