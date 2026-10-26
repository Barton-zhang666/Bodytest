import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, METRICS, PROFILES } from '../src/data/metrics.js';
import { Simulator, MODEL_VERSION } from '../src/engine/simulator.js';
import { oxygenBalance, oxygenContent, stepCirculation, stepRespiration, stepMetabolism } from '../src/engine/physiology.js';
import { clearanceFor } from '../src/engine/activity.js';
import { ITEM_BY_ID } from '../src/data/catalog.js';
import { accumulateInjury, assessLife } from '../src/engine/injury.js';
import { physiologySummary, pulseReading } from '../src/ui/physiology.js';

// 实验台直接施加生理扰动，独立于药物量效系数；用于验证方向和守恒关系。
function core(v, minutes, effects = {}) {
  for (let i = 0; i < minutes * 4; i++) {
    stepCirculation(v, BASE, effects, 0.25);
    stepRespiration(v, BASE, effects, 0.25);
    stepMetabolism(v, BASE, effects, 0.25);
  }
  return v;
}

test('氧含量和输送单位正确：贫血及低流量都不会被正常饱和度掩盖', () => {
  assert.ok(Math.abs(oxygenContent(150, 100, 100) - 20.4) < 1e-10);
  const anemia = { ...BASE, hemoglobin: 40 };
  oxygenBalance(anemia);
  assert.equal(anemia.spo2, BASE.spo2);
  assert.ok(anemia.oxygenContent < BASE.oxygenContent * 0.3);
  assert.ok(anemia.oxygenDeficit > 25);
  const lowFlow = { ...BASE, cardiacOutput: 1 };
  oxygenBalance(lowFlow);
  assert.ok(lowFlow.oxygenDeficit > 50);
  assert.equal(lowFlow.oxygenDelivery, lowFlow.cardiacOutput * lowFlow.oxygenContent * 10);
});

test('心率 10 时循环与脑肾供氧立即恶化；早期动脉血氧仍可能正常', () => {
  const v = core({ ...BASE, hr: 10 }, 0.25, { hr: -62, chronotropicBlock: 1e6 });
  assert.ok(v.hr < 11 && v.cardiacOutput < 1.2 && v.map < 35);
  assert.ok(v.spo2 > 94, '不能人为把动脉饱和度直接乘心率比例');
  assert.ok(v.oxygenDeficit > 50 && v.brainOxygen < 35 && v.renalPerfusion < 20);
  assert.ok(v.gcs < 10);
  assert.equal(pulseReading(v).text, '—');
  core(v, 8, { hr: -62, chronotropicBlock: 1e6 });
  assert.ok(v.lactate > 5 && v.ph < 7.3 && v.oxygenDebt > 800);
  // 此阶段仍可代偿性加深/加快呼吸，不能强制要求呼吸频率或深度下降。
  assert.ok(Math.abs(v.rr - BASE.rr) > 1 && v.brainstem < 0.8);
  assert.ok(v.deadSpace > BASE.deadSpace && v.co2 > 45);
  const life = { status: 'alive', crisis: 0 };
  assessLife(v, life, 0.25); assert.equal(life.status, 'critical');
  for (let i = 0; i < 32; i++) assessLife(v, life, 0.25);
  assert.equal(life.status, 'critical', '危重计时不能独立判定死亡');
  v.brainDamage = 100; assessLife(v, life, 0.25); assert.equal(life.status, 'dead');
});

test('中度心动过缓有有限代偿，不强制出现动脉低氧或组织氧债', () => {
  const v = core({ ...BASE, hr: 45 }, 20, { hr: -27, chronotropicBlock: 1e6 });
  assert.ok(v.strokeVolume > BASE.strokeVolume && v.strokeVolume < 115);
  assert.ok(v.svr > BASE.svr && v.map > 65);
  assert.ok(v.oxygenExtraction > BASE.oxygenExtraction && v.spo2 > 94);
  assert.equal(v.oxygenDeficit, 0); assert.equal(v.oxygenDebt, 0);
  assert.equal(v.gcs, 15);
});

