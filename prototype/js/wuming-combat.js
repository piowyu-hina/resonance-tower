// Temporary combat effects, independent from Xiaochu's one-hit shield.
export function clearSurvivalState(c) {
  c.evasionUntil = 0;
  c.evasionChance = 0;
  c.openingUntil = 0;
  c.resolveUntil = 0;
  c.resolveReduction = 0;
}

export function tickSurvivalState(c, dt) {
  for (const key of ['evasionUntil', 'openingUntil', 'resolveUntil']) {
    c[key] = Math.max(0, (c[key] || 0) - dt);
  }
  if (!c.evasionUntil) c.evasionChance = 0;
  if (!c.resolveUntil) c.resolveReduction = 0;
}

export function tryEvade(c) {
  // Legacy stealth remains separate and does not grant Wuming's opening.
  if (c.dodgeUntil > 0) return true;
  if (!(c.evasionUntil > 0) || Math.random() >= c.evasionChance) return false;
  c.openingUntil = 10000;
  return true;
}

export function resolveDamage(c, damage) {
  return c.resolveUntil > 0 && damage > 0
    ? Math.max(1, Math.round(damage * (1 - c.resolveReduction))) : damage;
}
