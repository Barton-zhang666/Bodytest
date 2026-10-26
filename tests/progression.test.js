import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/engine/simulator.js';
import { ORGAN_DAMAGE, accumulateInjury, assessLife } from '../src/engine/injury.js';
import { forecastRemaining, FORECAST_LIMIT } from '../src/engine/activity.js';
import { ITEM_BY_ID, CATALOG, validateEntry } from '../src/data/catalog.js';
import { BASE } from '../src/data/metrics.js';
import { evaluateSymptoms } from '../src/engine/symptoms.js';

test('全部项目允许 10 倍上限，拒绝超限、零量和重复行绕过', () => {
  for (const item of CATALOG) {
    assert.doesNotThrow(() => validateEntry({ id: item.id, amount: item.reference * 10 }));
    assert.throws(() => validateEntry({ id: item.id, amount: item.reference * 10.01 }));
  }
  const sim = new Simulator();
  assert.throws(() => sim.administerBatch([{ id: 'metoprolol', amount: 150 }, { id: 'metoprolol', amount: 150 }]));
  assert.equal(sim.inputs.length, 0);
});

test('持续重度异常累积不同器官损伤，解除异常也不会消除已经形成的损伤', () => {
  const values = { ...BASE, spo2: 70, map: 45, glucose: 2.2 };
  for (let i = 0; i < 400; i++) accumulateInjury(values, 0.25, 0.3);
  assert.ok(ORGAN_DAMAGE.every(o => values[o.key] > 0));
  const damage = Object.fromEntries(ORGAN_DAMAGE.map(o => [o.key, values[o.key]]));
  Object.assign(values, BASE, damage);
  for (let i = 0; i < 240; i++) accumulateInjury(values, 0.25);
  for (const o of ORGAN_DAMAGE) assert.ok(values[o.key] >= damage[o.key]);
});

test('器官衰竭影响功能并产生实际症状，阈值不会用可逆负担替代', () => {
  const s = new Simulator();
  s.values.kidneyDamage = 75; s.values.liverDamage = 75;
  s.advance(120);
  assert.ok(s.values.egfr < 40); assert.ok(s.values.urine < 25);
  assert.equal(s.values.liverReserve, 25);
  assert.ok(s.symptoms.some(x => x.id === 'kidneys-failure'));
  assert.ok(s.symptoms.some(x => x.id === 'jaundice' && x.kind === 'physical'));
  assert.ok(s.symptoms.some(x => x.id === 'oliguria' && x.kind === 'physical'));
  assert.equal(s.life.status, 'critical');
});

test('肝毒性输入可形成持续损伤并通过重复输入产生衰竭', () => {
  const s = new Simulator();
  s.administerBatch([{ id: 'paracetamol', amount: ITEM_BY_ID.paracetamol.reference * 10 }]);
  s.advance(720);
  const damage = s.values.liverDamage;
  assert.ok(damage > 0);
  s.administerBatch([{ id: 'paracetamol', amount: ITEM_BY_ID.paracetamol.reference * 10 }]);
  s.advance(1440);
  assert.ok(s.values.liverDamage > damage && s.values.liverDamage >= 70);
  assert.ok(s.events.some(e => e.type === 'failure'));
  const restored = Simulator.restore(s.serialize());
  assert.deepEqual(restored.values, s.values);
});

test('危重计时不再触发死亡，只有不可逆脑功能终末阈值终止', () => {
  const v = { ...BASE, glucose: 1 };
  const life = { status: 'alive', crisis: 0 };
  assessLife(v, life, 0.25); assert.equal(life.status, 'critical');
  assessLife(BASE, life, 1); assert.equal(life.status, 'alive');
  for (let i = 0; i < 32; i++) assessLife(v, life, 0.25);
  assert.equal(life.status, 'critical');
  v.heartDamage = 100; assessLife(v, life, 1); assert.notEqual(life.status, 'dead');
  v.brainDamage = 100; assessLife(v, life, 0.25); assert.equal(life.status, 'dead');
});

test('死亡停止给药、时间与积分，保留终末快照且存档可重放', () => {
  const s = new Simulator();
  s.administerBatch(['diazepam', 'morphine', 'lorazepam'].map(id => ({ id, amount: ITEM_BY_ID[id].reference * 10 })));
  s.advance(360);
  assert.equal(s.life.status, 'dead'); assert.ok(s.time < 360);
  assert.equal(s.values.hr, 0); assert.equal(s.values.rr, 0); assert.equal(s.values.eeg, 0);
  assert.ok(s.life.terminalValues.hr > 0); assert.equal(s.pending, 0);
  const snapshot = s.exportReport();
  s.advance(120); s.step(0.25);
  assert.deepEqual(s.exportReport(), snapshot);
  assert.throws(() => s.administerBatch([{ id: 'water', amount: 250 }]), /死亡/);
  const restored = Simulator.restore(s.serialize());
  assert.deepEqual(restored.life, s.life); assert.deepEqual(restored.values, s.values);
  assert.equal(s.events.filter(e => e.type === 'death').length, 1);
  assert.throws(() => Simulator.restore({ ...s.serialize(), time: s.time + 1 }));
  assert.ok(s.activeDrugStatus().every(x => x.frozen));
  assert.equal(new Simulator().life.status, 'alive');
});

test('药物双进度从等待吸收开始，时间递减而活性先升高，重复输入重估', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'metoprolol', amount: 25 }]);
  const initial = s.activeDrugStatus()[0];
  assert.equal(initial.strength, 0); assert.equal(initial.progress, 1); assert.ok(initial.remaining > 0);
  s.advance(60); const later = s.activeDrugStatus()[0];
  assert.ok(later.strength > 0); assert.ok(later.progress < 1);
  assert.ok(Math.abs(initial.remaining - later.remaining - 60) < 5);
  s.administerBatch([{ id: 'metoprolol', amount: 25 }]);
  const repeat = s.activeDrugStatus();
  assert.equal(repeat.length, 1); assert.ok(repeat[0].remaining > later.remaining);
});

test('预计时效纳入清除、延迟和长恢复，超长预测明确标记', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'potassium', amount: 500 }]); s.advance(60);
  const normal = s.activeDrugStatus()[0].remaining;
  s.values.egfr = 30;
  assert.ok(s.activeDrugStatus()[0].remaining > normal);
  const drug = ITEM_BY_ID.aspirin;
  const doses = [{ gut: 0, central: 0, effect: 1 }];
  const recovery = forecastRemaining(drug, doses, 1);
  const fast = forecastRemaining({ ...drug, recovery: drug.lag }, doses, 1);
  assert.ok(recovery.minutes > fast.minutes * 5);
  const capped = forecastRemaining({ ...drug, halfLife: 1e9 }, [{ gut: 0, central: 100, effect: 1 }], 1);
  assert.equal(capped.capped, true); assert.ok(capped.minutes >= FORECAST_LIMIT);
});

test('具体症状与实验室异常分组，正常状态不凭空生成症状', () => {
  assert.equal(evaluateSymptoms(BASE).length, 0);
  const symptoms = evaluateSymptoms({ ...BASE, glucose: 2, spo2: 80, gastric: 80 });
  assert.ok(symptoms.some(x => x.id === 'hypoglycemia' && x.kind === 'system'));
  assert.ok(['seizure', 'cyanosis', 'vomit'].every(id => symptoms.some(x => x.id === id && x.kind === 'physical')));
});