test('明显心动过速受到充盈限制，心输出量不会无限随心率增长', () => {
  const v = core({ ...BASE, hr: 220 }, 20, { hr: 148, chronotropicBlock: 1e6 });
  assert.ok(v.strokeVolume < BASE.strokeVolume * 0.5);
  assert.ok(v.cardiacOutput < BASE.cardiacOutput);
});

test('浅呼吸即使频率正常也会减少肺泡通气并导致 CO₂ 潴留', () => {
  const v = { ...BASE, sedation: 70 };
  for (let i = 0; i < 40; i++) {
    v.rr = 16;
    stepRespiration(v, BASE, {}, 0.25);
    stepMetabolism(v, BASE, {}, 0.25);
  }
  assert.ok(v.rr >= 16 && v.rr < 20);
  assert.ok(v.tidalVolume < BASE.tidalVolume * 0.8 && v.alveolarVentilation < BASE.alveolarVentilation);
  assert.ok(v.co2 > 50 && v.ph < 7.35 && v.spo2 < BASE.spo2);
});

test('代谢酸负担引起呼吸代偿，镇静限制这一补偿', () => {
  const alert = { ...BASE }, sedated = { ...BASE, sedation: 65 };
  core(alert, 60, { lactate: 4 }); core(sedated, 60, { lactate: 4 });
  assert.ok(alert.bicarbonate < 22 && alert.rr > BASE.rr && alert.co2 < BASE.co2);
  assert.ok(sedated.co2 > alert.co2 && sedated.ph < alert.ph);
});

test('急性容量减少降低每搏量，反射同时提高心率与外周阻力', () => {
  const v = core({ ...BASE, volume: 3.8 }, 5);
  assert.ok(v.strokeVolume < BASE.strokeVolume && v.cardiacOutput < BASE.cardiacOutput);
  assert.ok(v.hr > BASE.hr && v.svr > BASE.svr);
  assert.ok(v.renalPerfusion < 70);
});

test('低灌注使尿量先于滤过率下降，随后影响电解质与清除', () => {
  const s = new Simulator(); s.values.volume = 3.5;
  s.advance(5);
  assert.ok(s.values.urine / BASE.urine < s.values.egfr / BASE.egfr);
  assert.ok(s.values.egfr < BASE.egfr && s.values.urine < 40);
  assert.ok(clearanceFor(ITEM_BY_ID.potassium, s.values, []) < clearanceFor(ITEM_BY_ID.potassium, BASE, []));
  s.advance(30);
  assert.ok(s.values.potassium > BASE.potassium);
});

test('严重高钾作用于泵血与传导，不能只增加一个风险标签', () => {
  const normal = new Simulator(), high = new Simulator();
  high.values.potassium = 8;
  normal.advance(1); high.advance(1);
  assert.ok(high.values.hr < normal.values.hr && high.values.strokeVolume < normal.values.strokeVolume);
  assert.ok(high.values.qrs > normal.values.qrs && high.values.cardiacOutput < normal.values.cardiacOutput);
  assert.ok(high.values.renalPerfusion < normal.values.renalPerfusion);
});

test('肝损伤同时影响葡萄糖维持、凝血、乳酸和药物清除', () => {
  const s = new Simulator(); s.values.liverDamage = 80; s.advance(180);
  assert.ok(s.values.glucose < 4 && s.values.inr > 1.5 && s.values.lactate > 2);
  assert.ok(clearanceFor(ITEM_BY_ID.diazepam, s.values, []) < 0.3);
});

