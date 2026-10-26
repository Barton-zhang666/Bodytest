import { stepDrug, baselineAvailability } from './pharmacokinetics.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const ACTIVITY_THRESHOLD = 0.15;
const EXPOSURE_THRESHOLD = 2 * ACTIVITY_THRESHOLD / (3 - ACTIVITY_THRESHOLD);
export const FORECAST_LIMIT = 180 * 1440;
export function clearanceFor(item, values, exposures) {
  const renal = clamp(values.egfr / 100, 0.1, 1.2);
  // 尚无药物特异提取比：只在显著低流量时施加保守的肝灌注限制。
  const hepatic = clamp(values.liverReserve / 100 * clamp(((values.cardiacOutput ?? 5.184) + (values.cprFlow ?? 0)) / 3.37, 0.2, 1), 0.1, 1);
  let factor = item.clearance === 'renal' ? renal : item.clearance === 'mixed' ? (renal + hepatic) / 2 : item.clearance === 'local' ? 1 : hepatic;
  if (item.tags.includes('cyp3a4')) factor /= 1 + exposures.filter(x => x.item.tags.includes('cyp-inhibitor')).reduce((sum, x) => sum + x.strength, 0) * 0.8;
  return factor;
}


// 余时是模型阈值预测；低于阈值的暴露仍参与实际引擎计算。
export function forecastRemaining(item, doses, clearance, bioavailability = baselineAvailability(item), dilution = 1) {
  const projected = doses.map(d => ({ ...d }));
  const dt = Math.min(5, item.absorption / 4, item.lag / 4);
  const active = () => projected.some(d => d.reservoir > 0) || Math.max(
    projected.reduce((s, d) => s + d.gut, 0) / item.reference * dilution,
    projected.reduce((s, d) => s + d.central, 0) / (item.reference * baselineAvailability(item)) * dilution,
    projected.reduce((s, d) => s + d.effect, 0)) >= EXPOSURE_THRESHOLD;
  let minutes = 0;
  while (active() && minutes < FORECAST_LIMIT) {
    for (const d of projected) stepDrug(item, d, dt, clearance, bioavailability, dilution);
    minutes += dt;
  }
  return { minutes, capped: active() };
}
