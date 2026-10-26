import { addFluid, SALINE, PRODUCT_CARRIER } from './fluids.js';
export const RESCUE_ACTIONS = {
  compress: '胸外按压', intubate: '建立气管导管', extubate: '移除气管导管',
  ventilate: '开启辅助通气', stopVentilation: '停止辅助通气', oxygen: '开启氧支持', stopOxygen: '停止氧支持',
  trainingArrest: '注入骤停训练情景', trainingApnea: '注入呼吸暂停训练情景', stopInfusions: '停止所有输注',
};
export function validateRescue(action, count = 1) {
  if (!Object.hasOwn(RESCUE_ACTIONS, action)) throw new Error('未知急救操作。');
  if (!Number.isInteger(count) || count < 1 || count > (action === 'compress' ? 12 : 1)) throw new Error('急救事件次数无效。');
}
export function createSupport() {
  return { intubated: false, ventilated: false, oxygen: false, arrest: false, apnea: false,
    training: false, compressions: 0, totalCompressions: 0, recovery: 0, collapse: 0,
    clotting: 0, platelets: 0, citrate: 0, transfusionK: 0, transfusionNa: 0 };
}
export function updateRescue(s, v, dt, effects = {}) {
  const wasArrest = s.arrest, wasApnea = s.apnea;
  if (!s.arrest) {
    const collapse = v.cardiacOutput < 0.3 || v.heartDamage >= 100;
    s.collapse = collapse ? s.collapse + dt : Math.max(0, s.collapse - dt);
    if (s.collapse >= 0.5) s.arrest = true;
  }
  if (!s.apnea && v.rr < 1) s.apnea = true;
  if (s.arrest) {
    // ROSC 是有条件的状态转换，单次点击或单次药物均不能直接复活。
    const causeReversible = s.training || ((effects.hr ?? 0) > -45 && v.potassium > 2.5 && v.potassium < 6.5);
    const viable = v.heartDamage < 70 && v.brainDamage < 100 && v.glucose > 2.5 && v.ph > 7.05;
    const supported = v.effectiveFlow > 1.2 && v.spo2 > 85;
    s.recovery = causeReversible && viable && supported ? s.recovery + dt * (1 + Math.min(1, effects.resuscitation ?? 0)) : Math.max(0, s.recovery - dt);
    if (s.recovery >= 0.5) { s.arrest = false; s.training = false; s.collapse = 0; s.recovery = 0; v.hr = 45; }
  }
  if (s.apnea && v.brainOxygen > 60 && v.brainDamage < 50 && v.sedation < 30 && (effects.resp ?? 0) > -8 && v.glucose > 2.5) {
    if (v.co2 < 65 && v.spo2 > 90 && s.ventilated) { s.apnea = false; v.rr = 8; }
  }
  v.cardiacArrest = Number(s.arrest);
  v.respiratoryArrest = Number(s.apnea);
  v.cprCount = s.totalCompressions;
  return { newArrest: !wasArrest && s.arrest, newApnea: !wasApnea && s.apnea, rosc: wasArrest && !s.arrest };
}

export function stepInfusions(infusions, support, values, dt) {
  for (const x of infusions) {
    const released = Math.min(x.remaining, x.amount / x.item.duration * dt);
    x.remaining -= released;
    const portion = released / x.item.reference, c = x.item.composition;
    addFluid(values, released / 1000, x.item.id === 'saline' ? SALINE : { ...PRODUCT_CARRIER, hemoglobin: c.hemoglobin ?? 0, albumin: ['plasma', 'whole-blood'].includes(x.item.id) ? 42 : 0 });
    support.clotting += (c.clotting ?? 0) * portion;
    support.platelets += (c.platelets ?? 0) * portion;
    support.citrate += (c.citrate ?? 0) * portion;
    support.transfusionK += (c.potassium ?? 0) * portion;
  }
  for (const [key, tau] of Object.entries({ clotting: 240, platelets: 1440, citrate: 25, transfusionK: 90, transfusionNa: 90 })) {
    support[key] *= Math.exp(-dt / tau);
  }
}