test('高糖增加渗透性利尿，发热增加耗氧而不是只修改温度数字', () => {
  const sugar = new Simulator(); sugar.values.glucose = 20; sugar.advance(10);
  assert.ok(sugar.values.urine > BASE.urine && sugar.values.volume < BASE.volume);
  const hot = core({ ...BASE, temperature: 39.5 }, 10);
  assert.ok(hot.oxygenDemand > BASE.oxygenDemand && hot.hr > BASE.hr && hot.rr > BASE.rr);
});

test('低糖损害意识和呼吸驱动，脑损伤引起持续功能反馈', () => {
  const low = core({ ...BASE, glucose: 1 }, 10);
  assert.ok(low.gcs < 8 && low.brainstem < 0.8 && low.tidalVolume < BASE.tidalVolume);
  const brain = core({ ...BASE, brainDamage: 90 }, 10);
  assert.ok(brain.gcs < 8 && brain.brainstem < 0.5);
});

test('贫血供氧缺口会累积损伤；改善供氧可偿还氧债但不会修复损伤', () => {
  const v = { ...BASE, hemoglobin: 35 };
  oxygenBalance(v);
  for (let i = 0; i < 80; i++) { stepMetabolism(v, BASE, {}, 0.25); accumulateInjury(v, 0.25); }
  assert.ok(v.heartDamage > 0 && v.brainDamage > 0 && v.oxygenDebt > 0);
  const debt = v.oxygenDebt, damage = v.brainDamage;
  v.hemoglobin = BASE.hemoglobin;
  for (let i = 0; i < 80; i++) { stepMetabolism(v, BASE, {}, 0.25); accumulateInjury(v, 0.25); }
  assert.ok(v.oxygenDebt < debt && v.brainDamage >= damage);
});

test('全部预设长期有限且不会无干预自行死亡，低容量初始每搏量已降低', () => {
  assert.ok(new Simulator('dehydration').values.strokeVolume < BASE.strokeVolume);
  for (const profile of PROFILES) {
    const s = new Simulator(profile.id); s.advance(1440);
    assert.notEqual(s.life.status, 'dead', profile.id);
    for (const m of METRICS) assert.ok(Number.isFinite(s.values[m.id]), `${profile.id}:${m.id}`);
    assert.ok(Math.abs(s.values.map - (s.values.cvp + s.values.cardiacOutput * s.values.svr)) < 1e-8);
    assert.ok(Math.abs(s.values.oxygenDelivery - s.values.cardiacOutput * oxygenContent(s.values.hemoglobin, s.values.spo2, s.values.pao2) * 10) < 1e-8);
  }
});

test('药物引发的循环衰竭能贯穿到呼吸、尿量、意识与死亡，V5 重放一致', () => {
  const s = new Simulator();
  s.administerBatch(['metoprolol', 'bisoprolol', 'verapamil'].map(id => ({ id, amount: ITEM_BY_ID[id].reference * 10 })));
  s.advance(240);
  assert.equal(s.life.status, 'dead');
  const v = s.life.terminalValues;
  assert.ok(v.hr < 15 && v.cardiacOutput < 1 && v.urine < 10 && v.gcs < 8);
  assert.ok(v.co2 > 50 && v.oxygenDeficit > 50 && v.lactate > 3);
  assert.equal(MODEL_VERSION, 5);
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
  assert.throws(() => Simulator.restore({ ...s.serialize(), version: 2 }), /版本/);
});

test('血氧仪读数与内部动脉饱和度分离，终末说明使用终末前快照', () => {
  const v = { ...BASE, pulseSignal: 35, oxygenDeficit: 20 };
  assert.ok(pulseReading(v).unreliable);
  assert.match(pulseReading(v).text, /≈98/);
  assert.match(physiologySummary(v, { status: 'alive' }).description, /不能据此排除/);
  const terminal = physiologySummary({ ...v, cardiacOutput: 0 }, { status: 'dead', terminalValues: v });
  assert.equal(terminal.values.cardiacOutput, BASE.cardiacOutput);
  assert.match(terminal.title, /终末前/);
  assert.equal(pulseReading(BASE, true).text, '—');
});
