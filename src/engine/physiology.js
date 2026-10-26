import { initializeFluids } from './fluids.js';
// 集总、分钟级教学生理。方程、单位、经验系数与适用边界见 docs/COUPLING-V3.md。
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const positive = x => Math.max(0, x);
const approach = (x, target, dt, tau) => x + (target - x) * -Math.expm1(-dt / tau);
const BICARBONATE = 0.03 * 40 * 10 ** (7.4 - 6.1);
const saturation = (p, ph = 7.4) => 100 * p ** 3 / (p ** 3 + (26.6 * 10 ** (0.48 * (7.4 - ph))) ** 3);
const pressureFromSaturation = s => 26.6 * (s / (100 - s)) ** (1 / 3);

export function oxygenContent(hb, sao2, pao2) {
  return 1.34 * hb / 10 * sao2 / 100 + 0.003 * pao2; // mL O₂ / dL
}

export function oxygenBalance(v) {
  v.oxygenContent = oxygenContent(v.hemoglobin, v.spo2, v.pao2);
  v.oxygenDelivery = (v.cardiacOutput + (v.cprFlow ?? 0)) * v.oxygenContent * 10;
  v.oxygenDemand = 250 * 1.1 ** (v.temperature - 36.7) * (1 + v.pain * 0.015);
  // 提取上限 60% 是集总经验假设，不能代表所有组织或疾病。
  v.oxygenUse = Math.min(v.oxygenDemand, v.oxygenDelivery * 0.6);
  v.oxygenDeficit = Math.max(0, v.oxygenDemand - v.oxygenUse) / v.oxygenDemand * 100;
  v.oxygenExtraction = v.oxygenUse / Math.max(0.001, v.oxygenDelivery) * 100;
  const venousContent = Math.max(0, v.oxygenContent - v.oxygenUse / Math.max(0.001, (v.cardiacOutput + (v.cprFlow ?? 0)) * 10));
  v.svo2 = clamp(venousContent / (1.34 * v.hemoglobin / 10) * 100, 0, v.spo2);
}

export function initializePhysiology(v) {
  v.map = (v.sbp + 2 * v.dbp) / 3;
  v.strokeVolume = 72 * (v.volume / 5) ** 2.5;
  v.cardiacOutput = v.hr * v.strokeVolume / 1000;
  v.cvp = 5;
  v.svr = (v.map - v.cvp) / v.cardiacOutput;
  v.pao2 = pressureFromSaturation(v.spo2);
  v.bicarbonate = BICARBONATE;
  v.renalAcid = 0;
  v.sympathetic = 0;
  v.brainPerfusion = 100;
  v.renalPerfusion = 100;
  v.brainOxygen = 100;
  v.brainstem = 1;
  v.oxygenDebt = 0;
  v.pulseSignal = 100;
  v.qrs = 90;
  v.cprFlow = 0; v.effectiveFlow = v.cardiacOutput; v.ventilationRate = v.rr;
  v.cardiacArrest = 0; v.respiratoryArrest = 0; v.cprCount = 0;
  v.pathogenLoad = 0; v.inflammation = 0; v.infectionLung = 0;
  v.redCellMass = v.hemoglobin * v.volume;
  initializeFluids(v);
  oxygenBalance(v);
  v.alveolarVentilation = 0.863 * v.oxygenDemand * 0.8 / 40;
  v.tidalVolume = (v.alveolarVentilation / v.rr + 0.15) * 1000;
  v.deadSpace = 150;
}

