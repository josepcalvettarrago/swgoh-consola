// Defensas del meta para la pestaña Counters + constantes compartidas por el motor y la UI.

export const SIDES = { L: "Luz", D: "Oscuro", N: "Neutral" };
export const ROLE_ES = { Tank: "Tanque", Healer: "Sustain", Support: "Apoyo", Attacker: "Daño" };

// Mecánicas clave que el motor de sinergias intenta cubrir en cada equipo.
export const KEYMECH = ["Taunt", "Dispel", "Revive", "Gain Turn Meter", "Remove Turn Meter", "Stun", "Ability Block", "Offense Up", "Assist", "Buff Immunity", "Defense Down", "AoE"];

// Defensas meta (GAC/TW). needs = anti-mecánicas que un buen counter debe aportar.
export const ENEMIES = [
  { n: "Jabba the Hutt (GL)", side: "D", fac: "Hutt Cartel", threat: "alto", focus: "Revive, cura y control de TM. Impide revivir/curar y remátalo antes de que gire.", needs: ["Anti-Revive", "Healing Immunity", "Buff Immunity", "Instant Defeat"] },
  { n: "Rey (GL)", side: "L", fac: "Resistance", threat: "alto", focus: "Buffs, contraataque y previsión. Anula sus buffs, bloquéala y quítale TM.", needs: ["Buff Immunity", "Stun", "Ability Block", "Remove Turn Meter"] },
  { n: "Sith Eternal Emperor (GL)", side: "D", fac: "Sith", threat: "alto", focus: "Aniquila y marca. Sube tenacidad, limpia debuffs y evita quedar marcado.", needs: ["Buff Immunity", "Tenacity Up", "Dispel", "Stun"] },
  { n: "Jedi Master Kenobi (GL)", side: "L", fac: "Galactic Republic", threat: "alto", focus: "Protección y previsión. Bloquea habilidades, quítale TM y usa AoE.", needs: ["Ability Block", "Buff Immunity", "Remove Turn Meter", "AoE"] },
  { n: "Leia Organa (GL)", side: "L", fac: "Rebel", threat: "alto", focus: "Sigilo, asistencias y plaga. AoE para sacarla de sigilo y corta su curación.", needs: ["AoE", "Dispel", "Stun", "Healing Immunity"] },
  { n: "General Skywalker", side: "L", fac: "Galactic Republic", threat: "alto", focus: "Cooldowns y anti-revive. Bloquea a GAS y controla su TM.", needs: ["Ability Block", "Buff Immunity", "Remove Turn Meter"] },
  { n: "Lord Vader", side: "D", fac: "Empire", threat: "alto", focus: "Culling Blade y DoT. Sube tenacidad, limpia debuffs propios y aturde.", needs: ["Buff Immunity", "Tenacity Up", "Dispel", "Stun"] },
  { n: "Bo-Katan (Mand'alor)", side: "L", fac: "Mandalorian", threat: "alto", focus: "Mandalorianos a tope de buffs. Rómpelos, aturde a la líder y AoE.", needs: ["Buff Immunity", "AoE", "Ability Block", "Stun"] },
  { n: "GL Ahsoka", side: "L", fac: "Rebel", threat: "alto", focus: "Evasión y contraataque. Bloquéala y no le des material para contraatacar.", needs: ["Ability Block", "Buff Immunity", "Remove Turn Meter"] },
  { n: "Darth Malgus", side: "D", fac: "Sith Empire", threat: "medio", focus: "Se CURA de tus debuffs. No le eches debuffs: usa Buff Immunity, aturde y bloquea.", needs: ["Buff Immunity", "Healing Immunity", "Stun", "Ability Block"] },
  { n: "Padmé Amidala", side: "L", fac: "Galactic Republic", threat: "medio", focus: "Protección y Coraje. Buff Immunity contra el Coraje, baja defensa y AoE.", needs: ["Buff Immunity", "AoE", "Defense Down", "Ability Block"] },
  { n: "Supreme Leader Kylo Ren (GL)", side: "D", fac: "First Order", threat: "alto", focus: "TM y revive. Rompe su ventaja, aturde y quítale TM.", needs: ["Buff Immunity", "Stun", "Remove Turn Meter"] },
  { n: "General Grievous (droides Sep)", side: "D", fac: "Separatist", threat: "medio", focus: "Muralla de droides. AoE, limpia buffs y rompe su protección.", needs: ["Buff Immunity", "AoE", "Dispel", "Stun"] },
  { n: "Nightsisters (Great Mothers)", side: "D", fac: "Nightsister", threat: "medio", focus: "Reviven y aplican plaga. Impide revivir y curar; presiona con AoE.", needs: ["Anti-Revive", "Buff Immunity", "AoE", "Healing Immunity"] },
  { n: "Queen Amidala (gungans)", side: "L", fac: "Gungan", threat: "medio", focus: "Muralla gungan con protección y asistencias. Buff Immunity, baja defensa y AoE.", needs: ["Buff Immunity", "AoE", "Defense Down", "Ability Block"] },
  { n: "Bounty Hunters (Bossk/Boba)", side: "D", fac: "Bounty Hunter", threat: "medio", focus: "Contraataques y DoT en cadena. Aturde, corta curación e impide revivir.", needs: ["Buff Immunity", "Anti-Revive", "Stun", "Healing Immunity"] },
];
