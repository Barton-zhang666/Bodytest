// 浓度区间为输入控件的教学范围，不对应真实制剂规格或配药方案。
export function configureDelivery(item) {
  if (item.intravenous || item.id === 'lactulose') {
    const referenceVolume = item.intravenous ? 10 : 20;
    const concentration = item.reference / referenceVolume;
    item.solution = { concentration, minConcentration: concentration / 10,
      maxConcentration: concentration * 10, concentrationStep: concentration / 100,
      referenceVolume, maxVolume: referenceVolume * 10, volumeStep: referenceVolume / 100 };
    if (!item.intravenous) item.route = '口服液';
  }
  return item;
}

export function defaultEntry(item) {
  return item.solution ? { id: item.id, amount: item.reference,
    concentration: item.solution.concentration, volume: item.solution.referenceVolume } : { id: item.id, amount: item.reference };
}

export const solutionAmount = (concentration, volume) => Number((concentration * volume).toPrecision(12));

export function validateSolution(item, entry) {
  const hasSolution = entry.concentration !== undefined || entry.volume !== undefined;
  if (!hasSolution) return {}; // V4 旧记录保留原来的纯药量含义，不追加假定液体。
  const s = item.solution;
  if (!s) throw new Error(`${item.name}未定义可调浓度剂型。`);
  const { concentration, volume } = entry;
  if (!Number.isFinite(concentration) || concentration < s.minConcentration || concentration > s.maxConcentration) throw new Error(`${item.name}的浓度超出模型范围。`);
  if (!Number.isFinite(volume) || volume <= 0 || volume > s.maxVolume) throw new Error(`${item.name}的体积必须大于 0 且不超过 ${s.maxVolume} mL。`);
  const expected = solutionAmount(concentration, volume);
  if (Math.abs(expected - entry.amount) > Math.max(1e-10, expected * 1e-9)) throw new Error(`${item.name}的药量与浓度 × 体积不一致。`);
  return { concentration, volume };
}
