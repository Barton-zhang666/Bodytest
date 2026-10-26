import { configureDrugProfile } from './drug-profiles.js';
import { criticalCareDrugs, PRODUCTS, toxicityFor } from './critical-care.js';
import { PATHOGENS } from './infections.js';
import { configureDelivery, validateSolution } from './delivery.js';
export { PRODUCTS, PATHOGENS };
// 所有量效系数与时间常数均为教学标定值，不是临床剂量推荐。
const drug = (id, name, english, category, reference, absorption, halfLife, effects, mechanism, tags = [], options = {}) => ({
  id, name, english, category, reference, absorption, halfLife, effects, mechanism,
  tags, kind: 'drug', unit: 'mg', route: '口服', clearance: 'hepatic', lag: 12,
  source: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(english)}`,
  ...options,
});

export const DRUGS = [
  drug('metoprolol', '美托洛尔', 'Metoprolol', '心血管', 25, 28, 240, { hr: -19, inotropy: -0.08, chronotropicBlock: 1 }, '阻断 β₁ 受体，减慢心率并降低心肌耗氧；模型保留低容量反射的部分抵消。', ['beta', 'slow-heart', 'antihypertensive']),
  drug('bisoprolol', '比索洛尔', 'Bisoprolol', '心血管', 5, 55, 600, { hr: -18, inotropy: -0.08, chronotropicBlock: 1 }, '选择性 β₁ 阻断，降低心率和血压，效应消退较缓慢。', ['beta', 'slow-heart', 'antihypertensive'], { clearance: 'mixed' }),
  drug('amlodipine', '氨氯地平', 'Amlodipine', '心血管', 5, 150, 2400, { sbp: -18, dbp: -11, hr: 2 }, '阻断血管平滑肌钙通道，外周血管舒张；模型缓慢起效。', ['antihypertensive', 'vasodilator'], { lag: 90 }),
  drug('nifedipine', '硝苯地平', 'Nifedipine', '心血管', 10, 25, 180, { sbp: -22, dbp: -12, hr: 7 }, '血管舒张降低外周阻力，可能伴反射性心率增加。仅建立即释制剂的示意行为。', ['antihypertensive', 'vasodilator', 'cyp3a4']),
  drug('enalapril', '依那普利', 'Enalapril', '心血管', 5, 50, 660, { sbp: -16, dbp: -9, k: 0.25 }, '抑制肾素-血管紧张素系统，降低血压并减少钾排出。', ['raas', 'potassium-retain', 'antihypertensive'], { clearance: 'renal', lag: 60 }),
  drug('losartan', '氯沙坦', 'Losartan', '心血管', 50, 40, 420, { sbp: -16, dbp: -9, k: 0.25 }, '阻断 AT₁ 受体，降低血管张力；肾功能下降时保钾效应更明显。', ['raas', 'potassium-retain', 'antihypertensive']),
  drug('verapamil', '维拉帕米', 'Verapamil', '心血管', 80, 35, 360, { hr: -14, sbp: -8, dbp: -5, inotropy: -0.12, chronotropicBlock: 0.8, gutSlow: 0.4 }, '抑制心脏钙通道，减慢传导与心率，同时舒张血管。', ['slow-heart', 'antihypertensive', 'cyp3a4']),
  drug('simvastatin', '辛伐他汀', 'Simvastatin', '心血管', 20, 50, 180, { lipid: -0.5 }, '抑制胆固醇合成；模型保留缓慢的血脂方向变化，高暴露时增加肝脏负担。', ['statin', 'cyp3a4'], { lag: 720 }),
  drug('furosemide', '呋塞米', 'Furosemide', '利尿剂', 20, 22, 120, { diuresis: 3.4, k: -0.65, na: -1.4, mg: -0.08, ca: -0.05, sbp: -5 }, '抑制髓袢离子转运，增加排尿，同时增加钾、钠和镁的丢失。', ['diuretic', 'potassium-loss'], { clearance: 'renal', lag: 8 }),
  drug('hydrochlorothiazide', '氢氯噻嗪', 'Hydrochlorothiazide', '利尿剂', 25, 50, 480, { diuresis: 1.9, k: -0.45, na: -2, mg: -0.05, ca: 0.05, sbp: -8 }, '抑制远曲小管钠重吸收；血钾、血钠下降，钙排出减少。', ['diuretic', 'potassium-loss'], { clearance: 'renal', lag: 35 }),
  drug('spironolactone', '螺内酯', 'Spironolactone', '利尿剂', 25, 70, 900, { diuresis: 0.9, k: 0.55, na: -0.6, sbp: -6 }, '拮抗醛固酮，温和利尿并保钾；与 RAAS 抑制剂或补钾合用会增加高钾倾向。', ['diuretic', 'potassium-retain'], { lag: 180 }),
  drug('metformin', '二甲双胍', 'Metformin', '血糖调节', 500, 70, 360, { glucoseLower: 1.4, irritation: 8 }, '减少肝糖输出并改善胰岛素作用。模型只降低高于生理基线的血糖，单独使用不直接驱动低血糖。', ['metformin'], { clearance: 'renal', lag: 90 }),
  drug('glipizide', '格列吡嗪', 'Glipizide', '血糖调节', 5, 35, 240, { insulin: 1.3, k: -0.12 }, '促进胰岛素释放，摄入不足或重复给药时可使模型血糖降低。', ['secretagogue', 'hypoglycemic']),
  drug('acarbose', '阿卡波糖', 'Acarbose', '血糖调节', 50, 15, 180, { carbBlock: 0.5, irritation: 9 }, '减慢复杂碳水吸收；单糖仍可吸收。模型不把它当成直接促胰岛素药。', ['carb-block'], { clearance: 'local', lag: 5 }),
  drug('dapagliflozin', '达格列净', 'Dapagliflozin', '血糖调节', 10, 50, 720, { glucoseLower: 1.2, diuresis: 1.1 }, '增加尿糖排出，模型表现为高血糖下降与轻度渗透性利尿。', ['sglt2'], { lag: 40 }),
  drug('paracetamol', '对乙酰氨基酚', 'Acetaminophen', '镇痛与解热', 500, 25, 150, { pain: -2.5, antipyretic: 1 }, '调节痛觉与体温；高暴露时模型缓慢累积肝损伤负担，不模拟真实中毒剂量。', ['paracetamol']),
  drug('ibuprofen', '布洛芬', 'Ibuprofen', '镇痛与解热', 200, 40, 120, { pain: -2.2, antipyretic: 0.8, irritation: 13, platelet: -7, renal: 2 }, '抑制环氧化酶，减少疼痛与发热，同时增加胃黏膜刺激和低容量时的肾脏负担。', ['nsaid']),
  drug('naproxen', '萘普生', 'Naproxen', '镇痛与解热', 250, 60, 780, { pain: -2.4, antipyretic: 0.8, irritation: 15, platelet: -9, renal: 2 }, '抑制前列腺素合成，镇痛作用较持久；与抗凝药合用增加出血倾向。', ['nsaid']),
  drug('morphine', '吗啡', 'Morphine', '镇痛与解热', 10, 35, 180, { pain: -4, sedation: 18, resp: -3.5, sbp: -5, gutSlow: 0.8 }, '激动 μ 阿片受体，镇痛并抑制呼吸驱动和肠动力。模型仅使用口服途径。', ['opioid', 'sedative'], { clearance: 'mixed' }),
  drug('diazepam', '地西泮', 'Diazepam', '镇静与睡眠', 5, 25, 1800, { sedation: 24, resp: -1.5, sbp: -3 }, '增强 GABA 抑制作用，产生镇静；与其他中枢抑制物叠加时呼吸抑制加重。', ['benzo', 'sedative', 'cyp3a4']),
  drug('lorazepam', '劳拉西泮', 'Lorazepam', '镇静与睡眠', 1, 45, 720, { sedation: 27, resp: -1.6, sbp: -3 }, '增强抑制性神经传递，降低觉醒水平，改变模型脑电主频。', ['benzo', 'sedative']),
  drug('zolpidem', '唑吡坦', 'Zolpidem', '镇静与睡眠', 5, 25, 150, { sedation: 28, resp: -1 }, '作用于 GABA 受体复合物，降低觉醒；与酒精等共同增加中枢抑制。', ['sedative', 'cyp3a4']),
  drug('aspirin', '阿司匹林', 'Aspirin', '凝血与血小板', 100, 30, 240, { platelet: -35, irritation: 10, pain: -0.3 }, '抑制血小板聚集；效应室设置较长恢复期，区分药物清除与血小板功能恢复。', ['antiplatelet'], { lag: 90, recovery: 2400 }),
  drug('clopidogrel', '氯吡格雷', 'Clopidogrel', '凝血与血小板', 75, 45, 360, { platelet: -42 }, '抑制 P2Y₁₂ 通路，降低血小板功能；与抗凝药合用增加出血倾向。', ['antiplatelet'], { lag: 150, recovery: 2400 }),
  drug('warfarin', '华法林', 'Warfarin', '凝血与血小板', 2.5, 60, 2400, { anticoag: 1.5 }, '抑制维生素 K 依赖凝血因子生成，效应延迟；维生素 K 摄入会改变模型抗凝响应。', ['warfarin', 'anticoagulant'], { lag: 720 }),
  drug('rivaroxaban', '利伐沙班', 'Rivaroxaban', '凝血与血小板', 10, 60, 540, { directAnticoag: 28 }, '直接抑制 Xa 因子，增加抗凝负担；模型不通过 INR 量化该药抗凝强度。', ['anticoagulant', 'cyp3a4'], { clearance: 'mixed', lag: 40 }),
  drug('loratadine', '氯雷他定', 'Loratadine', '抗过敏', 10, 60, 480, { allergy: -2, sedation: 2 }, '阻断外周 H₁ 受体，模型以减轻过敏负担为主，中枢抑制较小。', ['antihistamine']),
  drug('cetirizine', '西替利嗪', 'Cetirizine', '抗过敏', 10, 35, 480, { allergy: -2, sedation: 5 }, '阻断 H₁ 受体，部分中枢效应可导致轻度嗜睡。', ['antihistamine'], { clearance: 'renal' }),
  drug('diphenhydramine', '苯海拉明', 'Diphenhydramine', '抗过敏', 25, 40, 300, { allergy: -2, sedation: 20, hr: 5, gutSlow: 0.5 }, '第一代 H₁ 阻断剂兼具抗胆碱作用，增加镇静、口干和心率。', ['antihistamine', 'sedative', 'anticholinergic']),
  drug('salbutamol', '沙丁胺醇', 'Albuterol', '呼吸系统', 2, 40, 300, { bronchodilation: 0.8, hr: 9, k: -0.35, tremor: 0.5 }, '口服片剂示意：β₂ 激动使支气管舒张，也可促使钾转入细胞、增加心率和震颤。', ['beta2']),
  drug('theophylline', '茶碱', 'Theophylline', '呼吸系统', 100, 50, 480, { bronchodilation: 0.6, hr: 10, resp: 1, stimulation: 10, irritation: 5 }, '支气管舒张并刺激中枢；模型高暴露时增加心律负担。', ['stimulant', 'theophylline'], { lag: 30 }),
  drug('montelukast', '孟鲁司特', 'Montelukast', '呼吸系统', 10, 70, 300, { bronchodilation: 0.35 }, '拮抗白三烯受体，缓慢降低模型气道阻力；不是急救药效的精确再现。', ['leukotriene'], { lag: 180 }),
  drug('omeprazole', '奥美拉唑', 'Omeprazole', '消化系统', 20, 50, 90, { gastroProtect: 16 }, '抑制胃酸分泌，降低胃部刺激代理值；效应恢复慢于血中清除。', ['ppi'], { lag: 90, recovery: 600 }),
  drug('famotidine', '法莫替丁', 'Famotidine', '消化系统', 20, 60, 180, { gastroProtect: 12 }, '阻断胃壁细胞 H₂ 受体，降低胃酸相关刺激。', ['h2'], { clearance: 'renal' }),
  drug('lactulose', '乳果糖', 'Lactulose', '消化系统', 10000, 180, 480, { laxative: 1.4, irritation: 8, k: -0.12 }, '渗透性增加肠道含水量与肠动力；模型高负担时出现腹泻和水分丢失。', ['laxative'], { unit: 'g', reference: 10, lag: 300, onsetDelay: 720, clearance: 'local' }),
  drug('amoxicillin', '阿莫西林', 'Amoxicillin', '抗感染', 500, 40, 80, { irritation: 6 }, '抑制细菌细胞壁合成。仅作用于模型敏感的细菌情景，不治疗病毒；真实药敏因菌株而异。', ['antibiotic'], { clearance: 'renal' }),
  drug('clarithromycin', '克拉霉素', 'Clarithromycin', '抗感染', 250, 60, 300, { irritation: 10, qt: 14 }, '抑制细菌蛋白合成并抑制 CYP3A4，模型中可延缓特定药物清除，并抑制敏感细菌情景。', ['antibiotic', 'cyp-inhibitor', 'qt-drug']),
  drug('doxycycline', '多西环素', 'Doxycycline', '抗感染', 100, 60, 1080, { irritation: 11 }, '抑制细菌蛋白合成；钙、镁等多价离子可减少模型中的有效吸收，并减弱对敏感细菌情景的作用。', ['antibiotic', 'chelatable']),
  drug('prednisolone', '泼尼松龙', 'Prednisolone', '激素调节', 5, 50, 240, { glucoseRaise: 1.3, k: -0.15, allergy: -2, sbp: 3, irritation: 4 }, '糖皮质激素改变糖代谢与炎症响应；模型显示血糖升高和轻度电解质变化。', ['steroid'], { lag: 120 }),
  drug('levothyroxine', '左甲状腺素', 'Levothyroxine', '激素调节', 50, 120, 10080, { hr: 8, temp: 0.2, stimulation: 6 }, '补充甲状腺激素，缓慢改变代谢和心率；短时实验中变化很小。', ['thyroid', 'chelatable'], { unit: 'μg', lag: 1440 }),
  drug('potassium', '氯化钾', 'Potassium chloride', '电解质补充', 500, 50, 240, { k: 0.35, irritation: 5 }, '补充钾；模型肾排泄能力下降或合用保钾药时，血钾上升更明显。', ['potassium-supplement'], { clearance: 'renal' }),
  drug('magnesium', '柠檬酸镁', 'Magnesium citrate', '电解质补充', 200, 80, 480, { mg: 0.12, laxative: 0.3 }, '补充镁并增加肠道渗透负担；此处用量按元素镁的模型标定表示。', ['mineral'], { clearance: 'renal' }),
  drug('calcium', '碳酸钙', 'Calcium carbonate', '电解质补充', 500, 90, 480, { ca: 0.12, gastroProtect: 3, gutSlow: 0.3 }, '补充钙并中和部分胃酸；此处用量按碳酸钙质量表示。', ['mineral'], { clearance: 'renal' }),
];

DRUGS.push(...criticalCareDrugs(drug));
for (const item of DRUGS) { configureDrugProfile(item); configureDelivery(item); item.toxicities = toxicityFor(item); }

const food = (id, name, english, category, serving, unit, nutrients, mechanism, tags = []) => ({
  id, name, english, category, reference: serving, unit, kind: 'food', route: '进食',
  nutrients: { carbs: 0, protein: 0, fat: 0, fiber: 0, water: 0, sodium: 0, potassium: 0, ...nutrients },
  mechanism, tags,
});
export const FOODS = [
  food('rice', '白米饭', 'Rice', '主食谷物', 150, 'g', { carbs: 43, protein: 4, water: 100 }, '淀粉消化后逐步提供葡萄糖，典型餐后血糖曲线。'),
  food('oats', '燕麦粥', 'Oatmeal', '主食谷物', 200, 'g', { carbs: 27, protein: 5, fat: 3, fiber: 4, water: 160 }, '纤维延缓碳水吸收，血糖上升较平缓。'),
  food('bread', '全麦面包', 'Whole wheat bread', '主食谷物', 60, 'g', { carbs: 26, protein: 7, fat: 3, fiber: 4, sodium: 280, potassium: 140 }, '提供碳水、蛋白和纤维，同时带入一定钠。'),
  food('juice', '橙汁', 'Orange juice', '饮品与糖类', 200, 'mL', { carbs: 20, water: 180, potassium: 380, simple: 1 }, '液体糖较快吸收，同时提供水分和钾。'),
  food('glucose', '葡萄糖水', 'Glucose drink', '饮品与糖类', 200, 'mL', { carbs: 20, water: 180, simple: 1 }, '单糖快速吸收，模型血糖较快升高，不需要复杂碳水分解。'),
  food('water', '饮用水', 'Water', '饮品与糖类', 250, 'mL', { water: 250 }, '经消化道吸收，逐步补充水分；不提供能量。'),
  food('coffee', '黑咖啡', 'Coffee', '饮品与糖类', 200, 'mL', { water: 198, caffeine: 90 }, '咖啡因增加模型觉醒与心率，影响会随时间衰减。', ['caffeine']),
  food('beer', '啤酒', 'Beer', '酒精饮品', 330, 'mL', { carbs: 12, water: 310, alcohol: 13 }, '酒精产生中枢抑制并干扰糖代谢，和镇静药存在叠加。', ['alcohol']),
  food('grapefruit', '西柚汁', 'Grapefruit juice', '果蔬', 200, 'mL', { carbs: 18, water: 180, potassium: 300, simple: 1 }, '提供糖和水分；模型抑制肠道 CYP3A4，使部分药物暴露增加。', ['grapefruit']),
  food('banana', '香蕉', 'Banana', '果蔬', 120, 'g', { carbs: 27, protein: 1, fiber: 3, water: 90, potassium: 430 }, '同时提供碳水、纤维和钾，消化速度慢于含糖饮品。', ['high-potassium']),
  food('spinach', '菠菜', 'Spinach', '果蔬', 100, 'g', { carbs: 4, protein: 3, fiber: 2, water: 90, potassium: 550, vitaminK: 400 }, '提供钾、纤维和维生素 K；模型维生素 K 会改变华法林的效应。', ['vitamin-k', 'high-potassium']),
  food('apple', '苹果', 'Apple', '果蔬', 180, 'g', { carbs: 25, fiber: 4, water: 150, potassium: 190 }, '果糖与纤维形成相对缓慢的糖负荷。'),
  food('milk', '纯牛奶', 'Milk', '蛋白与乳品', 250, 'mL', { carbs: 12, protein: 8, fat: 8, water: 220, potassium: 350, calcium: 300 }, '乳糖、蛋白和脂肪缓慢吸收；钙可影响部分药物的吸收。', ['mineral']),
  food('egg', '水煮鸡蛋', 'Egg', '蛋白与乳品', 50, 'g', { carbs: 0.6, protein: 6, fat: 5, water: 37, sodium: 62 }, '以蛋白和脂肪为主，对即时血糖影响较小。'),
  food('chicken', '鸡胸肉', 'Chicken breast', '蛋白与乳品', 100, 'g', { protein: 31, fat: 4, water: 65, sodium: 74, potassium: 250 }, '高蛋白食物，模型消化较慢，增加饱腹负担。'),
  food('nuts', '混合坚果', 'Mixed nuts', '脂肪与零食', 30, 'g', { carbs: 6, protein: 6, fat: 16, fiber: 3, potassium: 180 }, '脂肪与纤维延缓胃排空，血糖变化小而缓慢。'),
  food('chips', '咸味薯片', 'Potato chips', '脂肪与零食', 50, 'g', { carbs: 27, fat: 16, protein: 3, sodium: 550, potassium: 600 }, '高脂、高钠负荷，模型胃排空较慢并增加钠负担。', ['salty']),
  food('soup', '咸味清汤', 'Salty soup', '脂肪与零食', 250, 'mL', { carbs: 4, protein: 2, water: 240, sodium: 1000 }, '同时提供水与较高钠负荷，改变模型容量与血压。', ['salty']),
];

FOODS.push(
  food('wine', '葡萄酒', 'Wine', '酒精饮品', 150, 'mL', { carbs: 4, water: 130, alcohol: 14 }, '乙醇经消化吸收后增加中枢抑制与低血糖负担；与镇静药存在叠加。', ['alcohol']),
  food('baijiu', '白酒', 'Baijiu', '酒精饮品', 50, 'mL', { water: 24, alcohol: 21 }, '浓度较高的酒精饮品示意，同样体积可带入更多乙醇；并非安全饮酒建议。', ['alcohol']),
  food('whisky', '威士忌', 'Whisky', '酒精饮品', 45, 'mL', { water: 27, alcohol: 14 }, '乙醇增加镇静及呼吸抑制负担，实际成分因产品而异。', ['alcohol']),
  food('cocktail', '含糖鸡尾酒', 'Cocktail', '酒精饮品', 200, 'mL', { carbs: 24, water: 160, alcohol: 16, simple: 1 }, '糖分可先升高血糖，酒精随后抑制中枢并干扰糖维持；不把两种效应互相抵消。', ['alcohol']),
);

export const CATALOG = [...DRUGS, ...FOODS, ...PRODUCTS, ...PATHOGENS];
export const ITEM_BY_ID = Object.fromEntries(CATALOG.map(item => [item.id, item]));
export const categories = kind => [...new Set(CATALOG.filter(item => item.kind === kind).map(item => item.category))];
export function validateEntry(entry) {
  const item = ITEM_BY_ID[entry?.id];
  if (!item) throw new Error('未知的干预条目。');
  if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || entry.amount <= 0) throw new Error(`${item.name}的用量必须是大于 0 的有限数字。`);
  const max = item.reference * 10;
  if (entry.amount > max) throw new Error(`${item.name}超出本次模型输入范围（最多 ${max} ${item.unit}；这不是安全剂量上限）。`);
  return { id: item.id, amount: entry.amount, ...validateSolution(item, entry) };
}
