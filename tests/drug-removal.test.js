import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator, STEP, MAX_TIME } from '../src/engine/simulator.js';
import { defaultEntry } from '../src/data/delivery.js';
import { ITEM_BY_ID } from '../src/data/catalog.js';

test('移除同名药物的所有批次、效应和相互作用，保留其他药物及已有体征', () => {
  const s = new Simulator();
  s.administerBatch([{ id: 'diazepam', amount: 5 }, { id: 'lorazepam', amount: 1 }, { id: 'beer', amount: 330 }]);
  s.advance(60); s.administerBatch([{ id: 'diazepam', amount: 5 }]);
  s.activeDrugStatus();
  assert.ok(s.interactions.length > 0);
  s.values.liverDamage = 12;
  const before = { ...s.values };
  s.removeDrug('diazepam');
  assert.ok(!s.doses.some(d => d.id === 'diazepam'));
  assert.ok(!s.exposures.some(x => x.item.id === 'diazepam'));
  assert.ok(!s.activityCache.has('diazepam'));
  assert.ok(!s.activeDrugStatus().some(x => x.item.id === 'diazepam'));
  assert.ok(s.doses.some(d => d.id === 'lorazepam'));
  assert.deepEqual(s.values, before);
  assert.ok(!s.preview([]).some(x => x.participants.includes('地西泮')));
  s.advance(STEP);
  assert.ok(!s.exposures.some(x => x.item.id === 'diazepam'));
  assert.ok(s.values.liverDamage >= 12);
});

test('移除泵入药取消未输入药量与载液，已输入液体不回滚', () => {
  const s = new Simulator();
  s.administerBatch([defaultEntry(ITEM_BY_ID.dopamine), defaultEntry(ITEM_BY_ID.norepinephrine)]);
  s.advance(2);
  const volume = s.values.volume, other = structuredClone(s.doses.find(d => d.id === 'norepinephrine'));
  s.removeDrug('dopamine');
  assert.equal(s.values.volume, volume);
  assert.deepEqual(s.doses.find(d => d.id === 'norepinephrine'), other);
  assert.equal(s.doses.length, 1);
  assert.equal(s.inputs.at(-1).removeDrug, 'dopamine');
  assert.ok(s.events.at(-1).title.includes('移除药物'));
});

test('移除、同时间重新投放和后续推进可完整重放，V5 旧输入仍兼容', () => {
  const s = new Simulator();
  s.administerBatch([defaultEntry(ITEM_BY_ID.dopamine), { id: 'metoprolol', amount: 25 }]);
  s.advance(2.02); s.removeDrug('dopamine');
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
  s.administerBatch([defaultEntry(ITEM_BY_ID.dopamine)]); s.advance(3);
  s.removeDrug('metoprolol'); s.advance(10);
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
  assert.ok(s.activeDrugStatus().some(x => x.item.id === 'dopamine'));
  const old = new Simulator(); old.administerBatch([{ id: 'metoprolol', amount: 25 }]); old.advance(1);
  assert.deepEqual(Simulator.restore(old.serialize()).exportReport(), old.exportReport());
});

test('移除输入校验原子性、事件互斥及终止状态保护', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'metoprolol', amount: 25 }]);
  const before = s.exportReport();
  for (const id of ['water', 'saline', 'influenza', 'unknown', '__proto__', null, 'dopamine']) assert.throws(() => s.removeDrug(id));
  assert.deepEqual(s.exportReport(), before);
  for (const event of [{ removeDrug: 'water' }, { removeDrug: 'metoprolol', entries: [] }, { removeDrug: 'metoprolol', action: 'oxygen' }]) {
    assert.throws(() => Simulator.restore({ ...s.serialize(), inputs: [...s.inputs, { time: 0, ...event }] }));
  }
  s.life.status = 'dead'; assert.throws(() => s.removeDrug('metoprolol'), /终止/);
  s.life.status = 'alive'; s.time = MAX_TIME; assert.throws(() => s.removeDrug('metoprolol'), /终止/);
});
