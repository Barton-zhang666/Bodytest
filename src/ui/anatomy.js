import { anatomyState } from './anatomy-state.js';
import { AnatomyView } from './anatomy-renderer.js';
import { ORGAN_DAMAGE } from '../engine/injury.js';
import { formatMetric, METRIC_BY_ID } from '../data/metrics.js';

export const ORGANS = [
  { id: 'brain', name: '大脑', english: 'BRAIN', color: '#ca9bb6', metrics: ['gcs', 'eeg', 'sedation'], description: '整合神经信号、维持觉醒与意识。对血糖供应、血氧和灌注变化敏感。', load: v => Math.min(100, (15 - v.gcs) * 8 + v.sedation * 0.25) },
  { id: 'thyroid', name: '甲状腺', english: 'THYROID', color: '#dfac76', metrics: ['temperature', 'hr'], description: '参与代谢速率调节。模型中甲状腺激素以缓慢变化影响体温与心率。', load: v => Math.abs(v.temperature - 36.7) * 18 },
  { id: 'lungs', name: '肺', english: 'LUNGS', color: '#dfaaad', metrics: ['rr', 'spo2', 'co2'], description: '完成氧气与二氧化碳交换。呼吸动效频率来自当前模型呼吸频率。', load: v => Math.max(0, 98 - v.spo2) * 4 + Math.abs(v.co2 - 40) },
  { id: 'heart', name: '心脏', english: 'HEART', color: '#d97d80', metrics: ['hr', 'map', 'cardiacOutput', 'qtc'], description: '推动血液循环，为器官提供灌注。可见搏动与当前模型心率同步。', load: v => Math.abs(v.hr - 72) * 0.7 + Math.max(0, 65 - v.map) * 2 + Math.max(0, v.qtc - 450) * 0.4 },
  { id: 'liver', name: '肝脏', english: 'LIVER', color: '#ad7972', metrics: ['alt', 'liverReserve', 'glucose'], description: '参与药物代谢与糖输出。肝功能储备下降会降低部分药物的模型清除率。', load: v => 100 - v.liverReserve + Math.max(0, v.alt - 40) * 0.3 },
  { id: 'stomach', name: '胃', english: 'STOMACH', color: '#d9a28e', metrics: ['gastric', 'stomach', 'motility'], description: '暂存食物并参与消化。脂肪、纤维与部分药物会改变模型胃肠动力。', load: v => v.gastric },
  { id: 'spleen', name: '脾脏', english: 'SPLEEN', color: '#a889ab', metrics: ['hemoglobin', 'platelet'], description: '展示于左上腹。这里只关联血液指标，尚未建立免疫与血细胞储存的独立动力学。', load: v => Math.max(0, 120 - v.hemoglobin) * 0.8 },
  { id: 'pancreas', name: '胰腺', english: 'PANCREAS', color: '#d9ba72', metrics: ['glucose', 'insulin'], description: '参与胰岛素分泌与血糖调节。促胰岛素药物影响模型胰岛素活性。', load: v => Math.abs(v.glucose - 5.2) * 7 },
  { id: 'kidneys', name: '肾脏', english: 'KIDNEYS', color: '#b98582', metrics: ['egfr', 'urine', 'potassium', 'volume'], description: '调节水、电解质与药物清除。肾功能下降会放大保钾与药物累积效应。', load: v => Math.max(0, 100 - v.egfr) + Math.abs(v.potassium - 4.2) * 10 },
  { id: 'intestines', name: '肠道', english: 'INTESTINES', color: '#cbab99', metrics: ['motility', 'glucose', 'stomach'], description: '食物与口服药物的主要吸收区域。模型考虑消化速度、碳水与矿物质相互作用。', load: v => Math.abs(v.motility - 1) * 30 },
  { id: 'bladder', name: '膀胱', english: 'BLADDER', color: '#d3b781', metrics: ['urine', 'volume'], description: '收集肾脏产生的尿液。当前显示尿量速率，不模拟排尿行为或膀胱容量。', load: v => Math.max(0, v.urine - 150) * 0.2 },
];


