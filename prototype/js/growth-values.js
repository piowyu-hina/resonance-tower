import { CHAR_DEFS, STAT_LINE_MAX } from './constants.js';

export function growthLineValue(c, lineKey, level) {
  const def = CHAR_DEFS[c.id];
  const scale = 1 + level / STAT_LINE_MAX;
  if (lineKey === 'atk') return `${(c.atk * scale).toFixed(1)} 攻擊力`;
  if (lineKey === 'def') return `${(c.def * scale).toFixed(1)} 防禦力`;
  if (lineKey === 'speed') return `${(def.atkInterval * (1 - 0.5 * level / STAT_LINE_MAX) / 1000).toFixed(2)} 秒`;
  if (lineKey === 'action') {
    const cooldownText = `${(def.action.cooldown * (1 - 0.5 * level / STAT_LINE_MAX)).toFixed(1)} 秒冷卻`;
    // Some actions have no magnitude of their own to
    // scale - only cooldown moves. Actions with a magnitude (including guards)
    // show their scaled magnitude alongside it, same as a skill line would.
    if (def.action.type === 'selfBuffAtkDef') {
      return `${cooldownText} · +${(def.action.atkPct * scale * 100).toFixed(1)}% 攻擊 / +${(def.action.defAmount * scale).toFixed(1)} 防禦`;
    }
    if (def.action.type === 'guardAndSlash') {
      return `${cooldownText} · 格擋減傷 ${(Math.min(.85, def.action.reduction * scale) * 100).toFixed(1)}% / 下次斬擊 +${(def.action.slashPct * scale * 100).toFixed(1)}%`;
    }
    if (def.action.type === 'healAndResolve') {
      return `${cooldownText} · 回復 ${(def.action.pct * scale * 100).toFixed(1)}% / 減傷 ${(Math.min(.6, def.action.reduction * scale) * 100).toFixed(1)}%（${def.action.duration} 秒）`;
    }
    return cooldownText;
  }
  const skill = def.skills[Number(lineKey.replace('skill', ''))];
  if (skill.type === 'damage') return `${(skill.mult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'evasionSelf') return `${(Math.min(.75, skill.chance * scale) * 100).toFixed(1)}% 閃避（${skill.duration} 秒，上限 75%）`;
  if (skill.type === 'openingStrike') return `${(skill.mult * scale).toFixed(2)} 倍 / 破綻 ${(skill.openingMult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'guardSelf') return `單次減傷 ${(Math.min(.85, skill.reduction * scale) * 100).toFixed(1)}%（上限 85%）`;
  if (skill.type === 'counterSlash') return `${(skill.mult * scale).toFixed(2)} 倍 / 反擊 ${(skill.counterMult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'healSelf' || skill.type === 'healAlly') return `${(skill.pct * scale * 100).toFixed(1)}% 最大生命`;
  if (skill.type === 'buffAtk') return `+${(skill.pct * scale * 100).toFixed(1)}% 攻擊`;
  if (skill.type === 'buffDefParty') return `+${(skill.amount * scale).toFixed(1)} 防禦`;
  if (skill.type === 'hasteSelf') return `+${(Math.min(0.95, (1 - skill.mult) * scale) * 100).toFixed(1)}% 攻速`;
  return skill.desc;
}
