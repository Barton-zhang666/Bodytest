import { addFluid, removeFluid, refillFromInterstitial, updateFluidDerived, distributionFactor, SALINE } from './fluids.js';
import { baselineAvailability, stepDrug } from './pharmacokinetics.js';
import { ITEM_BY_ID, validateEntry } from '../data/catalog.js';
import { BASE, METRICS, PROFILES } from '../data/metrics.js';
import { findInteractions } from '../data/interactions.js';
import { evaluateSymptoms } from './symptoms.js';

import { ORGAN_DAMAGE, accumulateInjury, assessLife } from './injury.js';
import { clearanceFor, forecastRemaining } from './activity.js';
import { createSupport, validateRescue, RESCUE_ACTIONS, stepInfusions, updateRescue } from './rescue.js';
import { stepInfections } from './infection.js';
import { initializePhysiology, stepCirculation, stepRespiration, stepMetabolism } from './physiology.js';

export const MODEL_VERSION = 5;
export const MAX_TIME = 10080;
export const STEP = 0.05;
const onGrid = t => Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6;
const LN2 = Math.log(2);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const approach = (x, target, dt, tau) => x + (target - x) * -Math.expm1(-dt / tau);
const response = x => 3 * Math.max(0, x) / (2 + Math.max(0, x));
const validateDrugRemoval = id => {
  if (typeof id !== 'string' || !Object.hasOwn(ITEM_BY_ID, id) || ITEM_BY_ID[id].kind !== 'drug') throw new Error('只能移除有效的药物条目。');
};
const LIMITS = {
  hr: [0, 240], rr: [0, 50], spo2: [0, 100], co2: [12, 160],
  glucose: [0.5, 35], potassium: [1.5, 9], sodium: [110, 170], magnesium: [0.2, 3], calcium: [1, 4],
  volume: [2.5, 8], ph: [6.5, 7.8], inr: [0.8, 12], sedation: [0, 100], liverReserve: [0, 100],
  egfr: [0.5, 140], gastric: [0, 100], motility: [0.1, 5], hemoglobin: [20, 230], temperature: [33, 42],
};

export class Simulator {
  constructor(profileId = 'healthy') {
    const profile = PROFILES.find(p => p.id === profileId);
    if (!profile) throw new Error('未知的模型基线。');
    this.profile = profile;
    this.base = { ...BASE, ...profile.values };
    initializePhysiology(this.base);
    this.values = { ...this.base };
    this.time = 0;
    this.pending = 0;
    this.doses = [];
    this.meals = [];
    this.infusions = []; this.infections = [];
    this.support = createSupport(); this.attentionRequired = false;
    this.pools = { caffeine: 0, alcohol: 0, grapefruit: 0, vitaminK: 0, potassium: 0, sodium: 0, calcium: 0, mineral: 0 };
    this.events = [];
    this.inputs = [];
    this.history = [];
    this.interactions = [];
    this.exposures = [];
    this.boundaries = [];
    this.symptoms = [];
    this.life = { status: 'alive', crisis: 0, cause: '', time: null };
    this.activityCache = new Map();
    this.symptoms = evaluateSymptoms(this.values);
    this.log('system', '实验已就绪', `${profile.name} · 70 kg 合成成人`);
    this.sample();
  }

  log(type, title, detail = '') {
    this.events.push({ time: this.time, type, title, detail });
    if (this.events.length > 300) this.events.shift();
  }

