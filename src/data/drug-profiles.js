const label = (setid, text) => ({ source: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`, text });
export const TIMING_EVIDENCE = {
  norepinephrine: label('759807dd-61a8-4f6f-8bf5-f6ee773c81bc', 'IV：清除半衰期约 2.4 min；停泵后升压效应通常在 1–2 min 内消退。模型余时另按暴露阈值计算。'),
  dopamine: label('c901b461-4f98-da0a-e053-2a95a90a106e', 'IV：起效 ≤5 min，半衰期约 2 min，作用持续不足 10 min；持续泵入时不断补充。'),
  epinephrine: label('db18519b-82a9-435b-85c7-a040d644f057', 'IV：升压起效 <5 min，效应消退通常在 20 min 内；有效半衰期 <5 min。'),
  phenylephrine: label('0bb7af81-62ec-4ae7-8055-89453f7a161d', 'IV：快速起效，升压可持续至 20 min；有效半衰期约 5 min，不等于终末清除长尾。'),
  midodrine: label('4d5e42be-3476-85d4-e063-6294a90a0865', '口服：活性代谢物约 1–2 h 达峰，半衰期 3–4 h；模型采用代谢物的集总响应。'),
  furosemide: label('53e58232-f7f9-c09b-e063-6394a90a5bc4', '口服：通常 1 h 内起效、1–2 h 达峰，利尿约 6–8 h；终末半衰期约 2 h。'),
  amlodipine: label('5b1e1926-d2d4-8bb1-185c-f0da07247b51', '口服：约 6–12 h 达峰，终末半衰期 30–50 h；峰浓度时间不是首次起效时间。'),
  lactulose: label('3fb6e908-893c-5a57-e063-6294a90a1bfc', '口服：主要在结肠局部作用，通便可能需 24–48 h；本模型局部转运/消退参数不是血浆半衰期。'),
  clopidogrel: label('0d010775-1160-4b2e-a928-563a02edd191', '母药半衰期约 6 h；血小板抑制不可逆，受影响血小板生命周期约 7–10 天。模型另设功能恢复项。'),
  diazepam: label('8d564803-7f5a-a2dc-e053-2a95a90a30d9', '先分布后消除，终末半衰期可至 48 h，活性代谢物可更长。残留暴露不等于持续同等程度的镇静。'),
  naloxone: label('bd65e3fe-cd7a-4855-8f55-8cc3a0921ccc', '成人血清半衰期约 30–81 min；拮抗效果取决于阿片药的类型与残留暴露，可能再次出现抑制。'),
};

export function configureDrugProfile(item) {
  if (item.tags.includes('antibiotic')) item.category = '抗菌药';
  if (item.tags.includes('antiviral')) item.category = '抗病毒药';
  const byId = { atropine: ['心率调节', '加快心率'], naloxone: ['受体拮抗剂', '阿片拮抗'], 'iv-glucose': ['血糖调节', '补充葡萄糖'] };
  if (byId[item.id]) item.category = byId[item.id][0];
  if (item.tags.includes('vasopressor')) item.category = '升压与循环支持';
  const groups = { 心血管: '调节循环', 利尿剂: '利尿排液', 血糖调节: '控制血糖', 镇痛与解热: '镇痛 / 解热', 镇静与睡眠: '镇静', 凝血与血小板: '抗栓', 抗过敏: '缓解过敏', 呼吸系统: '舒张气道', 消化系统: '调节消化', 抗菌药: '抑制敏感细菌', 抗病毒药: '抑制特定病毒', 激素调节: '调节激素', 电解质补充: '补充电解质' };
  const specific = { simvastatin: '降低血脂', lactulose: '渗透性通便', omeprazole: '抑制胃酸', famotidine: '抑制胃酸', levothyroxine: '补充甲状腺激素', prednisolone: '抗炎 / 糖代谢调节' };
  item.primaryAction = byId[item.id]?.[1] ?? specific[item.id] ?? (item.tags.includes('vasopressor') ? '升压 / 循环支持' : item.tags.includes('antihypertensive') ? '降压' : groups[item.category]) ?? '调节生理功能';
  item.primaryActionDetail = item.mechanism;
  item.timingEvidence = TIMING_EVIDENCE[item.id];
  if (item.timingEvidence) item.source = item.timingEvidence.source;
}