// 直接药效与压力反射共用有限的变时/变力储备，不让反射无限抵消药物。
export function stepCirculation(v, b, e, dt, support = {}) {
  const get = key => e[key] ?? 0;
  const pressureError = positive((b.map - v.map) / b.map);
  const deliveryError = positive(1 - v.oxygenDelivery / b.oxygenDelivery);
  v.sympathetic = approach(v.sympathetic, clamp(pressureError * 2 + deliveryError * 0.3, 0, 1), dt, 0.5);
  const reserve = 1 / (1 + get('chronotropicBlock') * 2);
  const electrolyteStress = positive(v.potassium - 6) * 0.18 + positive(2.8 - v.potassium) * 0.14
    + positive(0.55 - v.magnesium) * 0.3 + positive(1.8 - v.calcium) * 0.2;
  const acidStress = positive(7.2 - v.ph) * 0.8;
  const hrTarget = (b.hr + get('hr') + 28 * v.sympathetic * reserve + positive(3.8 - v.glucose) * 7 * reserve
    + (v.temperature - b.temperature) * 8 + (v.pain - b.pain) * 1.5) * clamp(1 - positive(v.potassium - 6.5) * 0.16 - acidStress * 0.3, 0.4, 1);
  v.hr = support.arrest ? 0 : approach(v.hr, clamp(hrTarget, 0, 240), dt, 1.5);
  // 旧目录的压力系数换算为等效阻力效应；已拆出负性变力的药物不重复扣压。
  const vascular = clamp(1 + (get('sbp') + 2 * get('dbp')) / 3 / (b.map - b.cvp), 0.15, 2.5);
  v.svr = approach(v.svr, b.svr * vascular * (1 + v.sympathetic * 0.85), dt, 0.6);
  const volumeRatio = clamp(v.volume / b.volume, 0.35, 1.6);
  const filling = clamp(1 + (b.hr - v.hr) * 0.004, 0.65, 1.35)
    / (1 + (positive(v.hr - 120) / 80) ** 2);
  const contractility = clamp(1 + get('inotropy') + v.sympathetic * 0.12 * reserve
    - v.heartDamage * 0.009 - electrolyteStress - acidStress, 0.08, 1.5);
  const afterload = (v.svr / b.svr) ** -0.15;
  v.strokeVolume = clamp(b.strokeVolume * volumeRatio ** 2.5 * filling * contractility * afterload, 2, 115);
  v.cardiacOutput = v.hr * v.strokeVolume / 1000;
  v.cprFlow = approach(v.cprFlow ?? 0, support.arrest ? Math.min(2.4, (support.compressions ?? 0) * 0.015 / dt) : 0, dt, 0.05);
  v.effectiveFlow = v.cardiacOutput + v.cprFlow;
  v.cvp = clamp(5 * volumeRatio ** 3 + v.heartDamage * 0.04, 1, 18);
  v.map = v.cvp + v.effectiveFlow * v.svr;
  const pulse = support.arrest ? 0 : Math.min(v.map * 1.8, (b.sbp - b.dbp) * v.strokeVolume / b.strokeVolume);
  v.sbp = v.map + pulse * 2 / 3;
  v.dbp = v.map - pulse / 3;
  const flowRatio = v.effectiveFlow / b.cardiacOutput;
  // 自身调节只能在一定压力与总流量内补偿，不能凭空创造器官血流。
  v.brainPerfusion = 100 * clamp(Math.min((v.map - 10) / 55, flowRatio / 0.65), 0, 1);
  v.renalPerfusion = 100 * clamp(Math.min((v.map - v.cvp) / 65, flowRatio ** 1.4), 0, 1);
  v.brainOxygen = clamp(v.brainPerfusion * v.oxygenContent / b.oxygenContent, 0, 100);
  v.pulseSignal = 100 * clamp(Math.min(flowRatio, (v.map - v.cvp) / 65) / (1 + v.sympathetic * 0.5), 0, 1);
}

