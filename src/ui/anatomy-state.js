import { ORGAN_DAMAGE } from '../engine/injury.js';

const clamp = x => Math.max(0, Math.min(1, x));
export function mixColor(from, to, amount) {
  const a = from.match(/[a-f\d]{2}/gi).map(x => parseInt(x, 16));
  const b = to.match(/[a-f\d]{2}/gi).map(x => parseInt(x, 16));
  return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * clamp(amount)).toString(16).padStart(2, '0')).join('');
}

// 只映射已存在的症状与损伤，不新增诊断阈值、不反向改变生理引擎。
export function anatomyState(values, symptoms, life) {
  const active = new Set(symptoms.map(s => s.id));
  const dead = life.status === 'dead';
  const observed = life.terminalValues ?? values;
  return {
    dead,
    cyanosis: active.has('cyanosis') ? Math.round((0.55 + clamp((90 - observed.spo2) / 25) * 0.45) * 100) / 100 : 0,
    jaundice: active.has('jaundice') ? Math.round((0.5 + clamp((observed.liverDamage - 50) / 50) * 0.5) * 100) / 100 : 0,
    seizure: active.has('seizure'),
    shake: active.has('seizure') && !dead,
    organs: ORGAN_DAMAGE.map(o => {
      const damage = Math.max(0, Math.min(100, values[o.key]));
      const stage = damage >= 70 ? 'failed' : damage > 0 ? 'injured' : 'healthy';
      // 最初的损伤就可辨认；衰竭使用明显不同的深紫红，不仅靠明暗区分。
      const color = stage === 'failed' ? mixColor('#8d365d', '#38283e', (damage - 70) / 30) : mixColor('#dc8e35', '#b44138', damage / 70);
      return { ...o, damage, stage, color };
    }),
  };
}

export function bodyMotion(seconds, shake, paused, reducedMotion) {
  if (!shake || paused || reducedMotion) return 'translate(0 0)';
  const x = Math.sin(seconds * Math.PI * 10) * 1.8;
  const y = Math.sin(seconds * Math.PI * 14) * 0.55;
  return `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
}
