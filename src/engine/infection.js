const approach = (x, target, dt, tau) => x + (target - x) * -Math.expm1(-dt / tau);
// 所有情景共用虚构增长参数，刻意不拟合真实病原体动力学。
export function stepInfections(infections, exposures, values, dt) {
  let load = 0, pulmonary = 0;
  for (const x of infections) {
    const matched = exposures.filter(e => x.item.spectrum.includes(e.item.id));
    const suppression = Math.min(3, matched.reduce((sum, e) => sum + e.strength, 0));
    x.immune = approach(x.immune, x.load / (x.load + 12), dt, 180);
    const rate = 0.004 * (1 - x.load / 100) - x.immune * 0.0045 - suppression * 0.012;
    x.load = Math.max(0, Math.min(100, x.load * Math.exp(rate * dt)));
    if (x.load < 0.01) x.load = 0;
    x.treatment = suppression;
    load += x.load;
    pulmonary += x.load * x.item.lung;
  }
  values.pathogenLoad = load;
  values.inflammation = approach(values.inflammation, Math.min(100, load * 0.7), dt, 75);
  values.infectionLung = approach(values.infectionLung, Math.min(50, pulmonary * 0.25), dt, 120);
  return {
    temp: values.inflammation * 0.035,
    sbp: -values.inflammation * 0.55, dbp: -values.inflammation * 0.35,
    inotropy: -values.inflammation * 0.002,
    lactate: Math.max(0, values.inflammation - 50) * 0.03,
  };
}