  administerBatch(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 24) throw new Error('每批需要 1–24 项干预。');
    if (this.life.status === 'dead') throw new Error('模型已死亡，无法继续干预；请导出记录或新建实验。');
    const normalized = entries.map(validateEntry);
    if (this.inputs.length >= 12000 || this.doses.length + this.meals.length + this.infusions.length + entries.length > 256) throw new Error('已达到实验记录容量，请导出后新建实验。');
    if (this.time >= MAX_TIME) throw new Error('本次实验已到达 7 天模型上限，请导出后新建实验。');
    // 同批中同一项目合并校验，避免通过重复行绕过模型输入上限。
    const totals = new Map();
    for (const entry of normalized) totals.set(entry.id, (totals.get(entry.id) ?? 0) + entry.amount);
    for (const [id, amount] of totals) validateEntry({ id, amount });
    // 不同浓度不可丢失；纯药量旧记录仍按原算法合并，保证当前模型重放一致。
    const legacy = new Map();
    for (const entry of normalized.filter(x => x.volume === undefined)) legacy.set(entry.id, (legacy.get(entry.id) ?? 0) + entry.amount);
    const batch = [...legacy].map(([id, amount]) => ({ id, amount })).concat(normalized.filter(x => x.volume !== undefined));
    this.inputs.push({ time: this.time, entries: batch });
    for (const entry of batch) {
      const item = ITEM_BY_ID[entry.id];
      if (item.kind === 'drug') this.doses.push({ ...entry, time: this.time,
        gut: item.intravenous ? 0 : entry.amount, central: item.intravenous && !item.infusionMinutes ? entry.amount : 0,
        delayRemaining: item.onsetDelay ?? 0, reservoir: item.infusionMinutes ? entry.amount : 0, effect: 0, eliminated: 0, discarded: 0,
        ...(entry.volume === undefined ? {} : { fluidRemaining: entry.volume, fluidDelivered: 0, fluidDiscarded: 0 }) });
      else if (item.kind === 'food') this.meals.push({ ...entry, time: this.time, remaining: entry.amount });
      else if (item.kind === 'product') this.infusions.push({ ...entry, item, time: this.time, remaining: entry.amount });
      else {
        const existing = this.infections.find(x => x.item.id === item.id);
        if (existing) existing.load = Math.min(100, existing.load + entry.amount);
        else this.infections.push({ item, load: entry.amount, immune: 0, treatment: 0 });
      }
      this.log('intake', `${item.name} ${entry.amount} ${item.unit}`, `${item.route} · ${item.category}${entry.volume === undefined ? '' : ` · ${entry.concentration} ${item.unit}/mL × ${entry.volume} mL${item.infusionMinutes ? ` · ${item.infusionMinutes} min 分时泵入` : ''}`}`);
    }
    return batch;
  }

  removeDrug(id) {
    validateDrugRemoval(id);
    if (this.life.status === 'dead' || this.time >= MAX_TIME) throw new Error('实验已终止，不能移除药物。');
    if (this.inputs.length >= 12000) throw new Error('事件容量已满，请导出后新建实验。');
    if (!this.doses.some(d => d.id === id)) throw new Error('模型中已没有该药物。');
    // 实验编辑事件，不是临床解毒：清除此药所有批次、效应室及未输入载液。
    // 不回滚已输入的液体、已经变化的体征、损伤或历史记录。
    this.inputs.push({ time: this.time, removeDrug: id });
    this.doses = this.doses.filter(d => d.id !== id);
    this.exposures = this.exposures.filter(x => x.item.id !== id);
    this.interactions = findInteractions(this.exposures);
    this.activityCache.delete(id);
    this.log('system', `移除药物：${ITEM_BY_ID[id].name}`, '已清除该药全部批次、残留活性及未输入部分；既有体征变化与器官损伤保留，随后按剩余条件演化。');
  }

  performRescue(action, count = 1) {
    validateRescue(action, count);
    if (this.life.status === 'dead' || this.time >= MAX_TIME) throw new Error('实验已终止，不能继续急救。');
    if (this.inputs.length >= 12000) throw new Error('事件容量已满，请导出后新建实验。');
    if (action === 'ventilate' && !this.support.intubated) throw new Error('请先建立模拟气道；插管后需另外开启辅助通气。');
    if (action === 'compress' && !this.support.arrest) throw new Error('当前仍有自主循环，模型未执行胸外按压。');
    if (action === 'compress' && this.support.compressions + count > 12) return;
    const last = this.inputs.at(-1);
    if (action === 'compress' && last?.action === action && last.time === this.time && last.count + count <= 12) last.count += count;
    else this.inputs.push({ time: this.time, action, count });
    const r = this.support;
    if (action === 'compress') { r.compressions += count; r.totalCompressions += count; this.values.cprCount = r.totalCompressions; }
    if (action === 'intubate') r.intubated = true;
    if (action === 'extubate') { r.intubated = false; r.ventilated = false; }
    if (action === 'ventilate') r.ventilated = true;
    if (action === 'stopVentilation') r.ventilated = false;
    if (action === 'oxygen') r.oxygen = true;
    if (action === 'stopOxygen') r.oxygen = false;
    if (action === 'trainingArrest') { r.arrest = true; r.training = true; for (const key of ['hr', 'cardiacOutput', 'effectiveFlow', 'cprFlow', 'oxygenDelivery', 'oxygenUse', 'pulseSignal', 'brainPerfusion', 'renalPerfusion', 'brainOxygen']) this.values[key] = 0; this.values.map = this.values.cvp; this.values.sbp = this.values.cvp; this.values.dbp = this.values.cvp; this.values.oxygenDeficit = 100; this.values.cardiacArrest = 1; this.life.status = 'arrest'; }
    if (action === 'trainingApnea') { r.apnea = true; this.values.rr = 0; this.values.ventilationRate = r.ventilated ? 12 : 0; this.values.respiratoryArrest = 1; this.life.status = 'apnea'; }
    if (action === 'stopInfusions') {
      this.infusions = [];
      for (const d of this.doses) {
        d.discarded += d.reservoir ?? 0; d.reservoir = 0;
        if (ITEM_BY_ID[d.id].infusionMinutes && d.fluidRemaining !== undefined) { d.fluidDiscarded += d.fluidRemaining; d.fluidRemaining = 0; }
      }
      this.activityCache.clear();
    }
    if (action !== 'compress') this.log('rescue', RESCUE_ACTIONS[action], '教学操作已记录；可逆状态仍可继续干预。');
  }

  preview(entries) {
    const items = new Map(this.exposures.map(x => [x.item.id, { item: x.item, strength: 1 }]));
    for (const entry of entries) if (ITEM_BY_ID[entry.id]) items.set(entry.id, { item: ITEM_BY_ID[entry.id], strength: 1 });
    // 已服下但还未吸收的药物也必须出现在组合预览里。
    for (const d of this.doses) if (d.gut > 0.01) items.set(d.id, { item: ITEM_BY_ID[d.id], strength: 1 });
    for (const m of this.meals) if (m.remaining > 0.1) items.set(m.id, { item: ITEM_BY_ID[m.id], strength: 1 });
    return findInteractions([...items.values()]);
  }

  advance(minutes, { stopOnCrisis = false } = {}) {
    this.attentionRequired = false;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 || minutes > MAX_TIME) throw new Error('无效的模拟时间。');
    if (this.life.status === 'dead') return;
    this.pending = Math.min(this.pending + minutes, MAX_TIME - this.time);
    while (this.pending >= STEP - 1e-9 && this.time < MAX_TIME && this.life.status !== 'dead') {
      this.step(STEP);
      this.pending = this.life.status === 'dead' ? 0 : Math.max(0, this.pending - STEP);
      if (stopOnCrisis && this.attentionRequired) { this.pending = 0; break; }
    }
  }

  step(dt) {
    if (this.life.status === 'dead') return;
    const v = this.values;
    const b = this.base;
    const e = {};
    const add = (key, value) => { e[key] = (e[key] ?? 0) + value; };
    const get = key => e[key] ?? 0;
    const flux = { carbs: 0, water: 0 };
    const half = { caffeine: 300, alcohol: 100, grapefruit: 720, vitaminK: 720, potassium: 180, sodium: 240, calcium: 360, mineral: 90 };
    for (const key of Object.keys(this.pools)) this.pools[key] *= Math.exp(-LN2 * dt / half[key]);
    let stomach = 0;
    const carbBlock = this.exposures.reduce((sum, x) => sum + (x.item.effects?.carbBlock ?? 0) * x.strength, 0);
    for (const meal of this.meals) {
      const item = ITEM_BY_ID[meal.id];
      const n = item.nutrients;
      const digestion = (n.simple ? 12 : 30) + n.fat * 1.8 + n.fiber * 4 + n.protein * 0.6;
      const released = meal.remaining * -Math.expm1(-LN2 * dt * clamp(v.motility, 0.3, 2) / (digestion * (n.simple ? 1 : 1 + carbBlock)));
      meal.remaining -= released;
      const portion = released / item.reference;
      flux.carbs += n.carbs * portion / dt;
      flux.water += n.water * portion / dt;
      for (const key of ['caffeine', 'alcohol', 'vitaminK', 'potassium', 'sodium', 'calcium']) this.pools[key] += (n[key] ?? 0) * portion;
      if (item.tags.includes('grapefruit')) this.pools.grapefruit += portion;
      if (item.tags.includes('mineral')) this.pools.mineral += portion;
      stomach += meal.remaining;
    }
    const strengths = new Map();
    const mineralGut = this.meals.filter(m => ITEM_BY_ID[m.id].tags.includes('mineral')).reduce((s, m) => s + m.remaining / ITEM_BY_ID[m.id].reference, 0)
      + this.doses.filter(d => ITEM_BY_ID[d.id].tags.includes('mineral')).reduce((s, d) => s + d.gut / ITEM_BY_ID[d.id].reference, 0);
    for (const dose of this.doses) {
      const item = ITEM_BY_ID[dose.id];
      const clearance = clearanceFor(item, v, this.exposures);
      const baselineF = baselineAvailability(item);
      let bioavailability = baselineF;
      if (item.tags.includes('cyp3a4')) bioavailability = Math.min(1, baselineF * (1 + 0.6 * response(this.pools.grapefruit)));
      if (item.tags.includes('chelatable')) bioavailability /= 1 + 0.9 * mineralGut;
      dose.bioavailability = bioavailability;
      const delivered = stepDrug(item, dose, dt, clearance, bioavailability, distributionFactor(item, v));
      if (dose.fluidRemaining > 0) {
        const liquid = Math.min(dose.fluidRemaining, item.infusionMinutes ? delivered / dose.concentration
          : item.intravenous ? dose.fluidRemaining : dose.fluidRemaining * -Math.expm1(-LN2 * dt / 20));
        dose.fluidRemaining -= liquid; dose.fluidDelivered += liquid;
        if (item.intravenous) addFluid(v, liquid / 1000, SALINE);
        else flux.water += liquid / dt;
      }
      strengths.set(item.id, (strengths.get(item.id) ?? 0) + dose.effect);
    }
    this.exposures = [...strengths].map(([id, exposure]) => ({ item: ITEM_BY_ID[id], exposure, strength: response(exposure) })).filter(x => x.strength > 0.0001);
    const opioidBlock = this.exposures.reduce((sum, x) => sum + (x.item.effects.opioidAntagonist ?? 0) * x.strength, 0);
    for (const x of this.exposures) {
      const effectiveness = x.item.tags.includes('opioid') ? 1 / (1 + opioidBlock * 3) : 1;
      for (const [key, value] of Object.entries(x.item.effects)) add(key, value * x.strength * effectiveness);
      const excess = Math.max(0, x.exposure - 2);
      if (x.item.id === 'paracetamol') add('hepaticDamage', excess * 0.04);
      if (x.item.id === 'simvastatin') add('hepaticDamage', excess * 0.007);
      if (x.item.id === 'theophylline') add('qt', excess * 12);
      if (x.item.id === 'metformin' && v.egfr < 35) add('lactate', x.strength * (35 - v.egfr) / 15);
    }
    const foodExposure = [
      ['coffee', this.pools.caffeine / 90], ['beer', this.pools.alcohol / 13],
      ['grapefruit', this.pools.grapefruit], ['spinach', this.pools.vitaminK / 400],
      ['milk', this.pools.mineral],
    ].map(([id, x]) => ({ item: ITEM_BY_ID[id], exposure: x, strength: response(x) })).filter(x => x.strength > 0.035);
    const highPotassium = response(this.pools.potassium / 1500);
    if (highPotassium > 0.035) foodExposure.push({ item: ITEM_BY_ID.banana, exposure: this.pools.potassium / 1500, strength: highPotassium });
    this.exposures.push(...foodExposure);
    const previousInteractions = new Set(this.interactions.map(x => x.id));
    this.interactions = findInteractions(this.exposures);
    for (const interaction of this.interactions) {
      for (const [key, value] of Object.entries(interaction.effects)) add(key, value * interaction.strength);
      if (!previousInteractions.has(interaction.id)) this.log('interaction', interaction.name, interaction.explanation);
    }
    const caffeine = response(this.pools.caffeine / 90);
    const alcohol = response(this.pools.alcohol / 13);
    add('hr', caffeine * 5); add('stimulation', caffeine * 10);
    add('sedation', alcohol * 13); add('resp', -alcohol * 1.2); add('irritation', alcohol * 7);
    add('insulin', alcohol * 0.14);
    for (const [key, value] of Object.entries(stepInfections(this.infections, this.exposures, v, dt))) add(key, value);
    stepInfusions(this.infusions, this.support, v, dt);
    const filtration = clamp(v.egfr / b.egfr, 0, 1);
    const fluidFlux = flux.water * 0.00023 - get('diuresis') * 0.0017 * filtration
      - Math.max(0, get('laxative') - 0.8) * 0.001
      - Math.max(0, v.glucose - 10) * 0.00015 * filtration - v.inflammation * 0.000012;
    // 低肾功能延缓多余容量排出，恢复项代表未显式建模的体液交换。
    // 吸收水与排液分别混合，不能只按两者净额计算而丢失稀释效应。
    addFluid(v, flux.water * 0.00023 * dt);
    removeFluid(v, Math.max(0, flux.water * 0.00023 - fluidFlux) * dt);
    // 过量部分由肾排出；不足部分是间质回填，不凭空补充 ECF 总量。
    const restore = (b.volume - v.volume) / 240 * (v.volume > b.volume ? filtration : 1) * dt;
    if (restore < 0) removeFluid(v, -restore);
    else refillFromInterstitial(v, restore);
    updateFluidDerived(v);
    const extraInsulin = get('insulin');
    v.glucose += (flux.carbs * 0.2 + (b.glucose * (1 - v.liverDamage * 0.005) - v.glucose) / (this.profile.id === 'diabetes' ? 100 : 65)
      + v.sympathetic * 0.015 - extraInsulin * 0.034 - get('glucoseLower') * Math.max(0, v.glucose - 5.2) * 0.004 + get('glucoseRaise') * 0.014) * dt;
    const renalRetention = clamp(100 / v.egfr, 0.8, 3);
    const targets = {
      sedation: clamp(get('sedation') - get('stimulation') * 0.3, 0, 100),
      sodium: b.sodium + get('na') + this.pools.sodium / 1000 * 1.2,
      potassium: b.potassium + get('k') * (get('k') > 0 ? renalRetention : 1) + this.pools.potassium / 1800 * renalRetention
        + this.support.transfusionK + Math.max(0, 7.35 - v.ph) * 0.8 + Math.max(0, 1 - v.egfr / b.egfr) * 0.7,
      chloride: b.chloride,
      magnesium: b.magnesium + get('mg'), calcium: b.calcium + get('ca') + this.pools.calcium / 8000 - this.support.citrate,
      urine: Math.max(0, b.urine + get('diuresis') * 75 + Math.max(0, v.glucose - 10) * 4 + Math.max(0, v.volume - b.volume) * 80) * v.renalPerfusion / 100,
      egfr: Math.max(0.5, b.egfr * v.renalPerfusion / 100 - get('renal')),
      gastric: Math.max(0, get('irritation') - get('gastroProtect') + Math.max(0, stomach - 600) * 0.025),
      inr: 1 + get('anticoag') / (1 + this.pools.vitaminK / 250),
      platelet: clamp(100 + get('platelet') + this.support.platelets, 5, 100),
      temperature: b.temperature + get('temp') - Math.min(Math.max(0, b.temperature + get('temp') - 36.7), get('antipyretic')),
      pain: Math.max(0, b.pain + get('pain')),
      motility: clamp(1 + get('laxative') - get('gutSlow'), 0.1, 5),
      ldl: Math.max(0.7, b.ldl + get('lipid')), allergy: Math.max(0, b.allergy + get('allergy')),
    };
    targets.egfr *= 1 - v.kidneyDamage * 0.0095;
    targets.urine *= 1 - v.kidneyDamage * 0.0095;
    // 损伤通过滤过反馈影响钾排泄，避免再按损伤分数重复叠加一次。
    targets.inr += v.liverDamage * 0.025;
    targets.inr = 1 + (targets.inr - 1) / (1 + this.support.clotting);
    targets.motility *= (1 - v.gutDamage * 0.008) * clamp(v.map / 60, 0.2, 1);
    const taus = { sedation: 7, chloride: 120, sodium: 120, potassium: 75, magnesium: 100, calcium: 100, urine: 3, egfr: 12, gastric: 20, inr: 180, platelet: 25, temperature: 45, pain: 12, motility: 30, ldl: 4320, allergy: 20 };
    for (const [key, target] of Object.entries(targets)) v[key] = approach(v[key], target, dt, taus[key]);
    v.stomach = stomach;
    v.insulin = 1 + extraInsulin + Math.max(0, v.glucose - b.glucose) * 0.25;
    v.bleedingRisk = clamp((v.inr - 1) * 14 + (100 - v.platelet) * 0.45 + get('directAnticoag') + get('bleed') + v.gastric * 0.12, 0, 100);
    if (v.bleedingRisk > 70) {
      const loss = (v.bleedingRisk - 70) * 0.045 * dt;
      v.bloodLoss += loss;
      removeFluid(v, loss / 1000, true);
    }
    updateFluidDerived(v);
    v.liverReserve = Math.max(0, 100 - v.liverDamage);
    // 先更新支持状态，再统一计算本步血流与通气，避免暂停快照出现“已骤停但仍有自主心输出”。
    const rescueChange = updateRescue(this.support, v, dt, e);
    stepCirculation(v, b, e, dt, this.support);
    this.support.compressions = 0;
    stepRespiration(v, b, e, dt, this.profile.airway ?? 0, this.support);
    stepMetabolism(v, b, e, dt);
    v.alt = approach(v.alt, 22 + (100 - v.liverReserve) * 6, dt, 180);
    v.qtc = 410 + get('qt') + Math.max(0, 3.8 - v.potassium) * 32 + Math.max(0, 0.8 - v.magnesium) * 85
      + Math.max(0, 2.1 - v.calcium) * 65 - Math.max(0, v.calcium - 2.6) * 35;
    // 高钾主要另行体现传导减慢，不再一律误映射为 QT 延长。
    v.qrs = 90 + Math.max(0, v.potassium - 6) * 30 + Math.max(0, 7.1 - v.ph) * 60;
    this.boundaries = [];
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!Number.isFinite(v[key])) throw new Error(`模型数值异常：${key}`);
      if (v[key] < min || v[key] > max) this.boundaries.push(key);
      v[key] = clamp(v[key], min, max);
    }
    updateFluidDerived(v);
    // 容量保护后重新计算比值，但不得覆盖刚执行的 Hb 数值保护。
    // 触及保护范围的实验仅保留质量账本，不解释为可实现的生理状态。
    v.hemoglobin = clamp(v.hemoglobin, ...LIMITS.hemoglobin);
    this.time = Math.round((this.time + dt) * 100) / 100;
    const priorFailures = new Set(ORGAN_DAMAGE.filter(o => v[o.key] >= 70).map(o => o.id));
    accumulateInjury(v, dt, get('hepaticDamage'));
    v.kidneyDamage = Math.min(100, v.kidneyDamage + get('renalToxicity') * dt);
    if (rescueChange.newArrest || rescueChange.newApnea) {
      this.attentionRequired = true;
      this.log('rescue', rescueChange.newArrest ? '心搏骤停 · 尚可施救' : '自主呼吸暂停 · 尚可施救', '停止不等于模型死亡。可使用急救面板提供循环或通气支持。');
    }
    if (rescueChange.rosc) this.log('rescue', '恢复自主循环（ROSC）', '已恢复自主心搏，仍需观察病因、灌注和脑损伤。');
    const failures = assessLife(v, this.life, dt);
    for (const o of failures) if (!priorFailures.has(o.id)) this.log('failure', o.name + '发生模型衰竭', o.signs + '；不可逆损伤已跨过模型阈值。');
    const prior = new Set(this.symptoms.map(s => s.id));
    const next = evaluateSymptoms(v, this.symptoms);
    const nextIds = new Set(next.map(s => s.id));
    for (const s of next) if (!prior.has(s.id)) this.log('symptom', `出现：${s.name}`, s.explanation);
    for (const s of this.symptoms) if (!nextIds.has(s.id)) this.log('recovery', `缓解：${s.name}`, '模型参数已跨过解除阈值。');
    this.symptoms = next;
    if (this.life.status === 'dead') {
      this.life.time = this.time;
      this.life.terminalValues = { ...v };
      this.log('death', '模型死亡 · 实验终止', this.life.cause);
      // 终止态仅将生命活动输出归零；生化值保留终末样本，不做尸后生理推演。
      for (const key of ['hr', 'sbp', 'dbp', 'map', 'strokeVolume', 'cardiacOutput', 'rr', 'eeg', 'urine', 'oxygenDelivery', 'oxygenUse', 'alveolarVentilation', 'brainPerfusion', 'renalPerfusion', 'brainOxygen', 'pulseSignal', 'effectiveFlow', 'cprFlow', 'ventilationRate']) v[key] = 0;
      this.sample();
      return;
    }
    if (this.time % 2 === 0) {
      this.sample();
      this.infusions = this.infusions.filter(x => x.remaining > 0);
      this.doses = this.doses.filter(d => (d.reservoir ?? 0) + d.gut + d.central > ITEM_BY_ID[d.id].reference * 0.00001 || d.effect > 0.0001);
      this.meals = this.meals.filter(m => m.remaining > 0.01);
    }
  }

  activeDrugStatus() {
    const groups = new Map();
    for (const d of this.doses) { if (!groups.has(d.id)) groups.set(d.id, []); groups.get(d.id).push(d); }
    return [...groups].map(([id, doses]) => {
      const item = ITEM_BY_ID[id];
      const clearance = clearanceFor(item, this.values, this.exposures);
      const bioavailability = doses.at(-1).bioavailability ?? baselineAvailability(item);
      const dilution = distributionFactor(item, this.values);
      const signature = doses.map(d => d.time + ':' + d.amount).join(',') + ':' + clearance.toFixed(2) + ':' + bioavailability.toFixed(2) + ':' + dilution.toFixed(3);
      let cached = this.activityCache.get(id);
      const exposure = doses.reduce((sum, d) => sum + d.effect, 0);
      if (!cached || cached.signature !== signature || (cached.end <= this.time && response(exposure) >= 0.15)) {
        const forecast = forecastRemaining(item, doses, clearance, bioavailability, dilution);
        cached = { signature, end: this.time + forecast.minutes, duration: this.time - doses[0].time + forecast.minutes, capped: forecast.capped };
        this.activityCache.set(id, cached);
      }
      const remaining = Math.max(0, cached.end - this.time);
      return { item, pendingAbsorption: doses.some(d => d.gut > item.reference * 0.01), exposure, strength: response(exposure), remaining, progress: cached.duration ? remaining / cached.duration : 0, capped: cached.capped, frozen: this.life.status === 'dead' };
    }).filter(x => x.remaining > 0 || x.strength >= 0.01);
  }

  sample() {
    this.history.push({ time: this.time, ...this.values });
    if (this.history.length > 1441) this.history.shift();
  }

  serialize() {
    return { version: MODEL_VERSION, profile: this.profile.id, time: this.time, pending: this.pending, inputs: structuredClone(this.inputs) };
  }

  exportReport() {
    return { ...this.serialize(), notice: '教学简化模型，未经临床验证；数据不得用于真实用药、诊断或急救。', life: structuredClone(this.life), support: structuredClone(this.support), infections: structuredClone(this.infections), infusions: structuredClone(this.infusions), values: { ...this.values }, metrics: METRICS, symptoms: this.symptoms, history: this.history, events: this.events };
  }

  static restore(data) {
    if (!data || data.version !== MODEL_VERSION || !Number.isFinite(data.time) || data.time < 0 || data.time > MAX_TIME || !onGrid(data.time) || !Array.isArray(data.inputs) || data.inputs.length > 12000) throw new Error('存档格式或模型版本不兼容。');
    if (data.pending !== undefined && (!Number.isFinite(data.pending) || data.pending < 0 || data.pending >= STEP)) throw new Error('存档时间余量无效。');
    let lastTime = 0;
    // 重放前完成全部校验，避免损坏导入触发不必要的大量计算。
    for (const input of data.inputs) {
      if (!input || !Number.isFinite(input.time) || input.time < lastTime || input.time > data.time || !onGrid(input.time)) throw new Error('存档包含无效的输入事件。');
      if (['action', 'entries', 'removeDrug'].filter(key => input[key] !== undefined).length !== 1) throw new Error('存档事件类型不明确。');
      if (input.removeDrug !== undefined) validateDrugRemoval(input.removeDrug);
      else if (input.action !== undefined) validateRescue(input.action, input.count);
      else {
        if (!Array.isArray(input.entries) || input.entries.length < 1 || input.entries.length > 24) throw new Error('干预事件无效。');
        input.entries.forEach(validateEntry);
      }
      lastTime = input.time;
    }
    const sim = new Simulator(data.profile);
    for (const input of data.inputs) {
      sim.advance(input.time - sim.time);
      if (input.removeDrug !== undefined) sim.removeDrug(input.removeDrug);
      else if (input.action !== undefined) sim.performRescue(input.action, input.count);
      else sim.administerBatch(input.entries);
    }
    sim.advance(data.time - sim.time);
    if (sim.time !== data.time || (sim.life.status === 'dead' && data.pending)) throw new Error('存档包含死亡后的无效时间。');
    sim.pending = data.pending ?? 0;
    return sim;
  }
}
