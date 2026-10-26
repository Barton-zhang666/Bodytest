import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator, MODEL_VERSION } from '../src/engine/simulator.js';
import { CATALOG, DRUGS, FOODS } from '../src/data/catalog.js';
import { METRICS } from '../src/data/metrics.js';

const give = (sim, id, amount) => sim.administerBatch([{ id, amount }]);
test('健康基线在 24 小时内稳定', () => {
  const sim = new Simulator(); const before = { ...sim.values };
  sim.advance(1440);
  for (const m of METRICS) assert.ok(Math.abs(sim.values[m.id] - before[m.id]) < 1e-8, m.id);
  assert.equal(sim.symptoms.length, 0);
});
test('药物吸收后起效、随清除消退', () => {
  const sim = new Simulator(); give(sim, 'metoprolol', 25);
  assert.equal(sim.values.hr, 72);
  sim.advance(90); const hr = sim.values.hr;
  assert.ok(hr < 65); assert.ok(sim.values.sbp < 114);
  sim.advance(2000); assert.ok(sim.values.hr > hr + 6);
});
test('重复给药累积，肾功能下降延缓肾清除', () => {
  const one = new Simulator(); const two = new Simulator();
  give(one, 'metoprolol', 25); give(two, 'metoprolol', 25);
  one.advance(60); two.advance(60); give(two, 'metoprolol', 25);
  one.advance(90); two.advance(90); assert.ok(two.values.hr < one.values.hr);
  const healthy = new Simulator(); const renal = new Simulator('renal');
  give(healthy, 'potassium', 500); give(renal, 'potassium', 500);
  healthy.advance(360); renal.advance(360);
  assert.ok(renal.doses[0].central > healthy.doses[0].central);
});
test('利尿改变尿量、循环容量与血钾', () => {
  const sim = new Simulator(); give(sim, 'furosemide', 80); sim.advance(240);
  assert.ok(sim.values.urine > 70); assert.ok(sim.values.volume < 4.7);
  assert.ok(sim.values.potassium < 3.7);
  assert.ok(sim.symptoms.some(s => s.id === 'hypokalemia'));
  sim.advance(1440);
  assert.ok(!sim.symptoms.some(s => s.id === 'hypokalemia'));
  assert.ok(sim.events.some(e => e.type === 'recovery' && e.title.includes('低钾')));
});
test('糖类经消化升糖且两倍份量响应更大', () => {
  const one = new Simulator(); const two = new Simulator();
  give(one, 'glucose', 200); give(two, 'glucose', 400);
  assert.equal(one.values.glucose, 5.2);
  one.advance(30); two.advance(30);
  assert.ok(one.values.glucose > 6); assert.ok(two.values.glucose > one.values.glucose);
});
test('促胰岛素药触发低血糖，健康基线二甲双胍不直接致低血糖', () => {
  const sim = new Simulator(); give(sim, 'glipizide', 20); sim.advance(240);
  assert.ok(sim.values.glucose < 3.9); assert.ok(sim.symptoms.some(s => s.id === 'hypoglycemia'));
  const met = new Simulator(); give(met, 'metformin', 1000); met.advance(720);
  assert.ok(met.values.glucose >= 5.19);
});
test('镇静叠加既有提示又产生额外呼吸抑制', () => {
  const single = new Simulator(); const combo = new Simulator();
  give(single, 'diazepam', 5);
  combo.administerBatch([{ id: 'diazepam', amount: 5 }, { id: 'morphine', amount: 10 }]);
  assert.ok(combo.preview([]).some(i => i.id === 'sedative'));
  single.advance(120); combo.advance(120);
  assert.ok(combo.interactions.some(i => i.id === 'sedative'));
  assert.ok(combo.values.rr < single.values.rr - 3);
  assert.ok(combo.values.sedation > single.values.sedation);
});
test('华法林效应延迟，直接 Xa 抑制剂不机械增加 INR', () => {
  const sim = new Simulator(); give(sim, 'warfarin', 5);
  sim.advance(15); assert.ok(sim.values.inr < 1.02);
  sim.advance(1425); assert.ok(sim.values.inr > 1.4);
  const direct = new Simulator(); give(direct, 'rivaroxaban', 10); direct.advance(120);
  assert.equal(direct.values.inr, 1); assert.ok(direct.values.bleedingRisk > 5);
});
test('出血倾向与实际模拟失血分开建模，失血影响血红蛋白', () => {
  const sim = new Simulator();
  sim.administerBatch([{ id: 'warfarin', amount: 10 }, { id: 'aspirin', amount: 400 }, { id: 'rivaroxaban', amount: 20 }]);
  sim.advance(15); assert.equal(sim.values.bloodLoss, 0);
  sim.advance(1425);
  assert.ok(sim.values.bleedingRisk > 70); assert.ok(sim.values.bloodLoss > 0);
  assert.ok(sim.values.hemoglobin < 145); assert.ok(sim.symptoms.some(s => s.id === 'bleeding'));
});
test('肾功能下降时保钾与补钾组合产生高钾响应', () => {
  const sim = new Simulator('renal');
  sim.administerBatch([{ id: 'spironolactone', amount: 50 }, { id: 'potassium', amount: 1000 }]);
  sim.advance(720);
  assert.ok(sim.interactions.some(i => i.id === 'potassium'));
  assert.ok(sim.values.potassium > 5.3); assert.ok(sim.symptoms.some(s => s.id === 'hyperkalemia'));
});
test('西柚增加指定底物暴露，矿物质减少指定药物吸收', () => {
  const plain = new Simulator(); const fruit = new Simulator();
  give(fruit, 'grapefruit', 200); fruit.advance(60); plain.advance(60);
  give(plain, 'nifedipine', 10); give(fruit, 'nifedipine', 10);
  plain.advance(120); fruit.advance(120);
  assert.ok(fruit.doses[0].central > plain.doses[0].central);
  const a = new Simulator(); const b = new Simulator();
  give(a, 'doxycycline', 100); b.administerBatch([{ id: 'doxycycline', amount: 100 }, { id: 'milk', amount: 500 }]);
  a.advance(120); b.advance(120); assert.ok(b.doses[0].central < a.doses[0].central);
});
test('批量校验原子性：坏输入、NaN、重复行上限不部分提交', () => {
  const sim = new Simulator();
  for (const bad of [NaN, Infinity, -1, 0, '25']) assert.throws(() => sim.administerBatch([{ id: 'metoprolol', amount: 25 }, { id: 'rice', amount: bad }]));
  assert.throws(() => sim.administerBatch([{ id: 'metoprolol', amount: 300 }, { id: 'metoprolol', amount: 300 }]));
  assert.equal(sim.doses.length, 0); assert.equal(sim.inputs.length, 0);
});
test('药物物质量守恒，首过代谢修饰不凭空增加药物', () => {
  const sim = new Simulator();
  give(sim, 'grapefruit', 2000); sim.advance(120); give(sim, 'nifedipine', 100); sim.advance(60);
  const d = sim.doses[0];
  assert.ok(d.central <= d.amount);
  assert.ok(Math.abs(d.gut + d.central + d.eliminated - d.amount) < 1e-8);
});
test('固定步长不受帧分片影响，存档可确定性重放', () => {
  const sim = new Simulator(); sim.administerBatch([{ id: 'rice', amount: 150 }, { id: 'glipizide', amount: 5 }]);
  for (let i = 0; i < 100; i++) sim.advance(0.1);
  const direct = new Simulator(); direct.administerBatch([{ id: 'rice', amount: 150 }, { id: 'glipizide', amount: 5 }]); direct.advance(10);
  assert.deepEqual(sim.values, direct.values);
  sim.advance(50); give(sim, 'coffee', 200); sim.advance(130.12);
  const restored = Simulator.restore(JSON.parse(JSON.stringify(sim.serialize())));
  assert.deepEqual(restored.values, sim.values); assert.deepEqual(restored.inputs, sim.inputs); assert.equal(restored.pending, sim.pending);
});
test('拒绝损坏或过大存档与非有限时间', () => {
  assert.throws(() => Simulator.restore({ version: MODEL_VERSION, profile: 'healthy', time: Infinity, inputs: [] }));
  assert.throws(() => Simulator.restore({ version: MODEL_VERSION, profile: 'healthy', time: 10, inputs: [{ time: 11, entries: [] }] }));
  assert.throws(() => new Simulator().advance(NaN));
});
test('全部目录项目可运行，所有指标保持有限', () => {
  assert.ok(DRUGS.length >= 40); assert.ok(FOODS.length >= 16);
  assert.equal(new Set(CATALOG.map(x => x.id)).size, CATALOG.length);
  for (const item of CATALOG) {
    const sim = new Simulator(); give(sim, item.id, item.reference * 3); sim.advance(360);
    for (const metric of METRICS) assert.ok(Number.isFinite(sim.values[metric.id]), `${item.id}:${metric.id}`);
  }
});
test('极端组合长期运算有界，历史与事件数量受限', () => {
  const sim = new Simulator('renal');
  sim.administerBatch(DRUGS.slice(0, 24).map(item => ({ id: item.id, amount: item.reference * 10 })));
  sim.advance(4320);
  for (const metric of METRICS) assert.ok(Number.isFinite(sim.values[metric.id]), metric.id);
  assert.ok(sim.history.length <= 1441); assert.ok(sim.events.length <= 300);
  assert.ok(sim.life.status === 'dead' ? sim.values.sbp === 0 && sim.values.dbp === 0 : sim.values.sbp > sim.values.dbp);
});
