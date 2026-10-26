const LN2 = Math.log(2);
export const baselineAvailability = item => item.intravenous || item.clearance === 'local' ? 1 : 0.65;

// 实际步进与余时预测共用此函数，延迟转运不会删除尚未到达作用部位的量。
export function stepDrug(item, dose, dt, clearance, bioavailability, dilution = 1) {
  const oldMass = dose.gut + dose.central;
  const delivered = item.infusionMinutes ? Math.min(dose.reservoir ?? 0, dose.amount / item.infusionMinutes * dt) : 0;
  dose.reservoir = Math.max(0, (dose.reservoir ?? 0) - delivered);
  const wait = Math.min(dt, dose.delayRemaining ?? 0);
  dose.delayRemaining = Math.max(0, (dose.delayRemaining ?? 0) - dt);
  const absorptionTime = dt - wait;
  const ka = LN2 / item.absorption, ke = LN2 / item.halfLife * clearance;
  const ga = Math.exp(-ka * absorptionTime), ce = Math.exp(-ke * absorptionTime);
  const transfer = Math.abs(ke - ka) < 1e-8 ? dose.gut * ka * absorptionTime * ga : dose.gut * ka * (ga - ce) / (ke - ka);
  dose.central = (dose.central + delivered) * Math.exp(-ke * dt) + transfer * bioavailability;
  dose.gut *= ga;
  dose.eliminated = (dose.eliminated ?? 0) + Math.max(0, oldMass + delivered - dose.gut - dose.central);
  const target = dose.central / (item.reference * baselineAvailability(item)) * dilution;
  dose.effect += (target - dose.effect) * -Math.expm1(-dt / (target < dose.effect && item.recovery ? item.recovery : item.lag));
  return delivered;
}
