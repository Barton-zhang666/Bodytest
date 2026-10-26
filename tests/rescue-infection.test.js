import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator, STEP } from '../src/engine/simulator.js';
import { DRUGS, FOODS, ITEM_BY_ID } from '../src/data/catalog.js';
import { forecastRemaining } from '../src/engine/activity.js';

test('骤停和呼吸暂停是可施救状态，脑损伤必须随缺供累积', () => {
  const s = new Simulator(); s.performRescue('trainingArrest');
  assert.equal(s.values.hr, 0); assert.equal(s.values.effectiveFlow, 0);
  assert.notEqual(s.life.status, 'dead'); assert.equal(s.values.brainDamage, 0);
  s.advance(8); assert.notEqual(s.life.status, 'dead'); assert.ok(s.values.brainDamage > 0);
  s.administerBatch([{ id: 'epinephrine', amount: 1 }]);
  s.advance(180); assert.equal(s.life.status, 'dead');
  assert.equal(s.values.brainDamage, 100);
  assert.match(s.life.cause, /非临床脑死亡/);
});

test('按压产生有限支持血流，不能伪造自主心率；停止后消退', () => {
  const s = new Simulator(); s.performRescue('trainingArrest');
  s.performRescue('compress', 6); s.advance(STEP);
  assert.equal(s.values.hr, 0); assert.ok(s.values.cprFlow > 0);
  assert.equal(s.values.cardiacOutput, 0); assert.ok(s.values.oxygenDelivery > 0);
  const flow = s.values.cprFlow; s.advance(0.3);
  assert.ok(s.values.cprFlow < flow * 0.05);
  assert.equal(s.support.totalCompressions, 6);
  assert.throws(() => new Simulator().performRescue('compress'));
});

test('支持措施下训练情景可恢复自主循环，混合事件确定性重放', () => {
  const s = new Simulator();
  s.performRescue('trainingArrest'); s.performRescue('intubate'); s.performRescue('ventilate'); s.performRescue('oxygen');
  s.administerBatch([{ id: 'epinephrine', amount: 1 }]);
  for (let i = 0; i < 50; i++) { if (s.support.arrest) s.performRescue('compress', 6); s.advance(STEP); }
  assert.equal(s.support.arrest, false); assert.ok(s.values.hr > 30);
  assert.ok(s.events.some(e => e.title.includes('ROSC')));
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
});

test('插管本身不产生通气；通气可支持呼吸暂停，移除导管停止辅助', () => {
  const s = new Simulator(); s.performRescue('trainingApnea');
  assert.throws(() => s.performRescue('ventilate'), /气道/);
  s.performRescue('intubate'); s.advance(1);
  assert.equal(s.values.rr, 0); assert.equal(s.values.ventilationRate, 0); assert.ok(s.values.co2 > 60);
  s.performRescue('ventilate'); s.performRescue('oxygen'); s.advance(5);
  assert.ok(s.values.ventilationRate >= 12 && s.values.spo2 > 90);
  s.performRescue('extubate'); assert.equal(s.support.ventilated, false);
});

test('交互快进在新发生骤停处停下，普通重放仍可继续推进', () => {
  const s = new Simulator();
  s.administerBatch(['metoprolol', 'bisoprolol', 'verapamil'].map(id => ({ id, amount: ITEM_BY_ID[id].reference * 10 })));
  s.advance(360, { stopOnCrisis: true });
  assert.equal(s.attentionRequired, true); assert.ok(s.time < 360);
  assert.notEqual(s.life.status, 'dead'); assert.equal(s.pending, 0);
  if (s.support.arrest) { assert.equal(s.values.hr, 0); assert.equal(s.values.cardiacOutput, 0); }
  if (s.support.apnea) assert.equal(s.values.rr, 0);
  assert.deepEqual(Simulator.restore(s.serialize()).values, s.values);
});

test('静脉药直接进入中央室；泵入分时进行，停止保留已给药量', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'epinephrine', amount: 1 }, { id: 'dopamine', amount: 1 }]);
  assert.equal(s.doses[0].gut, 0); assert.equal(s.doses[0].central, 1);
  assert.equal(s.doses[1].reservoir, 1); assert.equal(s.doses[1].central, 0);
  s.advance(1); assert.ok(s.doses[1].central > 0 && s.doses[1].reservoir > 0);
  s.performRescue('stopInfusions'); assert.equal(s.doses[1].reservoir, 0);
  for (const d of s.doses) assert.ok(Math.abs(d.gut + d.central + d.eliminated + d.reservoir + d.discarded - d.amount) < 1e-8);
  assert.ok(s.doses[1].discarded > 0);
  assert.deepEqual(Simulator.restore(s.serialize()).exportReport(), s.exportReport());
});

test('纳洛酮改善阿片抑制，但不是所有镇静药的通用解药', () => {
  const run = (id, antagonist) => { const s = new Simulator(); s.administerBatch([{ id, amount: ITEM_BY_ID[id].reference * 2 }]); s.advance(60); if (antagonist) s.administerBatch([{ id: 'naloxone', amount: 1 }]); s.advance(5); return s.values; };
  assert.ok(run('morphine', true).sedation < run('morphine', false).sedation);
  assert.equal(run('diazepam', true).sedation, run('diazepam', false).sedation);
});