export function stepRespiration(v, b, e, dt, airway = 0, support = {}) {
  const get = key => e[key] ?? 0;
  const brainFuel = Math.min(v.brainOxygen / 35, v.glucose / 1.5, (100 - v.brainDamage) / 35);
  v.brainstem = approach(v.brainstem, clamp(brainFuel, 0.04, 1), dt, 2);
  const chemoreflex = clamp(positive(v.co2 - 40) * 0.28 + positive(v.lactate - 2) * 1.4
    + positive(90 - v.spo2) * 0.25 + positive(1 - v.oxygenDelivery / b.oxygenDelivery) * 4, 0, 26);
  const drive = chemoreflex / (1 + v.sedation * 0.045);
  const airwayRelief = Math.min(airway, get('bronchodilation'));
  const rrTarget = clamp((b.rr + get('resp') + drive - airwayRelief * 5) * v.brainstem, 0, 50);
  v.rr = support.apnea ? 0 : approach(v.rr, rrTarget, dt, 1.2);
  const depth = clamp((1 + drive * 0.018) / (1 + v.sedation * 0.006) * Math.sqrt(v.brainstem), 0.15, 1.6);
  v.tidalVolume = approach(v.tidalVolume, b.tidalVolume * depth, dt, 1.2);
  v.deadSpace = Math.min(v.tidalVolume * 0.85, 150 + positive(1 - v.effectiveFlow / b.cardiacOutput) * 100 + v.lungDamage * 0.5);
  const assisted = support.intubated && support.ventilated;
  v.ventilationRate = assisted ? Math.max(12, v.rr) : v.rr;
  v.alveolarVentilation = Math.max(0.01, assisted ? v.ventilationRate * (450 - Math.min(v.deadSpace, 350)) / 1000 : v.rr * (v.tidalVolume - v.deadSpace) / 1000);
  const co2Target = clamp(0.863 * v.oxygenDemand * 0.8 / v.alveolarVentilation, 12, 160);
  v.co2 = approach(v.co2, co2Target, dt, 0.8);
  const alveolarO2 = (support.oxygen ? 0.5 : 0.21) * (760 - 47) - v.co2 / 0.8;
  const baselineGradient = 0.21 * (760 - 47) - 40 / 0.8 - b.pao2;
  const gasExchangeLoss = Math.max(0, baselineGradient - airwayRelief * 20)
    + (v.infectionLung ?? 0) + v.lungDamage * 0.6 + positive(v.heartDamage - 35) * 0.25 + positive(v.volume - 6) * 7;
  v.pao2 = approach(v.pao2, clamp(alveolarO2 - gasExchangeLoss, 5, 140), dt, 0.5);
  v.spo2 = saturation(v.pao2, v.ph);
}

export function stepMetabolism(v, b, e, dt) {
  oxygenBalance(v);
  v.oxygenDebt = Math.max(0, v.oxygenDebt + (v.oxygenDemand - v.oxygenUse
    - Math.min(v.oxygenDebt / 10, positive(v.oxygenDelivery * 0.6 - v.oxygenDemand) * 0.15)) * dt);
  const clearance = clamp(v.liverReserve / 100 * (v.cardiacOutput + (v.cprFlow ?? 0)) / b.cardiacOutput, 0.08, 1.2);
  // 乳酸稳态 = 生产 / 清除；氧债导致的额外生成不是把低血氧重复计入。
  const production = 1.1 / 20 + v.oxygenDeficit / 100 * 1.2 + (e.lactate ?? 0) / 20;
  const k = clearance / 20;
  v.lactate = approach(v.lactate, production / k, dt, 1 / k);
  v.renalAcid = approach(v.renalAcid, positive(1 - v.egfr / Math.min(b.egfr, 60)) * 5, dt, 240);
  v.bicarbonate = clamp(BICARBONATE - positive(v.lactate - 1.1) * 0.85 - v.renalAcid, 3, 36);
  v.ph = clamp(6.1 + Math.log10(v.bicarbonate / (0.03 * v.co2)), 6.5, 7.8);
  v.brainOxygen = clamp(v.brainPerfusion * v.oxygenContent / b.oxygenContent, 0, 100);
  const cerebral = positive(60 - v.brainOxygen) * 0.23;
  const consciousness = cerebral + v.brainDamage * 0.12 + v.liverDamage * 0.025 + v.sedation * 0.085
    + positive(3.5 - v.glucose) * 4 + positive(v.co2 - 60) * 0.09
    + positive(Math.abs(v.sodium - 140) - 12) * 0.15;
  v.gcs = clamp(15 - consciousness, 3, 15);
  v.eeg = clamp(10 + (e.stimulation ?? 0) * 0.1 - v.sedation * 0.08 - positive(12 - v.gcs) * 0.8, 1, 25);
}
