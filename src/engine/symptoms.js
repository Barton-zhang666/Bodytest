import { ORGAN_DAMAGE } from './injury.js';
const low = (id, name, key, threshold, severe, explanation, margin = 0.15) => ({
  id, name, key, explanation, on: v => v[key] < threshold,
  keep: v => v[key] < threshold + margin, severity: v => v[key] < severe ? 'high' : 'moderate',
});
const high = (id, name, key, threshold, severe, explanation, margin = 0.15) => ({
  id, name, key, explanation, on: v => v[key] > threshold,
  keep: v => v[key] > threshold - margin, severity: v => v[key] > severe ? 'high' : 'moderate',
});
export const SYMPTOM_RULES = [
  high('arrest', '心搏骤停 · 可施救', 'cardiacArrest', 0.5, 0.5, '自主循环停止，按压产生的血流与自主心跳分开记录。', 0),
  high('apnea', '自主呼吸暂停 · 可施救', 'respiratoryArrest', 0.5, 0.5, '自主呼吸停止；建立气道后还需开启通气支持。', 0),
  high('infection', '感染性炎症反应', 'inflammation', 15, 50, '合成感染负荷引起发热与系统负担；匹配抗感染药降低负荷后，炎症仍有消退延迟。', 3),
  high('oxygen-deficit', '组织供氧不足', 'oxygenDeficit', 5, 30, '血流、血红蛋白和肺氧合共同决定氧输送；提取代偿已无法满足需求，即使动脉血氧饱和度正常也可能出现。', 2),
  high('extraction', '氧提取代偿增加', 'oxygenExtraction', 40, 55, '供氧相对不足，组织增加从血液中提取氧气；接近提取上限后可能形成氧债。', 3),
  high('hypercapnia', '二氧化碳潴留', 'co2', 50, 70, '肺泡通气不足使 CO₂ 升高，酸碱平衡与意识受到影响。', 3),
  high('lactic', '乳酸积聚', 'lactate', 2.5, 4, '氧供需失衡、药物代谢负担或肝脏清除下降导致乳酸升高；乳酸本身不等同某一种疾病。', 0.3),
  low('hypoglycemia', '低血糖', 'glucose', 3.9, 3, '葡萄糖供应降低，可能伴饥饿、出汗、震颤和意识改变。'),
  high('hyperglycemia', '高血糖', 'glucose', 10, 16.7, '血糖负担升高，可能出现口渴与乏力。', 0.3),
  low('hypokalemia', '低钾状态', 'potassium', 3.5, 2.8, '钾下降，肌力与心脏电活动受到影响。', 0.08),
  high('hyperkalemia', '高钾状态', 'potassium', 5.3, 6, '钾升高，模型电生理负担增加。', 0.08),
  low('hyponatremia', '低钠状态', 'sodium', 135, 125, '水钠平衡改变，可能出现头痛、乏力和意识改变。', 0.5),
  high('hypernatremia', '高钠状态', 'sodium', 145, 155, '水钠平衡改变，可能出现口渴和神经症状。', 0.5),
  low('hypomagnesemia', '低镁状态', 'magnesium', 0.7, 0.5, '镁下降，模型 QTc 与肌肉兴奋性受影响。', 0.03),
  low('hypocalcemia', '低钙状态', 'calcium', 2.1, 1.8, '钙下降，模型神经肌肉和电生理负担增加。', 0.04),
  high('hypercalcemia', '高钙状态', 'calcium', 2.65, 3.2, '钙升高，可能伴乏力与消化道不适。', 0.04),
  low('bradycardia', '心动过缓', 'hr', 50, 40, '心率下降，过低时模型心输出量与灌注下降。', 3),
  high('tachycardia', '心悸 / 心动过速', 'hr', 105, 140, '心率增加；来自直接兴奋或低容量代偿。', 4),
  low('dizziness', '头晕 / 低灌注', 'map', 65, 50, '平均动脉压下降，脑部灌注不足。', 3),
  high('hypertension', '血压升高', 'sbp', 140, 180, '模型收缩压高于展示区间；不等于仅凭单次测量诊断高血压。', 4),
  low('hypoxia', '低氧状态', 'spo2', 94, 88, '氧合下降，持续低氧会影响意识与乳酸。', 1),
  low('respiratory', '呼吸抑制', 'rr', 10, 7, '呼吸驱动下降，CO₂ 潴留并逐渐影响氧合。', 1),
  high('tachypnea', '呼吸急促', 'rr', 24, 32, '模型呼吸频率上升，可能与气道和酸碱状态有关。', 1),
  high('drowsy', '嗜睡', 'sedation', 20, 60, '中枢抑制加深，脑电主频下降。', 3),
  low('confused', '意识混乱', 'gcs', 13, 9, '药物、氧合、血糖和灌注共同降低模型意识评分。', 0.5),
  low('coma', '昏迷样状态', 'gcs', 8.5, 7, '模型意识评分显著下降；只是合成状态，不能替代意识评估。', 0.5),
  low('dehydrated', '低容量 / 乏力', 'volume', 4.5, 3.8, '循环容量减少，血压和肾灌注可能下降。', 0.08),
  high('fluid', '容量负担 / 水肿倾向', 'volume', 5.6, 6.3, '循环容量增加，模型出现容量负担。', 0.1),
  high('qt', 'QT 延长倾向', 'qtc', 470, 510, '药物和电解质共同增加电生理代理值；不是心电诊断。', 5),
  high('gastritis', '胃部不适 / 恶心', 'gastric', 24, 60, '胃黏膜刺激与胃内容物负担增加。', 3),
  high('bleeding-tendency', '出血倾向升高', 'bleedingRisk', 28, 65, '凝血与血小板功能受影响；倾向分数不是出血概率。', 4),
  { id: 'bleeding', name: '皮下瘀斑 / 持续渗血', key: 'bloodLoss', explanation: '出血倾向超过模型事件阈值，已累积模拟失血。', on: v => v.bleedingRisk > 70 && v.bloodLoss > 1, keep: v => v.bleedingRisk > 60, severity: () => 'high' },
  high('fever', '发热', 'temperature', 37.8, 39, '模型核心体温上升。', 0.2),
  high('hepatic', '肝脏负担增加', 'alt', 50, 120, 'ALT 代理值升高；不是肝损伤诊断。', 5),
  low('renal', '肾滤过下降', 'egfr', 60, 30, '模型肾清除能力降低，肾排泄药物可能累积。', 3),
  low('acidosis', '酸中毒倾向', 'ph', 7.35, 7.2, 'CO₂ 与乳酸改变模型酸碱平衡。', 0.02),
  high('diarrhea', '腹泻倾向', 'motility', 1.8, 3, '肠动力与渗透负担上升，模型水分丢失增加。', 0.1),
  low('constipation', '便秘倾向', 'motility', 0.5, 0.25, '肠动力下降，食物在模型中的消化速度减慢。', 0.05),
  { id: 'sweat', name: '出汗 / 震颤', key: 'glucose', explanation: '低血糖诱发的模型交感神经反应。', on: v => v.glucose < 3.5, keep: v => v.glucose < 3.8, severity: () => 'moderate' },
  high('itch', '皮肤瘙痒 / 过敏不适', 'allergy', 3, 7, '合成过敏症状负担升高，不模拟新发药物过敏。', 0.3),
];