export function organDetail(id, values) {
  const o = ORGANS.find(o => o.id === id);
  if (!o) return '<div class="organ-detail-heading"><strong>半透明全身视图</strong><span>3D ANATOMY</span></div><p>选择器官查看实色结构与实时参数，再次点击或点击空白处取消。水平拖动绕纵轴旋转，滚轮围绕鼠标位置缩放；缩放按钮沿用鼠标最近在模型上的指向。</p>';
  const injury = ORGAN_DAMAGE.find(x => x.id === id);
  const damage = injury ? values[injury.key] : 0;
  const load = Math.round(Math.min(100, Math.max(0, o.load(values))));
  return `<div class="organ-detail-heading"><span class="organ-color" style="--organ-color:${o.color}"></span><strong>${o.name}</strong><span>${o.english}</span><span class="organ-condition ${load > 30 ? 'caution' : ''}">${damage >= 70 ? '器官衰竭' : damage > 0 ? '不可逆损伤' : load > 60 ? '负担明显' : load > 30 ? '负担增加' : '状态平稳'}</span></div><p>${o.description}${injury ? ` 不可逆损伤 ${damage.toFixed(1)} / 100（模型刻度）。` : ''}</p><div class="organ-metrics">${o.metrics.map(id => `<div><span>${METRIC_BY_ID[id].name}</span><b>${formatMetric(id, values[id])}<small>${METRIC_BY_ID[id].unit}</small></b></div>`).join('')}</div>`;
}


const views = new WeakMap();
export function anatomyMarkup() {
  return '<canvas class="anatomy-canvas" tabindex="0" role="img" aria-label="可旋转的三维半透明人体" aria-describedby="anatomy-controls-hint"></canvas><span class="anatomy-3d-label" hidden></span><p class="anatomy-fallback" role="status" hidden></p>';
}
export function initializeAnatomy(element, callbacks) {
  views.get(element)?.dispose();
  views.set(element, new AnatomyView(element, callbacks));
}
export function setAnatomyAngle(element, yaw) { views.get(element)?.setAngle(yaw); }
export function setAnatomyZoom(element, zoom) { views.get(element)?.setZoom(zoom); }
export function resetAnatomy(element) { views.get(element)?.reset(); }
export function setAnatomyVessels(element, visible) {
  const view = views.get(element); if (!view?.model) return;
  view.model.vessels.visible = visible; view.requestRender();
}
export function setAnatomySelection(element, id) {
  const view = views.get(element); if (!view) return;
  const organ = ORGANS.find(o => o.id === id);
  view.label.textContent = organ?.name ?? '';
  view.setSelection(id);
}
export function updateAnatomyState(element, values, symptoms, life, { paused = false, reducedMotion = false, visible = true } = {}) {
  const visual = anatomyState(values, symptoms, life);
  const signs = [visual.cyanosis && '口唇发紫', visual.jaundice && '皮肤泛黄', visual.seizure && (visual.dead ? '终末前抽搐' : '抽搐' + (paused || reducedMotion ? '（静态显示）' : '（轻微抖动）'))].filter(Boolean);
  const affected = visual.organs.filter(o => o.stage !== 'healthy');
  const summary = (visual.dead ? '生命活动已终止；保留终末外观。' : '') + (signs.length ? signs.join(' · ') : '当前无明显体表症状') + (affected.length ? '；' + affected.map(o => o.name + (o.stage === 'failed' ? '衰竭' : '损伤')).join('、') : '');
  views.get(element)?.setAppearance(visual, summary, paused, reducedMotion, visible);
  return { summary, visual };
}
export function animateAnatomy(element, values, seconds, paused, reducedMotion) { views.get(element)?.animate(values, seconds, paused, reducedMotion); }