test('泵入剩余时间计入储量，停止后清空缓存并保留已进入体内的效应', () => {
  const s = new Simulator(); s.administerBatch([{ id: 'dopamine', amount: 1 }]);
  const pending = forecastRemaining(ITEM_BY_ID.dopamine, s.doses, 1, 1);
  assert.ok(pending.minutes >= ITEM_BY_ID.dopamine.infusionMinutes);
  s.advance(3); const before = s.activeDrugStatus()[0].remaining;
  s.performRescue('stopInfusions'); const after = s.activeDrugStatus()[0];
  assert.ok(after.remaining < before && after.remaining > 0 && after.strength > 0);
});

test('退热药可降低感染所致发热，但不会消灭病原负荷', () => {
  const a = new Simulator(), b = new Simulator();
  for (const s of [a, b]) { s.administerBatch([{ id: 'influenza', amount: 60 }]); s.advance(240); }
  b.administerBatch([{ id: 'paracetamol', amount: 500 }]);
  a.advance(90); b.advance(90);
  assert.ok(b.values.temperature < a.values.temperature);
  assert.equal(b.values.pathogenLoad, a.values.pathogenLoad);
});

test('红细胞提高携氧质量，晶体液不补红细胞，凝血成分支持各自通路', () => {
  const rbc = new Simulator(), saline = new Simulator(), plasma = new Simulator(), platelets = new Simulator();
  for (const [s, id] of [[rbc, 'red-cells'], [saline, 'saline'], [plasma, 'plasma'], [platelets, 'platelets']]) { s.administerBatch([{ id, amount: 250 }]); s.advance(25); }
  assert.ok(rbc.values.hemoglobin > saline.values.hemoglobin && rbc.values.redCellMass > saline.values.redCellMass);
  assert.equal(saline.values.redCellMass, 725);
  assert.ok(plasma.support.clotting > 0 && plasma.support.platelets === 0);
  assert.ok(platelets.support.platelets > 0 && platelets.support.clotting === 0);
  const mass = rbc.values.redCellMass; rbc.administerBatch([{ id: 'red-cells', amount: 250 }]); rbc.performRescue('stopInfusions'); rbc.advance(30);
  assert.equal(rbc.values.redCellMass, mass);
});

test('感染负荷先于炎症变化，负荷可调，抗菌药不能直接清除病毒', () => {
  const one = new Simulator(), more = new Simulator(), antibiotic = new Simulator();
  one.administerBatch([{ id: 'influenza', amount: 10 }]); more.administerBatch([{ id: 'influenza', amount: 30 }]);
  antibiotic.administerBatch([{ id: 'influenza', amount: 10 }, { id: 'amoxicillin', amount: 500 }]);
  assert.equal(one.values.inflammation, 0);
  one.advance(180); more.advance(180); antibiotic.advance(180);
  assert.ok(more.values.pathogenLoad > one.values.pathogenLoad && more.values.temperature > one.values.temperature);
  assert.equal(one.values.pathogenLoad, antibiotic.values.pathogenLoad);
  assert.ok(one.values.inflammation > 0 && one.values.infectionLung > 0);
});

test('敏感谱匹配降低对应负荷，未匹配抗病毒药不作用，治疗后炎症延迟消退', () => {
  const run = (pathogen, drug) => { const s = new Simulator(); s.administerBatch([{ id: pathogen, amount: 30 }]); s.advance(120); if (drug) s.administerBatch([{ id: drug, amount: ITEM_BY_ID[drug].reference }]); s.advance(240); return s; };
  const treated = run('influenza', 'oseltamivir');
  assert.ok(treated.values.pathogenLoad < run('influenza').values.pathogenLoad);
  assert.ok(treated.values.inflammation > 0);
  assert.equal(run('rhinovirus', 'oseltamivir').values.pathogenLoad, run('rhinovirus').values.pathogenLoad);
  assert.ok(run('pneumococcus', 'amoxicillin').values.pathogenLoad < run('pneumococcus').values.pathogenLoad);
  assert.deepEqual(Simulator.restore(treated.serialize()).exportReport(), treated.exportReport());
});

test('酒类包含不同乙醇负荷，风险标签不把风险等同必然损伤', () => {
  assert.ok(FOODS.filter(x => x.tags.includes('alcohol')).length >= 5);
  assert.ok(ITEM_BY_ID.baijiu.nutrients.alcohol / ITEM_BY_ID.baijiu.reference > ITEM_BY_ID.beer.nutrients.alcohol / ITEM_BY_ID.beer.reference);
  const s = new Simulator(); s.administerBatch([{ id: 'whisky', amount: 90 }, { id: 'diazepam', amount: 5 }]); s.advance(90);
  assert.ok(s.interactions.some(x => x.id === 'alcohol-sedative'));
  assert.ok(DRUGS.every(x => Array.isArray(x.toxicities)));
  assert.ok(ITEM_BY_ID.vancomycin.toxicities.some(x => x.key === 'kidney'));
  assert.ok(ITEM_BY_ID.paracetamol.toxicities.some(x => x.key === 'liver'));
});

test('急救及新类型输入有边界，非法混合批次不会部分提交', () => {
  const s = new Simulator();
  assert.throws(() => s.administerBatch([{ id: 'red-cells', amount: 250 }, { id: 'influenza', amount: Infinity }]));
  assert.equal(s.infusions.length, 0);
  assert.throws(() => s.performRescue('compress', 13));
  assert.throws(() => Simulator.restore({ ...s.serialize(), inputs: [{ time: 0, action: 'bad', count: 1 }] }));
  assert.throws(() => Simulator.restore({ ...s.serialize(), version: 3 }));
});
