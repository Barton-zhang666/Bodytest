export const deliveryNumber = x => Number.isFinite(x) ? Number(x.toPrecision(6)).toString() : '—';
export function routeBadge(item) {
  return `<span class="route-badge ${item.intravenous ? 'route-injection' : ''}">使用方式：${item.route}</span>`;
}
export function solutionControls(item, entry) {
  const s = item.solution;
  const control = (field, label, unit, value, min, max, step) => `<div class="solution-control"><label for="${field}-${item.id}">${label}<small>${unit}</small></label><input id="${field}-${item.id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-solution="${field}" data-item="${item.id}" aria-label="${item.name}${label}数值"><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-solution="${field}" data-item="${item.id}" aria-label="${item.name}${label}"></div>`;
  return `<div class="solution-controls">
    ${control('concentration', '浓度', item.unit + '/mL', entry.concentration, s.minConcentration, s.maxConcentration, s.concentrationStep)}
    ${control('volume', item.intravenous ? '注入体积' : '口服体积', 'mL', entry.volume, 0, s.maxVolume, s.volumeStep)}
    <div class="solution-reference"><i id="solution-tick-${item.id}" style="left:${Math.min(100, item.reference / entry.concentration / s.maxVolume * 100)}%"></i></div>
    <output id="solution-formula-${item.id}" class="solution-formula">${solutionFormula(item, entry)}</output>
    <small id="solution-guide-${item.id}">${solutionGuide(item, entry)}</small>
    <small>浓度范围 ${deliveryNumber(s.minConcentration)}–${deliveryNumber(s.maxConcentration)} ${item.unit}/mL；药量上限 ${item.reference * 10} ${item.unit}（10×）。均为模型范围。</small>
  </div>`;
}
export function solutionFormula(item, entry) {
  return `${deliveryNumber(entry.concentration)} ${item.unit}/mL × ${deliveryNumber(entry.volume)} mL = ${deliveryNumber(entry.amount)} ${item.unit}`;
}
export function solutionGuide(item, entry) {
  return `↑ 当前浓度下，1× 标定药量对应 ${deliveryNumber(item.reference / entry.concentration)} mL${item.infusionMinutes ? `；模型泵入时长 ${item.infusionMinutes} min，液体速率 ${deliveryNumber(entry.volume / item.infusionMinutes)} mL/min` : ''}。`;
}