const physical = new Set(['dizziness', 'tachycardia', 'drowsy', 'confused', 'coma', 'dehydrated', 'fluid', 'gastritis', 'bleeding', 'fever', 'diarrhea', 'constipation', 'sweat', 'itch']);
const extraSigns = [
  low('cyanosis', '口唇发绀 / 呼吸困难', 'spo2', 88, 80, '低氧触发模型中的口唇颜色变化与呼吸困难表现。', 2),
  low('seizure', '抽搐 / 无法正常应答', 'glucose', 2.5, 2, '严重低糖引起模型神经功能障碍。', 0.3),
  low('cold-skin', '冷汗 / 四肢冰冷', 'map', 55, 45, '灌注不足出现皮肤湿冷与明显虚弱。', 3),
  low('weakness', '肌肉无力 / 肢体软弱', 'potassium', 3, 2.5, '血钾异常影响模型肌肉兴奋性。', 0.2),
  high('vomit', '反复恶心 / 呕吐', 'gastric', 65, 85, '严重胃部刺激触发呕吐表现；当前未额外模拟呕吐排出量。', 5),
  low('oliguria', '明显少尿', 'urine', 25, 10, '模型尿液产生速率显著下降。', 5),
  high('jaundice', '皮肤与巩膜发黄', 'liverDamage', 50, 70, '肝损伤累积后的教学黄疸表现；未独立模拟胆红素。', 0),
  high('abdominal', '持续腹痛 / 腹胀', 'gutDamage', 40, 70, '肠道损伤累积，动力与功能下降。', 0),
];
SYMPTOM_RULES.push(...extraSigns, ...ORGAN_DAMAGE.map(o => high(o.id + '-failure', o.name + '衰竭', o.key, 69.999, 69.999, o.signs + '。不可逆损伤达到模型衰竭阈值，解除诱因不会自动恢复。', 0)));
for (const r of [...extraSigns]) physical.add(r.id);

export function evaluateSymptoms(values, previous = []) {
  const active = new Set(previous.map(s => s.id));
  return SYMPTOM_RULES.filter(r => active.has(r.id) ? r.keep(values) : r.on(values))
    .map(r => ({ id: r.id, name: r.name, key: r.key, explanation: r.explanation, severity: r.severity(values), kind: r.id.endsWith('-failure') ? 'failure' : physical.has(r.id) ? 'physical' : 'system', value: values[r.key] }))
    .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high'));
}
