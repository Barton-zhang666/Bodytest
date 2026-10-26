import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator, STEP } from '../src/engine/simulator.js';
import { DRUGS, ITEM_BY_ID } from '../src/data/catalog.js';
import { addFluid, removeFluid, distributionFactor, SALINE, PRODUCT_CARRIER, SOLUTES } from '../src/engine/fluids.js';
import { stepDrug } from '../src/engine/pharmacokinetics.js';
import { forecastRemaining } from '../src/engine/activity.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('盐水混合守恒：钾糖蛋白稀释，钠氯按输入成分改变，不统一乘血容量比例', () => {
  const v = new Simulator().values, before = { ...v };
  addFluid(v, 1, SALINE);
  near(v.volume, 6); near(v.ecfVolume, 15); near(v.redCellMass, before.redCellMass);
  for (const key of SOLUTES) near(v[key] * v.ecfVolume, before[key] * before.ecfVolume + (SALINE[key] ?? 0));
  near(v.hemoglobin * v.volume, before.hemoglobin * before.volume);
  near(v.albumin * v.plasmaVolume, before.albuminMass);
  for (const key of ['alt', 'ldl']) near(v[key] * v.plasmaVolume, before[key] * before.plasmaVolume);
  assert.ok(v.sodium > before.sodium && v.chloride > before.chloride);
  assert.ok(v.potassium < before.potassium && v.glucose < before.glucose && v.albumin < before.albumin);
  assert.notEqual(v.potassium / before.potassium, before.volume / v.volume);
  assert.equal(v.inr, before.inr); assert.equal(v.platelet, before.platelet);
});

test('纯水、血浆及红细胞按各自成分混合；输注不会凭空删除蛋白或红细胞质量', () => {
  const water = new Simulator().values, plasma = new Simulator().values, cells = new Simulator().values;
  addFluid(water, 1); addFluid(plasma, 1, { ...PRODUCT_CARRIER, albumin: 42 });
  addFluid(cells, 1, { ...PRODUCT_CARRIER, hemoglobin: 250 });
  assert.ok(water.sodium < 140); near(plasma.albumin, 42); near(plasma.sodium, 140);
  near(cells.redCellMass, 975); assert.ok(cells.hemoglobin > 145);
  near(cells.ecfVolume, 14 + 1 - 250 / 330);
});

test('等渗排液浓缩蛋白，急性全血丢失不立即改变 Hb 浓度；回填与补液才稀释', () => {
  const isotonic = new Simulator().values, bleed = new Simulator().values;
  removeFluid(isotonic, 0.5); removeFluid(bleed, 0.5, true);
  near(isotonic.potassium, 4.2); assert.ok(isotonic.hemoglobin > 145 && isotonic.albumin > 42);
  near(bleed.hemoglobin, 145); near(bleed.albumin, 42); near(bleed.potassium, 4.2);
  near(bleed.redCellMass, 145 * 4.5);
  addFluid(bleed, 0.5, SALINE); assert.ok(bleed.hemoglobin < 145 && bleed.albumin < 42);
});

test('实际分时盐水输入联动浓度与携氧，确定性重放保留新体液状态', () => {
  const control = new Simulator(), infused = new Simulator();
  infused.administerBatch([{ id: 'saline', amount: 2000 }]);
  control.advance(20); infused.advance(20);
  assert.ok(infused.values.volume > control.values.volume);
  for (const key of ['potassium', 'glucose', 'hemoglobin', 'albumin', 'oxygenContent']) assert.ok(infused.values[key] < control.values[key], key);
  assert.ok(infused.values.sodium > control.values.sodium);
  assert.ok(infused.values.chloride > control.values.chloride);
  assert.deepEqual(Simulator.restore(infused.serialize()).exportReport(), infused.exportReport());
});

test('药物物质量与稀释后的相对暴露分开，局部药不受全身体液稀释', () => {
  const v = new Simulator().values;
  const a = { amount: 1, gut: 0, central: 1, effect: 0 }, b = { ...a };
  const drug = ITEM_BY_ID.epinephrine;
  stepDrug(drug, a, STEP, 1, 1, distributionFactor(drug, v));
  addFluid(v, 1, SALINE);
  stepDrug(drug, b, STEP, 1, 1, distributionFactor(drug, v));
  near(a.central, b.central); near(a.eliminated, b.eliminated); assert.ok(b.effect < a.effect);
  near(a.central + a.eliminated, 1); near(distributionFactor(ITEM_BY_ID.lactulose, v), 1);
});

test('乳果糖局部转运延迟且质量守恒；余时包含待转运阶段，实际步进与预测一致', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'lactulose', amount: 10 }]);
  const initial = s.activeDrugStatus()[0].remaining;
  s.advance(600);
  const d = s.doses[0]; near(d.gut, 10); near(d.central, 0); near(d.effect, 0);
  assert.ok(s.activeDrugStatus()[0].remaining < initial);
  s.advance(1200);
  assert.ok(d.central > 0 && d.effect > 0);
  near(d.gut + d.central + d.eliminated, 10);
  const item = ITEM_BY_ID.lactulose;
  const forecast = forecastRemaining(item, [d], 1, 1);
  const projected = { ...d }; let actual = 0;
  const threshold = 2 * 0.15 / (3 - 0.15);
  while (Math.max(projected.gut / 10, projected.central / 10, projected.effect) >= threshold) {
    stepDrug(item, projected, 5, 1, 1); actual += 5;
  }
  near(actual, forecast.minutes);
});

test('低于作用阈值的残留不再显示冗长余时，但不会被强行清零', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'dopamine', amount: 1 }]); s.advance(1);
  s.performRescue('stopInfusions'); const status = s.activeDrugStatus()[0];
  near(status.remaining, 0); assert.ok(status.strength > 0 && status.strength < 0.15);
  s.advance(STEP); assert.ok(s.exposures.some(x => x.item.id === 'dopamine' && x.strength > 0));
});

test('新升压药均可独立投放，药物有主要作用说明且不归入急救或感染情景', () => {
  for (const item of DRUGS) {
    assert.ok(item.primaryAction && item.primaryActionDetail);
    assert.ok(!['急救与循环支持', '抗感染', '感染情景'].includes(item.category));
    assert.doesNotThrow(() => new Simulator().administerBatch([{ id: item.id, amount: item.reference }]));
  }
  for (const id of ['midodrine', 'phenylephrine']) {
    const s = new Simulator(); s.administerBatch([{ id, amount: ITEM_BY_ID[id].reference }]);
    s.advance(id === 'midodrine' ? 90 : 2);
    assert.ok(s.values.sbp > s.base.sbp + 3);
    assert.equal(s.infections.length, 0); assert.equal(s.support.arrest, false);
  }
});

test('V5 拒绝 V4 记录，避免更改旧实验含义', () => {
  assert.throws(() => Simulator.restore({ ...new Simulator().serialize(), version: 4 }), /版本/);
});

test('容量重新计算不能绕过既有血红蛋白数值保护', () => {
  const s = new Simulator(); s.values.redCellMass = 1500;
  s.advance(STEP);
  assert.ok(s.values.hemoglobin <= 230);
  assert.ok(s.boundaries.includes('hemoglobin'));
});
