import test from 'node:test';
import assert from 'node:assert/strict';
import { DRUGS, ITEM_BY_ID, validateEntry } from '../src/data/catalog.js';
import { defaultEntry, solutionAmount } from '../src/data/delivery.js';
import { Simulator, STEP } from '../src/engine/simulator.js';

const liquid = (id, concentration, volume) => ({ id, concentration, volume, amount: solutionAmount(concentration, volume) });

test('药物均显式声明途径，可调浓度剂型默认输入保持标定药量', () => {
  assert.ok(DRUGS.every(x => x.route && x.route.includes(x.intravenous ? '静脉' : '口服')));
  const liquids = DRUGS.filter(x => x.solution);
  assert.equal(liquids.length, 10);
  for (const item of liquids) assert.deepEqual(validateEntry(defaultEntry(item)), defaultEntry(item));
  assert.equal(ITEM_BY_ID.lactulose.route, '口服液');
});

test('同体积增加浓度提高实际药量；同药量稀释不直接增加药物暴露', () => {
  const a = new Simulator(), b = new Simulator(), diluted = new Simulator();
  a.administerBatch([liquid('epinephrine', 0.1, 10)]);
  b.administerBatch([liquid('epinephrine', 0.2, 10)]);
  diluted.administerBatch([liquid('epinephrine', 0.05, 20)]);
  assert.equal(b.doses[0].central, a.doses[0].central * 2);
  assert.equal(diluted.doses[0].central, a.doses[0].central);
  for (const s of [a, b, diluted]) s.advance(STEP);
  assert.equal(a.doses[0].central, diluted.doses[0].central);
  assert.ok(diluted.values.volume > a.values.volume);
  assert.equal(diluted.doses[0].fluidDelivered, 20);
});

test('泵入同步传递药量与载液，停止后未输入液体单独记为弃用', () => {
  const s = new Simulator(); s.administerBatch([liquid('dopamine', 0.1, 10)]); s.advance(1);
  const d = s.doses[0];
  assert.ok(Math.abs(d.fluidDelivered - 1) < 1e-10);
  assert.ok(Math.abs(d.reservoir - d.fluidRemaining * d.concentration) < 1e-10);
  s.performRescue('stopInfusions'); const delivered = d.fluidDelivered; s.advance(1);
  assert.equal(d.fluidDelivered, delivered);
  assert.ok(Math.abs(d.fluidDelivered + d.fluidRemaining + d.fluidDiscarded - 10) < 1e-10);
  assert.ok(Math.abs(d.gut + d.central + d.reservoir + d.eliminated + d.discarded - d.amount) < 1e-10);
});

test('乳果糖的水分独立吸收，局部活性需等待肠道转运，不变成静脉注射', () => {
  const s = new Simulator(); s.administerBatch([liquid('lactulose', 0.5, 20)]);
  assert.equal(s.doses[0].gut, 10); assert.equal(s.doses[0].central, 0);
  s.advance(1);
  assert.ok(s.doses[0].central === 0 && s.doses[0].fluidDelivered > 0 && s.doses[0].fluidDelivered < 20);
});

test('浓度、体积、乘积与总药量在引擎层校验，不可绕过上限', () => {
  for (const entry of [liquid('epinephrine', 0, 10), liquid('epinephrine', Infinity, 10),
    liquid('epinephrine', 0.1, 0), liquid('epinephrine', 0.1, 101), liquid('epinephrine', 1, 11),
    liquid('metoprolol', 0.1, 10), { ...liquid('epinephrine', 0.1, 10), amount: 2 },
    { id: 'epinephrine', amount: 1, volume: 10 }, { id: 'epinephrine', amount: 1, concentration: '0.1', volume: 10 }]) {
    const s = new Simulator(); assert.throws(() => s.administerBatch([{ id: 'rice', amount: 100 }, entry]));
    assert.equal(s.inputs.length, 0); assert.equal(s.meals.length, 0);
  }
  assert.throws(() => new Simulator().administerBatch([liquid('epinephrine', 0.1, 60), liquid('epinephrine', 0.2, 30)]));
});

test('不同浓度同药不丢元数据，混合存档确定性重放；旧纯药量不追加载液', () => {
  const s = new Simulator();
  s.administerBatch([liquid('dopamine', 0.1, 10), liquid('dopamine', 0.2, 10), { id: 'rice', amount: 150 }]);
  assert.equal(s.doses.length, 2); assert.equal(s.inputs[0].entries.filter(x => x.concentration).length, 2);
  s.advance(2); s.performRescue('stopInfusions'); s.advance(1);
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
  const old = new Simulator(); old.administerBatch([{ id: 'epinephrine', amount: 1 }]);
  assert.equal(old.doses[0].fluidRemaining, undefined);
  assert.deepEqual(old.inputs[0].entries, [{ id: 'epinephrine', amount: 1 }]);
  old.advance(1); assert.deepEqual(Simulator.restore(old.serialize()).exportReport(), old.exportReport());
});
