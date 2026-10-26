// 急救用量是虚构模型单位，禁止换算为真人用药方案。
export function criticalCareDrugs(drug) {
  const iv = { route: '静脉注射（模拟）', unit: '模拟单位', lag: 0.15, intravenous: true };
  const pump = { ...iv, route: '静脉泵入（模拟）', infusionMinutes: 10 };
  return [
    drug('epinephrine', '肾上腺素', 'Epinephrine', '急救与循环支持', 1, 1, 3, { hr: 14, inotropy: 0.3, sbp: 26, dbp: 18, resuscitation: 1, qt: 12 }, '增强心肌与血管反应；不能替代按压、供氧及病因处理。高暴露增加心肌负担。', ['vasopressor'], iv),
    drug('dopamine', '多巴胺', 'Dopamine', '急救与循环支持', 1, 1, 2, { hr: 16, inotropy: 0.3, sbp: 18, dbp: 10, qt: 15 }, '短时模型泵入，增强泵血并改变血管张力；不把它当作改善肾脏预后的药物。', ['vasopressor'], pump),
    drug('norepinephrine', '去甲肾上腺素', 'Norepinephrine', '升压与循环支持', 1, 1, 2.4, { inotropy: 0.12, sbp: 32, dbp: 24, qt: 8 }, '短时模型泵入提高外周血管阻力；升压不等于组织供氧一定恢复。', ['vasopressor'], { ...pump, distributionVolume: 8.8 }),
    drug('midodrine', '米多君', 'Midodrine', '升压与循环支持', 5, 30, 210, { sbp: 18, dbp: 12, hr: -2 }, '活性代谢物激动 α₁ 受体，收缩血管、升高血压；可增加卧位高血压负担。', ['vasopressor'], { clearance: 'renal', lag: 20 }),
    drug('phenylephrine', '苯肾上腺素', 'Phenylephrine', '升压与循环支持', 1, 1, 5, { sbp: 24, dbp: 16, hr: -5 }, '主要激动 α₁ 受体而升压，可伴反射性心率减慢；升压不能替代有效血流。', ['vasopressor'], { ...iv, distributionVolume: 340 }),
    drug('atropine', '阿托品', 'Atropine', '急救与循环支持', 1, 1, 120, { hr: 22, gutSlow: 0.3 }, '解除部分模型迷走抑制、增加心率；不作为所有心搏骤停的自动复苏药。', ['anticholinergic'], iv),
    drug('naloxone', '纳洛酮', 'Naloxone', '急救与循环支持', 1, 1, 50, { opioidAntagonist: 2 }, '仅拮抗阿片相关的镇静与呼吸抑制；不抵消所有镇静药。', [], iv),
    drug('iv-glucose', '静脉葡萄糖', 'Dextrose', '急救与循环支持', 1, 1, 12, { glucoseRaise: 12 }, '快速增加模型葡萄糖供应；过多会产生高血糖和渗透性利尿。', [], iv),
    drug('ceftriaxone', '头孢曲松', 'Ceftriaxone', '抗感染', 1, 1, 480, { irritation: 3 }, '静脉抗菌示意，仅作用于模型敏感谱中的细菌；不治疗病毒。', ['antibiotic'], { ...iv, clearance: 'mixed' }),
    drug('vancomycin', '万古霉素', 'Vancomycin', '抗感染', 1, 1, 360, { renal: 4, renalToxicity: 0.006 }, '模型泵入的抗菌药，作用于指定革兰阳性细菌情景；高暴露增加肾负担。', ['antibiotic'], { ...pump, infusionMinutes: 30, clearance: 'renal' }),
    drug('oseltamivir', '奥司他韦', 'Oseltamivir', '抗感染', 75, 45, 360, { irritation: 8 }, '在模型中抑制流感情景的复制，对其他病毒和细菌不直接起效。', ['antiviral'], { clearance: 'renal' }),
    drug('acyclovir', '阿昔洛韦', 'Acyclovir', '抗感染', 200, 45, 180, { renal: 2, renalToxicity: 0.003 }, '在模型中抑制单纯疱疹情景；清除受肾功能影响。', ['antiviral'], { clearance: 'renal' }),
  ];
}

const product = (id, name, category, reference, composition, mechanism) => ({
  id, name, english: id, kind: 'product', category, reference, unit: 'mL', route: '分时输注模拟',
  tags: [], composition, mechanism, duration: 20,
});
export const PRODUCTS = [
  product('red-cells', '浓缩红细胞', '血液成分', 250, { hemoglobin: 250, potassium: 0.12, citrate: 0.1 }, '补充红细胞质量与循环容量，提高携氧能力；也可增加容量、钾与枸橼酸负担。'),
  product('plasma', '血浆', '血液成分', 200, { clotting: 1, citrate: 0.22 }, '支持凝血因子通路并增加容量；不会直接补足血红蛋白或血小板。'),
  product('platelets', '血小板成分', '血液成分', 250, { platelets: 35, citrate: 0.16 }, '支持血小板功能代理并增加容量；不能替代血浆或红细胞。'),
  product('whole-blood', '全血', '血液成分', 250, { hemoglobin: 145, clotting: 0.35, platelets: 8, potassium: 0.06, citrate: 0.1 }, '同时补充模型血容量、红细胞及部分凝血成分；不模拟真实制品保存差异。'),
  product('saline', '等渗盐水', '晶体液', 250, {}, '补充容量；载液 Na、Cl 各 154 mmol/L。稀释血红蛋白、蛋白及未含有的小分子，血钠不同比下降；过多增加肺部负担。'),
];

export const TOXICITY_LABELS = {
  kidney: ['潜在肾损伤', '与暴露、脱水、低灌注及既有肾功能有关；并非每次使用都会造成损伤。'],
  liver: ['潜在肝损伤', '较高或持续暴露可能增加肝脏负担；并非每次使用都会造成损伤。'],
  heart: ['心律 / 循环风险', '可能改变心率、传导、心肌负担或血压，合并电解质异常时需关注。'],
  respiratory: ['呼吸抑制风险', '中枢抑制可使呼吸变慢或变浅，与其他抑制物叠加时加重。'],
  bleeding: ['出血风险', '影响凝血、血小板或黏膜保护；风险不等于必然发生出血。'],
  glucose: ['低血糖风险', '可增加低血糖负担，严重时影响意识和呼吸驱动。'],
};
export function toxicityFor(item) {
  const keys = new Set();
  if (item.effects.renal || item.effects.renalToxicity) keys.add('kidney');
  if (['paracetamol', 'simvastatin', 'clarithromycin'].includes(item.id)) keys.add('liver');
  if (item.tags.some(t => ['slow-heart', 'qt-drug', 'vasopressor', 'beta2', 'theophylline'].includes(t))) keys.add('heart');
  if ((item.effects.resp ?? 0) < 0) keys.add('respiratory');
  if (item.tags.some(t => ['anticoagulant', 'antiplatelet', 'nsaid'].includes(t))) keys.add('bleeding');
  if (item.tags.includes('hypoglycemic')) keys.add('glucose');
  return [...keys].map(key => ({ key, label: TOXICITY_LABELS[key][0], detail: TOXICITY_LABELS[key][1] }));
}
