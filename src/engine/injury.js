// 虚构的教学损伤刻度与持续时间；不得解释为临床组织损伤百分比或预后。
export const ORGAN_DAMAGE = [
  { id: 'heart', name: '心脏', key: 'heartDamage', signs: '胸闷、四肢冰冷、活动无力' },
  { id: 'lungs', name: '肺', key: 'lungDamage', signs: '呼吸困难、口唇发绀' },
  { id: 'brain', name: '大脑', key: 'brainDamage', signs: '反应迟钝、意识丧失、持续昏迷' },
  { id: 'liver', name: '肝脏', key: 'liverDamage', signs: '皮肤发黄、易出血、意识异常' },
  { id: 'kidneys', name: '肾脏', key: 'kidneyDamage', signs: '少尿、水肿、恶心和乏力' },
  { id: 'intestines', name: '肠道', key: 'gutDamage', signs: '腹痛、腹胀、肠动力下降' },
];
const positive = x => Math.max(0, x);
const bounded = x => Math.min(3, positive(x));

export function accumulateInjury(v, dt, hepaticToxicity = 0) {
  const hypoxia = bounded((v.oxygenDeficit ?? 0) / 45);
  const ischemia = bounded((55 - v.map) / 25);
  const cerebral = bounded((45 - (v.brainOxygen ?? 100)) / 30);
  const lowSugar = bounded((2.5 - v.glucose) / 1.5);
  const electrolyte = bounded((v.potassium - 6.5) / 2 + positive((2.5 - v.potassium) / 1.5));
  const rates = {
    heartDamage: hypoxia * 0.45 + ischemia * 0.32 + electrolyte * 0.18,
    lungDamage: ischemia * 0.12 + positive(v.heartDamage - 40) * 0.003 + positive(v.volume - 6.5) * 0.12,
    brainDamage: Math.max(hypoxia, cerebral) * 0.65 + lowSugar * 0.4,
    liverDamage: positive(hepaticToxicity) + ischemia * 0.14 + hypoxia * 0.08,
    kidneyDamage: Math.max(ischemia, bounded((35 - (v.renalPerfusion ?? 100)) / 30)) * 0.28 + hypoxia * 0.15,
    gutDamage: ischemia * 0.2 + hypoxia * 0.08,
  };
  for (const [key, rate] of Object.entries(rates)) v[key] = Math.min(100, v[key] + rate * dt);
}

export function assessLife(v, life, dt) {
  const failures = ORGAN_DAMAGE.filter(o => v[o.key] >= 70);
  const threats = [
    [v.spo2 < 65, '持续严重低氧'], [v.map < 40, '持续循环灌注崩溃'],
    [(v.oxygenDeficit ?? 0) > 50, '持续组织氧供需失衡'], [(v.brainOxygen ?? 100) < 25, '持续脑供氧衰竭'],
    [v.glucose < 1.8, '持续严重低血糖'], [v.ph < 7, '持续严重酸中毒'],
    [v.potassium > 8.4 || v.potassium < 1.8, '持续严重血钾异常'],
    [failures.length >= 3, '多器官衰竭'],
  ].filter(([active]) => active).map(([, name]) => name);
  life.crisis = threats.length ? life.crisis + dt : Math.max(0, life.crisis - dt * 0.5);
  const failedVital = v.brainDamage >= 100 ? '不可逆脑功能终止（模型阈值，非临床脑死亡判定）' : '';
  life.status = failedVital ? 'dead' : v.cardiacArrest ? (v.cprFlow > 0.05 ? 'resuscitating' : 'arrest') : v.respiratoryArrest ? 'apnea' : threats.length || failures.length ? 'critical' : 'alive';
  life.cause = life.status === 'dead' ? failedVital || threats.join('、') : '';
  return failures;
}
