const metric = (id, name, unit, range, digits, group, description) => ({ id, name, unit, range, digits, group, description });
import { ORGAN_DAMAGE } from '../engine/injury.js';
import { initializePhysiology } from '../engine/physiology.js';
export const METRICS = [
  metric('hr', '心率', 'bpm', [60, 100], 0, '循环系统', '心脏每分钟搏动次数。受传导、药物和容量反射共同影响。'),
  metric('sbp', '收缩压', 'mmHg', [90, 139], 0, '循环系统', '模型动脉收缩期压力；展示区间仅用于教学标记。'),
  metric('dbp', '舒张压', 'mmHg', [60, 89], 0, '循环系统', '模型动脉舒张期压力。'),
  metric('map', '平均动脉压', 'mmHg', [65, 105], 0, '循环系统', '按 (收缩压 + 2 × 舒张压) / 3 估计。'),
  metric('strokeVolume', '每搏输出量', 'mL', [55, 100], 1, '循环系统', '每次心搏泵出的模型血液体积。'),
  metric('cardiacOutput', '心输出量', 'L/min', [4, 8], 2, '循环系统', '心率 × 每搏输出量 / 1000。'),
  metric('qtc', 'QTc 代理值', 'ms', [350, 460], 0, '循环系统', '由药物和电解质推导的教学代理值，不能诊断心律失常。'),
  metric('spo2', '动脉血氧饱和度（模型值）', '%', [95, 100], 1, '呼吸系统', '模型内部 SaO₂；主卡用作 SpO₂ 估计。正常含氧比例不等于组织供氧充足，低灌注时脉搏血氧读数可能无法获取。'),
  metric('rr', '呼吸频率', '次/min', [12, 20], 0, '呼吸系统', '肺部动效按当前值播放；不乘模拟时间倍率。'),
  metric('co2', '二氧化碳分压', 'mmHg', [35, 45], 1, '呼吸系统', '低通气使 CO₂ 上升，继而影响酸碱和意识。'),
  metric('glucose', '血糖', 'mmol/L', [3.9, 7.8], 2, '代谢与内分泌', '显示区间覆盖本教学实验的空腹/餐后观察，不是诊断标准。'),
  metric('insulin', '胰岛素活性', '×', [0.5, 2], 2, '代谢与内分泌', '相对合成基线的活性代理，不是血清浓度。'),
  metric('lactate', '乳酸', 'mmol/L', [0.5, 2], 2, '代谢与内分泌', '反映低灌注和代谢负担的模型状态。'),
  metric('temperature', '体温', '°C', [36, 37.5], 1, '代谢与内分泌', '模型核心体温。'),
  metric('ldl', 'LDL 代理值', 'mmol/L', [0, 3.4], 2, '代谢与内分泌', '慢变量，短时间内不应出现显著降脂。'),
  metric('sodium', '血钠 Na⁺', 'mmol/L', [135, 145], 1, '水与电解质', '简化水钠平衡，不能作为补液决策依据。'),
  metric('potassium', '血钾 K⁺', 'mmol/L', [3.5, 5], 2, '水与电解质', '利尿排出、保钾、摄入和细胞转移共同影响。'),
  metric('magnesium', '血镁 Mg²⁺', 'mmol/L', [0.7, 1.05], 2, '水与电解质', '镁偏低会增加模型电生理负担。'),
  metric('calcium', '血钙 Ca²⁺', 'mmol/L', [2.1, 2.6], 2, '水与电解质', '总钙的简化状态，不区分游离钙和白蛋白结合。'),
  metric('ph', '动脉 pH', '', [7.35, 7.45], 2, '水与电解质', '呼吸性与乳酸性酸碱变化的简化组合。'),
  metric('volume', '循环血容量', 'L', [4.5, 5.5], 2, '水与电解质', '以 70 kg 合成成人为基准；不等于全身总水量。'),
  metric('urine', '尿量', 'mL/h', [35, 100], 0, '肾脏与肝脏', '当前排尿速率代理，不是累计尿量。'),
  metric('egfr', '肾滤过率', 'mL/min', [60, 130], 0, '肾脏与肝脏', '合成模型 eGFR，不由实际检验资料计算。'),
  metric('alt', 'ALT', 'U/L', [7, 40], 0, '肾脏与肝脏', '肝细胞负担的延迟指标。'),
  metric('liverReserve', '肝功能储备', '%', [75, 100], 0, '肾脏与肝脏', '模型内部状态，并非临床评分。'),
  metric('gcs', '意识评分代理', '/15', [15, 15], 0, '神经系统', '映射至 3–15 的模型意识代理，不是真实 GCS 检查。'),
  metric('eeg', '脑电主频', 'Hz', [8, 13], 1, '神经系统', '合成波形的主要频率，不用于识别脑电诊断。'),
  metric('sedation', '中枢抑制负担', '/100', [0, 15], 0, '神经系统', '药物、酒精及低氧共同影响意识；该指标是模型量。'),
  metric('pain', '疼痛代理', '/10', [0, 3], 1, '神经系统', '合成主观疼痛状态。'),
  metric('inr', 'INR', '', [0.8, 1.2], 2, '凝血与消化', '未抗凝基线参考；并非治疗目标。仅维生素 K 通路药物进入此指标。'),
  metric('platelet', '血小板功能', '%', [70, 100], 0, '凝血与消化', '聚集能力代理，不是血小板计数。'),
  metric('bleedingRisk', '出血倾向', '/100', [0, 20], 0, '凝血与消化', '模型评分，不是发生出血的百分比概率。'),
  metric('bloodLoss', '累计模拟失血', 'mL', [0, 0], 1, '凝血与消化', '超过教学事件阈值后的累计量；并非临床出血预测。'),
  metric('hemoglobin', '血红蛋白', 'g/L', [120, 170], 1, '凝血与消化', '红细胞内 Hb 总质量 / 血容量；受血液丢失、输血及补液稀释影响，未模拟造血。'),
  metric('gastric', '胃部刺激', '/100', [0, 20], 0, '凝血与消化', '胃黏膜刺激与药物保护的净模型负担。'),
  metric('stomach', '胃内容物', 'g', [0, 800], 0, '凝血与消化', '正在消化的食物量代理。'),
  metric('motility', '肠动力', '×', [0.6, 1.5], 2, '凝血与消化', '相对基线的消化道动力。'),
  metric('allergy', '过敏症状负担', '/10', [0, 2], 1, '神经系统', '预设的合成症状，不模拟新发过敏或过敏性休克。'),
];
METRICS.push(
  metric('plasmaVolume', '血浆容量', 'L', [2.4, 3.4], 2, '水与电解质', '血容量扣除由 Hb 质量估计的红细胞体积；血浆蛋白按此容量稀释。'),
  metric('ecfVolume', '有效细胞外液容量', 'L', [12, 16], 2, '水与电解质', '小分子混合分布室，合成基线 14 L；不是全身总水量。'),
  metric('chloride', '血氯 Cl⁻', 'mmol/L', [98, 107], 1, '水与电解质', '输入液成分与容量混合决定即时浓度，再由有限速率调节恢复。'),
  metric('albumin', '白蛋白', 'g/L', [35, 50], 1, '凝血与消化', '血管内白蛋白质量 / 血浆容量；未模拟合成、结合和毛细血管漏。'),
  metric('hematocrit', '红细胞压积代理', '%', [36, 50], 1, '凝血与消化', '红细胞内 Hb 总质量 / 330 / 血容量 × 100；330 g/L 为合成细胞内 Hb 浓度。'),
  metric('effectiveFlow', '有效循环血流', 'L/min', [4, 8], 2, '急救与感染', '自主心输出量 + 按压支持血流；按压不等于自主循环恢复。'),
  metric('cprFlow', '按压支持血流', 'L/min', [0, 0], 2, '急救与感染', '鼠标按压事件产生的有限模型血流，停止点击后消退。'),
  metric('ventilationRate', '含辅助通气频率', '次/min', [12, 20], 0, '急救与感染', '含机械辅助的有效呼吸次数；自主呼吸频率仍单列为 RR。'),
  metric('cardiacArrest', '心搏骤停状态', '0/1', [0, 0], 0, '急救与感染', '1 表示自主循环停止；可施救，不等同模型死亡。'),
  metric('respiratoryArrest', '自主呼吸暂停状态', '0/1', [0, 0], 0, '急救与感染', '可通过建立气道并开启通气支持；插管本身不产生通气。'),
  metric('cprCount', '累计手动按压', '次', [0, 100000], 0, '急救与感染', '已记录的模拟按压次数，不代表真实按压质量或急救资质。'),
  metric('pathogenLoad', '总病原负荷代理', '虚构单位', [0, 0], 1, '急救与感染', '合成感染情景负荷，不能换算 CFU/PFU 或实际感染剂量。'),
  metric('inflammation', '炎症负担代理', '/100', [0, 10], 1, '急救与感染', '病原负荷驱动的延迟反应，影响体温、代谢、血管和容量。'),
  metric('infectionLung', '感染肺部负担', '/50', [0, 5], 1, '急救与感染', '肺部气体交换损害的延迟代理，与病原负荷及情景部位有关。'),
  metric('qrs', 'QRS 时限代理', 'ms', [70, 110], 0, '循环系统', '严重高钾及酸中毒下的传导减慢代理；未模拟具体心律失常或真实心电波形变化。'),
  metric('svr', '外周血管阻力', 'mmHg·min/L', [10, 25], 2, '循环与氧输送', 'MAP = 中心静脉压代理 + 心输出量 × 阻力；血管收缩可以维持压力，却不能替代血流。'),
  metric('cvp', '中心静脉压代理', 'mmHg', [2, 8], 1, '循环与氧输送', '容量与心脏功能的集总代数代理，不是实际导管压力。'),
  metric('sympathetic', '交感代偿负担', '×', [0, 0.3], 2, '循环与氧输送', '压力和氧输送下降触发的有限反射，β 阻断可削弱心率与收缩力代偿。'),
  metric('oxygenContent', '动脉氧含量 CaO₂', 'mL/dL', [16, 23], 2, '循环与氧输送', '1.34 × Hb(g/dL) × 动脉饱和度 + 0.003 × PaO₂；贫血可在血氧饱和度正常时降低此值。'),
  metric('oxygenDelivery', '氧输送 DO₂', 'mL/min', [700, 1400], 0, '循环与氧输送', '有效血流（自主心输出量 + 按压支持血流）× 动脉氧含量 × 10。需与耗氧需求、提取能力一起判断；参考区间不是缺氧阈值。'),
  metric('oxygenDemand', '组织耗氧需求', 'mL/min', [200, 350], 0, '循环与氧输送', '合成 70 kg 成人需求；发热、疼痛增加需求。'),
  metric('oxygenUse', '实际氧摄取 VO₂', 'mL/min', [200, 350], 0, '循环与氧输送', '受氧输送和最大提取能力限制，低于需求时形成氧债。'),
  metric('oxygenExtraction', '氧提取率', '%', [20, 35], 1, '循环与氧输送', 'VO₂ / DO₂；升高表示提取代偿，本集总模型上限设为 60%。'),
  metric('oxygenDeficit', '未满足耗氧需求', '%', [0, 0], 1, '循环与氧输送', '（需求 − 实际摄取）/ 需求；区别于动脉血氧饱和度。'),
  metric('oxygenDebt', '累计氧债代理', 'mL O₂', [0, 0], 0, '循环与氧输送', '氧供需缺口随时间积分；供氧改善后逐渐偿还，不等同组织损伤。'),
  metric('svo2', '混合静脉血氧代理', '%', [65, 80], 1, '循环与氧输送', '由氧摄取与血流按 Fick 关系推导，忽略静脉溶解氧；不是脉搏血氧读数。'),
  metric('pulseSignal', '脉搏血氧信号质量代理', '/100', [50, 100], 0, '循环与氧输送', '灌注与血管收缩的教学代理；低于 50 提示不可靠，低于 25 不显示主卡读数。阈值不对应真实设备。'),
  metric('brainPerfusion', '脑灌注储备代理', '%', [85, 100], 0, '器官灌注', '同时受平均压和心输出量限制，包含有限自身调节；不是脑血流测量。'),
  metric('brainOxygen', '脑供氧储备代理', '%', [80, 100], 0, '器官灌注', '脑灌注 × 相对动脉氧含量，降低会影响意识和脑干呼吸驱动。'),
  metric('renalPerfusion', '肾灌注储备代理', '%', [70, 100], 0, '器官灌注', '血流、压力下降使尿量先减少，滤过功能随后响应。'),
  metric('pao2', '动脉氧分压 PaO₂', 'mmHg', [80, 110], 1, '呼吸系统', '室内空气、海平面的单肺泡气体交换模型值。'),
  metric('tidalVolume', '潮气量', 'mL', [350, 650], 0, '呼吸系统', '每次吸呼气量；镇静和脑干低供氧可使呼吸变浅。'),
  metric('deadSpace', '有效死腔', 'mL', [100, 180], 0, '呼吸系统', '未参与有效气体交换的通气量代理，低灌注与肺损伤时增加。'),
  metric('alveolarVentilation', '肺泡通气量', 'L/min', [3.5, 6], 2, '呼吸系统', '呼吸频率 ×（潮气量 − 有效死腔）/1000；只看呼吸频率无法判断通气是否充分。'),
  metric('bicarbonate', '碳酸氢盐 HCO₃⁻', 'mmol/L', [22, 26], 1, '水与电解质', '乳酸与缓慢肾酸负担影响缓冲，结合 PaCO₂ 按 Henderson–Hasselbalch 关系计算 pH。'),
);
METRICS.push(...ORGAN_DAMAGE.map(o => metric(o.key, `${o.name}不可逆损伤`, '/100', [0, 0], 1, '器官损伤', '不可逆教学代理值；70 为模型衰竭阈值，不是组织坏死百分比。')));
export const METRIC_BY_ID = Object.fromEntries(METRICS.map(m => [m.id, m]));
export const BASE = {
  hr: 72, sbp: 118, dbp: 76, map: 90, strokeVolume: 72, cardiacOutput: 5.184, qtc: 410,
  spo2: 98, rr: 16, co2: 40, glucose: 5.2, insulin: 1, lactate: 1.1, temperature: 36.7, ldl: 2.7,
  sodium: 140, potassium: 4.2, magnesium: 0.85, calcium: 2.3, ph: 7.4, volume: 5,
  urine: 60, egfr: 100, alt: 22, liverReserve: 100, gcs: 15, eeg: 10, sedation: 0, pain: 0,
  inr: 1, platelet: 100, bleedingRisk: 0, bloodLoss: 0, hemoglobin: 145, gastric: 0, stomach: 0,
  motility: 1, allergy: 0,
};
Object.assign(BASE, Object.fromEntries(ORGAN_DAMAGE.map(o => [o.key, 0])));
initializePhysiology(BASE);
export const PROFILES = [
  { id: 'healthy', name: '健康成人', short: '健康基线', description: '70 kg · 静息状态 · 稳态内环境', values: {} },
  { id: 'hypertension', name: '高血压状态', short: '高血压', description: '合成血压基线升高 · 其他系统稳定', values: { sbp: 156, dbp: 96 } },
  { id: 'diabetes', name: '高血糖状态', short: '高血糖', description: '合成血糖 9.4 mmol/L · 调节能力减弱', values: { glucose: 9.4 } },
  { id: 'dehydration', name: '低容量状态', short: '低容量', description: '合成容量减少 · 轻度代偿性心动过速', values: { volume: 4.3, hr: 94, sbp: 98, dbp: 65, sodium: 146, egfr: 78 } },
  { id: 'renal', name: '肾功能下降', short: '肾功能下降', description: '合成 eGFR 42 · 肾清除与钾排泄下降', values: { egfr: 42, potassium: 4.8 } },
  { id: 'airway', name: '气道受限状态', short: '气道受限', description: '合成气道阻力升高 · 呼吸频率增加', values: { rr: 22, spo2: 94, hr: 84 }, airway: 0.7 },
  { id: 'fever', name: '发热与疼痛', short: '发热 / 疼痛', description: '合成体温 38.6°C · 疼痛 5 / 10', values: { temperature: 38.6, hr: 92, pain: 5 } },
  { id: 'allergy', name: '过敏症状状态', short: '过敏症状', description: '合成过敏负担 · 不模拟过敏性休克', values: { allergy: 6 } },
];
export function statusOf(metric, value) {
  if (value < metric.range[0] - 0.001) return 'low';
  if (value > metric.range[1] + 0.001) return 'high';
  return 'normal';
}
export function formatMetric(id, value) { return Number(value).toFixed(METRIC_BY_ID[id]?.digits ?? 1); }
