// 名称仅指向合成疾病情景；无真实菌株、感染剂量、培养或传播参数。
const scenario = (id, name, english, category, lung, spectrum) => ({
  id, name, english, category, kind: 'pathogen', reference: 10, unit: '虚构负荷单位',
  route: '注入感染情景（非现实注射）', tags: [], lung, spectrum,
  mechanism: `${category}的合成情景：负荷、免疫与炎症随时间变化，再影响体温、循环与器官。虚构负荷不能换算为实际病原体剂量；敏感谱不代表真实药敏。`,
});
export const PATHOGENS = [
  scenario('influenza', '流感病毒情景', 'Influenza scenario', '病毒情景', 1, ['oseltamivir']),
  scenario('rhinovirus', '鼻病毒情景', 'Rhinovirus scenario', '病毒情景', 0.25, []),
  scenario('herpes', '单纯疱疹病毒情景', 'Herpes simplex scenario', '病毒情景', 0.1, ['acyclovir']),
  scenario('pneumococcus', '肺炎链球菌情景', 'Pneumococcus scenario', '细菌情景', 1, ['amoxicillin', 'clarithromycin', 'doxycycline', 'ceftriaxone', 'vancomycin']),
  scenario('ecoli', '大肠杆菌情景', 'E. coli scenario', '细菌情景', 0.15, ['ceftriaxone']),
  scenario('staphylococcus', '金黄色葡萄球菌情景', 'Staphylococcus aureus scenario', '细菌情景', 0.45, ['vancomycin']),
];
