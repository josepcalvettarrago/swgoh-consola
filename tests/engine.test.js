// Regresión del motor puro (sin DOM). Congela el comportamiento de assemble()
// y lookupByName() antes de cualquier refactor futuro.
import { describe, it, expect } from "vitest";
import { assemble, lookupByName } from "../web/src/engine.js";
import { RD, ENEMIES } from "../web/src/data.js";

const byName = n => RD.R.find(u => u.n === n);

describe("assemble()", () => {
  it("con el pool completo devuelve 5 miembros y líder válido", () => {
    const R = assemble(RD.R, [], null);
    expect(R).toBeTruthy();
    expect(R.team).toHaveLength(5);
    // El líder debe estar en el equipo y ser un líder (ld) cuando hay líderes disponibles.
    expect(R.team[0]).toBe(R.leader);
    expect(R.leader.ld).toBe(1);
    // Sin duplicados.
    expect(new Set(R.team.map(u => u.i)).size).toBe(5);
    // Score en rango 0..100.
    expect(R.score).toBeGreaterThanOrEqual(0);
    expect(R.score).toBeLessThanOrEqual(100);
  });

  it("counter de Jabba: needScore alto (cubre anti-revive / healing immunity)", () => {
    const jabba = ENEMIES.find(e => e.n.startsWith("Jabba"));
    const R = assemble(RD.R, [], jabba.needs);
    expect(R).toBeTruthy();
    // Cubre al menos la mitad de las anti-mecánicas pedidas.
    expect(R.needScore).toBeGreaterThanOrEqual(0.5);
  });

  it("Conquest con Ahsoka (Fulcrum) forzada como único candidato queda de líder", () => {
    const ahsoka = byName("Ahsoka Tano (Fulcrum)");
    expect(ahsoka).toBeTruthy();
    // Pool vacío + forzado no líder -> el forzado acaba siendo el líder (fallback).
    const R = assemble([], [ahsoka], null);
    expect(R.leader).toBe(ahsoka);
  });

  it("respeta un líder forzado con capacidad de liderazgo", () => {
    const gas = byName("General Skywalker"); // ld:1
    const R = assemble(RD.R, [gas], null);
    expect(R.team).toContain(gas);
    expect(R.leader).toBe(gas);
  });
});

describe("unicidad de Leyenda Galáctica (gl:1)", () => {
  const glCount = R => [...R.team, ...R.subs].filter(u => u.gl).length;

  it("equipo por defecto: nunca más de una GL entre titulares + suplentes", () => {
    expect(glCount(assemble(RD.R, [], null))).toBeLessThanOrEqual(1);
  });

  it("cada counter del meta: nunca más de una GL", () => {
    for (const e of ENEMIES) {
      expect(glCount(assemble(RD.R, [], e.needs))).toBeLessThanOrEqual(1);
    }
  });

  it("forzando DOS GLs, el equipo sigue con una sola GL", () => {
    const slkr = byName("Supreme Leader Kylo Ren"), glrey = byName("Rey");
    expect(slkr.gl).toBe(1); expect(glrey.gl).toBe(1);
    const R = assemble(RD.R, [slkr, glrey], null);
    expect(R.team.filter(u => u.gl).length).toBe(1);
    expect(glCount(R)).toBeLessThanOrEqual(1);
  });

  it("líder GL: ninguna otra GL rellena el equipo", () => {
    const jabba = byName("Jabba the Hutt"); // gl:1, ld:1
    const R = assemble(RD.R, [jabba], null);
    expect(R.leader.gl).toBe(1);
    expect(R.team.filter(u => u.gl).length).toBe(1);
  });
});

describe("lookupByName()", () => {
  it("resuelve el sufijo (GL) contra el nombre base", () => {
    const hit = lookupByName("Jabba the Hutt (GL)");
    expect(hit.im).toBe("jabbathehutt");
    expect(hit.s).toBe("D");
  });

  it("nombre desconocido -> fallback neutral sin imagen", () => {
    const hit = lookupByName("Personaje Inexistente");
    expect(hit.im).toBeNull();
    expect(hit.s).toBe("N");
  });
});
