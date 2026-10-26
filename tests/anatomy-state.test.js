import test from 'node:test';
import assert from 'node:assert/strict';
import { anatomyState, bodyMotion } from '../src/ui/anatomy-state.js';
import { BASE } from '../src/data/metrics.js';
import { evaluateSymptoms } from '../src/engine/symptoms.js';

const alive = { status: 'alive' };
test('健康模型无症状着色，颜色映射不修改体征', () => {
  const values = { ...BASE }, before = { ...values };
  const view = anatomyState(values, evaluateSymptoms(values), alive);
  assert.equal(view.cyanosis, 0); assert.equal(view.jaundice, 0); assert.equal(view.shake, false);
  assert.ok(view.organs.every(o => o.stage === 'healthy'));
  assert.deepEqual(values, before);
});
test('口唇颜色遵守已有症状滞后，缓解后解除，不凭单个数值自行触发', () => {
  const v = { ...BASE, spo2: 85 };
  const initial = evaluateSymptoms(v);
  assert.ok(anatomyState(v, initial, alive).cyanosis > 0);
  v.spo2 = 89;
  const recovering = evaluateSymptoms(v, initial);
  assert.ok(anatomyState(v, recovering, alive).cyanosis > 0);
  assert.equal(anatomyState(v, [], alive).cyanosis, 0);
  v.spo2 = 95;
  assert.equal(anatomyState(v, evaluateSymptoms(v, recovering), alive).cyanosis, 0);
});
test('黄疸、抽搐和多个器官损伤可同时显示，衰竭颜色有明确分级', () => {
  const v = { ...BASE, glucose: 2, liverDamage: 75, kidneyDamage: 30 };
  const view = anatomyState(v, evaluateSymptoms(v), alive);
  assert.ok(view.jaundice > 0); assert.equal(view.shake, true);
  const liver = view.organs.find(o => o.id === 'liver'), kidney = view.organs.find(o => o.id === 'kidneys');
  assert.equal(liver.stage, 'failed'); assert.equal(kidney.stage, 'injured');
  assert.notEqual(liver.color, kidney.color);
  assert.equal(anatomyState({ ...v, kidneyDamage: 69.9 }, [], alive).organs.find(o => o.id === 'kidneys').stage, 'injured');
  assert.equal(anatomyState({ ...v, kidneyDamage: 70 }, [], alive).organs.find(o => o.id === 'kidneys').stage, 'failed');
});
test('死亡保留终末颜色但停止抽搐；暂停和减少动态效果均取消位移', () => {
  const terminal = { ...BASE, spo2: 75, glucose: 2, liverDamage: 80 };
  const symptoms = evaluateSymptoms(terminal);
  const view = anatomyState({ ...terminal, spo2: 0 }, symptoms, { status: 'dead', terminalValues: terminal });
  assert.equal(view.cyanosis, anatomyState(terminal, symptoms, alive).cyanosis);
  assert.equal(view.shake, false); assert.equal(view.seizure, true);
  assert.equal(bodyMotion(0.15, true, true, false), 'translate(0 0)');
  assert.equal(bodyMotion(0.15, true, false, true), 'translate(0 0)');
  assert.equal(bodyMotion(0.15, false, false, false), 'translate(0 0)');
  assert.notEqual(bodyMotion(0.15, true, false, false), 'translate(0 0)');
});
