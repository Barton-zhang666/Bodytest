const rule = (id, name, sides, severity, explanation, effects = {}) => ({ id, name, sides, severity, explanation, effects });
export const INTERACTIONS = [
  rule('slow-heart', '心率抑制叠加', [['slow-heart'], ['slow-heart']], 'high', '两种减慢心率的药物同时作用，模型心率与灌注进一步下降。', { hr: -9, sbp: -5 }),
  rule('sedative', '中枢抑制叠加', [['sedative'], ['sedative']], 'high', '中枢抑制作用叠加，模型中镇静加深、呼吸频率下降。', { sedation: 15, resp: -4 }),
  rule('alcohol-sedative', '酒精与镇静作用', [['alcohol'], ['sedative']], 'high', '酒精增强中枢抑制；该提示不表示已覆盖所有酒精相互作用。', { sedation: 10, resp: -2 }),
  rule('bleeding', '抗凝与血小板抑制', [['anticoagulant'], ['antiplatelet', 'nsaid']], 'high', '凝血与血小板/胃黏膜影响共同增加模型出血倾向。', { bleed: 20 }),
  rule('dual-antiplatelet', '血小板抑制叠加', [['antiplatelet'], ['antiplatelet']], 'moderate', '两种抗血小板效应叠加，出血倾向升高。', { bleed: 9 }),
  rule('dual-anticoagulant', '抗凝负担叠加', [['anticoagulant'], ['anticoagulant']], 'high', '两类抗凝作用同时存在，模型出血倾向进一步增加。', { bleed: 22 }),
  rule('potassium', '保钾 / 补钾叠加', [['potassium-retain'], ['potassium-retain', 'potassium-supplement', 'high-potassium']], 'high', '减少排钾与增加钾负荷同时发生，肾功能下降时效应更明显。', { k: 0.5 }),
  rule('potassium-loss', '低钾倾向叠加', [['potassium-loss'], ['potassium-loss', 'beta2']], 'moderate', '钾的排出或细胞内转移叠加，可增加电生理负担。', { k: -0.3 }),
  rule('renal-nsaid', '肾灌注负担', [['nsaid'], ['raas', 'diuretic']], 'high', '前列腺素抑制与低容量 / RAAS 改变叠加，降低模型肾灌注。', { renal: 15 }),
  rule('hypoglycemia', '低血糖倾向叠加', [['hypoglycemic'], ['alcohol']], 'high', '促胰岛素作用叠加酒精对糖输出的影响，模型低血糖倾向增加。', { insulin: 0.6 }),
  rule('cyp-grapefruit', '西柚影响药物暴露', [['grapefruit'], ['cyp3a4']], 'moderate', '西柚作用时，模型增加相关口服药的有效吸收；仅限标注底物。'),
  rule('cyp-inhibitor', '清除减慢', [['cyp-inhibitor'], ['cyp3a4']], 'high', '模型降低 CYP3A4 底物的有效清除率，使暴露延长。'),
  rule('vitamin-k', '维生素 K 改变抗凝响应', [['vitamin-k'], ['warfarin']], 'moderate', '维生素 K 在模型中削弱华法林对凝血因子的影响，实际反应依赖持续摄入与个体差异。'),
  rule('chelation', '矿物质影响吸收', [['mineral'], ['chelatable']], 'moderate', '肠道内钙 / 镁负荷使指定药物的有效吸收减少；仅在消化道重叠时计算。'),
  rule('qt-potassium', '电解质与 QT 负担', [['qt-drug'], ['potassium-loss']], 'moderate', '低钾倾向与药物电生理影响叠加，QTc 代理值增加。', { qt: 14 }),
  rule('stimulants', '兴奋作用叠加', [['stimulant'], ['caffeine']], 'moderate', '咖啡因与茶碱的兴奋作用叠加，心率和震颤倾向增加。', { hr: 7, stimulation: 8 }),
];

// entries: { item, strength }[]；强度为当前效应代理，预览时统一为 1。
export function findInteractions(entries) {
  const matches = [];
  for (const r of INTERACTIONS) {
    let strength = 0;
    const participants = new Set();
    for (let a = 0; a < entries.length; a++) {
      if (!entries[a].item.tags.some(t => r.sides[0].includes(t))) continue;
      for (let b = 0; b < entries.length; b++) {
        if (a === b || entries[a].item.id === entries[b].item.id) continue;
        if (!entries[b].item.tags.some(t => r.sides[1].includes(t))) continue;
        strength = Math.max(strength, Math.min(entries[a].strength, entries[b].strength));
        participants.add(entries[a].item.name); participants.add(entries[b].item.name);
      }
    }
    if (strength > 0.035) matches.push({ ...r, strength, participants: [...participants] });
  }
  return matches;
}
