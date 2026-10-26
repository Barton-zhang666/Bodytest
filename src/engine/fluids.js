// 有效体液室的混合守恒；不代表完整的细胞内外水、电中性及蛋白结合模型。
export const SOLUTES = ['sodium', 'potassium', 'chloride', 'magnesium', 'calcium', 'glucose', 'lactate'];
export const PLASMA_SOLUTES = ['alt', 'ldl'];
export const SALINE = { sodium: 154, chloride: 154 };
export const PRODUCT_CARRIER = { sodium: 140, potassium: 4.2, chloride: 103, magnesium: 0.85, calcium: 2.3, glucose: 5.2, lactate: 1.1, alt: 22, ldl: 2.7 };
const MCHC = 330;

export function updateFluidDerived(v) {
  v.plasmaVolume = Math.max(0.1, v.volume - v.redCellMass / MCHC);
  v.hemoglobin = v.redCellMass / Math.max(0.1, v.volume);
  v.hematocrit = 100 * v.redCellMass / MCHC / Math.max(0.1, v.volume);
  v.albumin = v.albuminMass / v.plasmaVolume;
}

export function initializeFluids(v) {
  v.ecfVolume = 14;
  v.chloride = 103;
  v.albuminMass = 42 * (v.volume - v.redCellMass / MCHC);
  updateFluidDerived(v);
}

export function addFluid(v, liters, composition = {}) {
  if (!(liters > 0)) return;
  const redCellMass = (composition.hemoglobin ?? 0) * liters;
  const plasma = liters - redCellMass / MCHC;
  const total = v.ecfVolume + plasma;
  for (const key of SOLUTES) v[key] = (v[key] * v.ecfVolume + (composition[key] ?? 0) * plasma) / total;
  for (const key of PLASMA_SOLUTES) v[key] = (v[key] * v.plasmaVolume + (composition[key] ?? 0) * plasma) / (v.plasmaVolume + plasma);
  v.ecfVolume = total;
  v.volume += liters;
  v.redCellMass += redCellMass;
  v.albuminMass += (composition.albumin ?? 0) * plasma;
  updateFluidDerived(v);
}

export function removeFluid(v, liters, wholeBlood = false) {
  const loss = Math.min(Math.max(0, liters), Math.max(0, v.volume - 0.5));
  if (!loss) return;
  const redVolume = wholeBlood ? loss * v.hematocrit / 100 : 0;
  if (wholeBlood) {
    v.albuminMass *= 1 - loss / v.volume;
    v.redCellMass *= 1 - loss / v.volume;
  } else {
    for (const key of PLASMA_SOLUTES) v[key] *= v.plasmaVolume / Math.max(0.1, v.plasmaVolume - loss);
  }
  // 等浓度小分子随排出液离开，因此浓度在这一混合步骤保持不变。
  v.ecfVolume = Math.max(1, v.ecfVolume - (loss - redVolume));
  v.volume -= loss;
  updateFluidDerived(v);
}

export function refillFromInterstitial(v, liters) {
  const oldPlasma = v.plasmaVolume;
  v.volume += Math.min(Math.max(0, liters), Math.max(0, v.ecfVolume - oldPlasma));
  updateFluidDerived(v);
  for (const key of PLASMA_SOLUTES) v[key] *= oldPlasma / v.plasmaVolume;
}

export function distributionFactor(item, v) {
  if (item.clearance === 'local') return 1;
  const distributionVolume = item.distributionVolume ?? 42;
  return distributionVolume / Math.max(distributionVolume * 0.5, distributionVolume + v.ecfVolume - 14);
}
