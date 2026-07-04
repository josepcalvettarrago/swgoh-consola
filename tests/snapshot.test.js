// Snapshot de regresión: congela la salida del motor para inputs fijos.
// Si un refactor cambia el equipo o el score propuesto, el snapshot fallará.
import { describe, it, expect } from "vitest";
import { assemble } from "../web/src/engine.js";
import { RD, ENEMIES } from "../web/src/data.js";

const summary = R => ({ leader: R.leader.i, team: R.team.map(u => u.i), score: R.score });

describe("snapshot del motor", () => {
  it("equipo por defecto (pool completo)", () => {
    expect(summary(assemble(RD.R, [], null))).toMatchSnapshot();
  });

  it("counter por cada defensa del meta", () => {
    const out = ENEMIES.map(e => ({ enemy: e.n, ...summary(assemble(RD.R, [], e.needs)) }));
    expect(out).toMatchSnapshot();
  });
});
