// Transient combat state only: never persisted in saves or stacked as charges.
export function clearGuardState(c) {
  c.guardUntil = 0;
  c.guardReduction = 0;
  c.counterUntil = 0;
  c.slashBoostUntil = 0;
  c.slashBoostPct = 0;
}

export function grantGuard(c, reduction, duration) {
  c.guardReduction = Math.max(c.guardUntil > 0 ? c.guardReduction : 0, Math.min(.85, reduction));
  c.guardUntil = Math.max(c.guardUntil || 0, duration * 1000);
}

export function consumeGuard(c, damage) {
  if (!(c.guardUntil > 0) || damage <= 0) return { damage, blocked: false, prevented: 0 };
  const reduced = Math.max(0, Math.round(damage * (1 - c.guardReduction)));
  c.guardUntil = 0;
  c.guardReduction = 0;
  c.counterUntil = 10000;
  return { damage: reduced, blocked: true, prevented: damage - reduced };
}

export function tickGuardState(c, dt) {
  for (const key of ['guardUntil', 'counterUntil', 'slashBoostUntil']) {
    c[key] = Math.max(0, (c[key] || 0) - dt);
  }
  if (!c.guardUntil) c.guardReduction = 0;
  if (!c.slashBoostUntil) c.slashBoostPct = 0;
}
