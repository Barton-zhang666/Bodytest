// 只解释引擎已有状态，不在界面另算一套生理。
export function physiologySummary(v, life) {
  const dead = life.status === 'dead';
  const x = dead ? life.terminalValues : v;
  const facts = [];
  if (x.cardiacArrest) facts.push(`自主循环停止；按压提供 ${x.cprFlow.toFixed(2)} L/min 支持血流，${dead ? '为终末前记录' : '当前仍可施救'}。`);
  if (x.respiratoryArrest) facts.push(x.ventilationRate > 0 ? '自主呼吸暂停，当前由辅助通气提供支持。' : '自主呼吸暂停，尚无有效辅助通气。');
  if (x.cardiacOutput < 3.5) facts.push(`心输出量降至 ${x.cardiacOutput.toFixed(2)} L/min；每搏量和血管收缩的代偿有限。`);
  if (x.oxygenDeficit > 1) facts.push(`仍有 ${x.oxygenDeficit.toFixed(1)}% 的耗氧需求未满足，正在形成氧债并增加乳酸负担。`);
  else if (x.oxygenExtraction > 40) facts.push('组织正在提高氧提取率；留给进一步代偿的储备已减少。');
  if (x.spo2 >= 94 && (x.oxygenDeficit > 5 || x.oxygenExtraction > 40)) facts.push('动脉血氧比例尚可，但不能据此排除组织缺氧。');
  if (x.brainOxygen < 60) facts.push('脑供氧不足影响意识；进一步下降会削弱呼吸驱动。');
  if (x.renalPerfusion < 70) facts.push('肾灌注下降：尿量先减少，滤过与药物清除随后受影响。');
  if (x.co2 > 50) facts.push('有效肺泡通气不足，CO₂ 潴留正在影响 pH 与意识。');
  if (x.glucose < 3.5) facts.push('低血糖引起交感反应并损害脑功能；严重时也会限制呼吸驱动。');
  if (x.potassium > 6 || x.potassium < 2.8) facts.push('严重血钾异常正在影响收缩与传导，可反过来进一步降低肾灌注。');
  if (x.liverDamage > 40) facts.push('肝功能下降会减慢药物与乳酸清除，并影响凝血和葡萄糖维持。');
  if (x.bleedingRisk > 70 && x.bloodLoss > 1) facts.push('持续失血降低循环容量；血红蛋白随时间下降，进一步减少携氧能力。');
  if (x.ph < 7.35) facts.push(x.co2 > 45 && x.bicarbonate < 22 ? '呼吸性与代谢性酸负担叠加。' : x.co2 > 45 ? 'CO₂ 升高带来呼吸性酸负担。' : '缓冲碱减少带来代谢性酸负担，呼吸会尝试代偿。');
  if (!facts.length) facts.push('当前循环与通气能够满足模型耗氧需求。观察氧提取、脑肾灌注，才能看清代偿是否足够。');
  return { values: x, title: dead ? '终末前的全身反馈' : '全身生理反馈', description: facts.join(' ') };
}

export function pulseReading(v, dead = false) {
  if (dead) return { text: '—', label: '无脉搏信号', unreliable: true };
  if (v.cardiacArrest) return { text: '—', label: '无自主脉搏 · 可施救', unreliable: true };
  if (v.pulseSignal < 25) return { text: '—', label: '低灌注 · 无可靠读数', unreliable: true };
  if (v.pulseSignal < 50) return { text: `≈${v.spo2.toFixed(1)}`, label: '低灌注 · 读数不可靠', unreliable: true };
  return { text: v.spo2.toFixed(1), label: '', unreliable: false };
}
