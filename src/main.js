import { CATALOG, DRUGS, FOODS, PATHOGENS, ITEM_BY_ID, categories, validateEntry } from './data/catalog.js';
import { defaultEntry, solutionAmount } from './data/delivery.js';
import { routeBadge, solutionControls, solutionFormula, solutionGuide, deliveryNumber } from './ui/delivery.js';
import { METRICS, METRIC_BY_ID, PROFILES, formatMetric, statusOf } from './data/metrics.js';
import { Simulator, MAX_TIME } from './engine/simulator.js';
import { icon } from './ui/icons.js';
import { ORGANS, anatomyMarkup, organDetail, animateAnatomy, setAnatomyAngle, updateAnatomyState, initializeAnatomy, setAnatomySelection, setAnatomyZoom, resetAnatomy, setAnatomyVessels } from './ui/anatomy.js';
import { drawWave, drawSpark, drawTrend } from './ui/charts.js';

import { ORGAN_DAMAGE } from './engine/injury.js';
import { MonitorAudio } from './ui/audio.js';
import { physiologySummary, pulseReading } from './ui/physiology.js';

const monitorAudio = new MonitorAudio();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'vitalis.experiment.v5';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { view: 'lab', tab: 'drug', category: 'all', query: '', page: 1, queue: [], running: false, speed: 60, organ: null, zoom: 1, vessels: true, trend: 'hr', visualTime: 0 };
let sim = new Simulator();
let restoreNotice = '';
let storageAvailable = true;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved && (localStorage.getItem('vitalis.experiment.v4') || localStorage.getItem('vitalis.experiment.v3') || localStorage.getItem('vitalis.experiment.v2'))) restoreNotice = '已启用 V5 药物与体液模型；新建实验，旧版存档保留。';
  if (saved) { sim = Simulator.restore(JSON.parse(saved)); restoreNotice = '已恢复上次本地实验，当前处于暂停状态。'; }
} catch { restoreNotice = '本地存档无法恢复，已创建新实验；原存档暂时保留，可先导出当前实验。'; }

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
function clockText(minutes) {
  const total = Math.floor(minutes * 60);
  const days = Math.floor(total / 86400);
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${days ? `${days}d ` : ''}${hh}:${mm}:${ss}`;
}
let toastTimeout;
function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 4400);
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sim.serialize()));
    $('#save-status').innerHTML = '<i></i> 已在本地保存'; storageAvailable = true;
  } catch {
    $('#save-status').textContent = '本地保存不可用';
    if (storageAvailable) toast('浏览器本地保存不可用，请通过“导出实验”保存记录。');
    storageAvailable = false;
  }
}

const primaryMetrics = [
  { id: 'hr', label: '心率', code: 'HR', unit: 'bpm', symbol: 'heart', color: '#7fa98b' },
  { id: 'sbp', label: '血压', code: 'NIBP', unit: 'mmHg', symbol: 'activity', color: '#a8a071' },
  { id: 'spo2', label: '血氧饱和度', code: 'SpO₂', unit: '%', symbol: 'drop', color: '#7cabb4' },
  { id: 'rr', label: '呼吸频率', code: 'RESP', unit: '次/min', symbol: 'lungs', color: '#8baab4' },
  { id: 'glucose', label: '血糖', code: 'GLU', unit: 'mmol/L', symbol: 'drop', color: '#bdab7e' },
  { id: 'volume', label: '循环血容量', code: 'BV', unit: 'L', symbol: 'drop', color: '#aa97b5' },
];

function initialize() {
  hydrateIcons();
  $('#profile').innerHTML = PROFILES.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('#profile').value = sim.profile.id;
  $('#profile').title = sim.profile.description;
  $('#anatomy').innerHTML = anatomyMarkup();
  initializeAnatomy($('#anatomy'), {
    onSelect: id => selectOrgan(id),
    onView: view => {
      state.zoom = view.zoom;
      $('#anatomy-angle').value = String(Math.round(view.yaw));
      $('#angle-value').textContent = Math.round(view.yaw) + '°';
      $('#anatomy-direction').textContent = Math.abs(view.yaw) < 45 ? '正面' : Math.abs(view.yaw) > 135 ? '背面' : view.yaw > 0 ? '人体右侧' : '人体左侧';
    },
  });
  $('#organ-picker').innerHTML = ORGANS.map(o => `<button class="organ-option ${o.id === state.organ ? 'active' : ''}" data-organ="${o.id}" style="--organ-color:${o.color}" aria-pressed="${o.id === state.organ}"><i></i>${o.name}</button>`).join('');
  $('#vitals-grid').innerHTML = primaryMetrics.map(m => `<button class="vital-card" data-metric="${m.id}" style="--card-color:${m.color}" aria-label="查看${m.label}趋势"><div class="vital-card-heading"><span>${icon(m.symbol)}${m.label}</span><small>${m.code}</small></div><div class="vital-number ${m.id === 'sbp' ? 'bp' : ''}"><b id="value-${m.id}"></b><small>${m.unit}</small></div><canvas id="spark-${m.id}" class="mini-spark" aria-hidden="true"></canvas><div class="vital-footer"><span id="status-${m.id}" class="metric-status">正常</span><span class="vital-range">${m.id === 'sbp' ? '90–139 / 60–89' : METRIC_BY_ID[m.id].range.join('–')}</span></div></button>`).join('');
  $('#trend-metric').innerHTML = METRICS.map(m => `<option value="${m.id}">${m.name} ${m.unit}</option>`).join('');
  $('#drug-count').textContent = DRUGS.length; $('#food-count').textContent = FOODS.length;
  $('#catalog-summary').textContent = `${DRUGS.length} 种药物 / ${FOODS.length} 种食物`;
  $('#infection-scenario').innerHTML = PATHOGENS.map(p => `<option value="${p.id}">${p.name} · ${p.category}</option>`).join('');
  $('#infection-description').textContent = PATHOGENS[0].mechanism;
  setCategoryOptions(); selectOrgan(state.organ); renderQueue(); renderLibrary(); renderParameters(); render();
  bindEvents();
  if (restoreNotice) toast(restoreNotice);
}

function setCategoryOptions() {
  $('#category').innerHTML = '<option value="all">全部分类</option>' + categories(state.tab).map(c => `<option>${c}</option>`).join('');
  $('#category').value = state.category;
}

function setView(view) {
  state.view = view;
  $('#lab-view').hidden = view !== 'lab'; $('#parameters-view').hidden = view !== 'parameters';
  $$('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); el.setAttribute('aria-current', el.dataset.view === view ? 'page' : 'false'); });
  $('#page-title').innerHTML = view === 'lab' ? '探索身体里的每一次变化<span class="version-badge">LAB 01</span>' : '读懂生命系统的实时信号<span class="version-badge">MONITOR</span>';
  if (view === 'parameters') { renderParameters(); renderTrend(); }
}

function setTab(tab) {
  state.tab = tab; state.page = 1; state.query = ''; state.category = 'all'; $('#search').value = '';
  $$('.library-tab').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-selected', String(button.dataset.tab === tab)); });
  $('#library-filters').hidden = !['drug', 'food', 'product'].includes(tab);
  if (['drug', 'food', 'product'].includes(tab)) setCategoryOptions();
  renderLibrary();
}

function selectOrgan(id) {
  if (id !== null && !ORGANS.some(o => o.id === id)) return;
  if (id === state.organ) id = null;
  state.organ = id;
  setAnatomySelection($('#anatomy'), id);
  $$('[data-organ]').forEach(el => {
    el.classList.toggle('active', el.dataset.organ === id); el.classList.toggle('selected', el.dataset.organ === id);
    if (el.tagName === 'BUTTON' || el.classList.contains('organ')) el.setAttribute('aria-pressed', String(el.dataset.organ === id));
  });
  $('#organ-detail').innerHTML = organDetail(id, sim.values);
}

function render() {
  const v = sim.values;
  const dead = sim.life.status === 'dead';
  if (dead) state.running = false;
  renderCare();
  $('#sim-clock').textContent = clockText(sim.time + sim.pending);
  $('#play-button').innerHTML = `${icon(state.running ? 'pause' : 'play')}<span>${dead ? '模型已死亡' : state.running ? '暂停模拟' : sim.time > 0 ? '继续模拟' : '开始模拟'}</span>`;
  $('#play-button').setAttribute('aria-label', dead ? '模型已死亡' : state.running ? '暂停模拟' : '开始模拟');
  $('#play-button').disabled = dead || sim.time >= MAX_TIME;
  $$('[data-forward]').forEach(el => { el.disabled = dead || sim.time >= MAX_TIME; });
  $('#live-badge').innerHTML = `<i></i>${dead ? '生命活动终止' : state.running ? '实时监测中' : '已暂停'}`;
  $('#live-badge').classList.toggle('running', state.running);
  const severe = sim.symptoms.some(s => s.severity === 'high');
  const abnormal = METRICS.some(m => statusOf(m, v[m.id]) !== 'normal');
  const any = sim.symptoms.length > 0 || abnormal;
  $('#model-status').className = `model-status ${severe ? 'danger' : any ? 'caution' : ''}`;
  $('#model-status').innerHTML = `<i></i><span>${dead ? '模型死亡' : ['critical', 'arrest', 'apnea', 'resuscitating'].includes(sim.life.status) ? ({ critical: '生命状态危重', arrest: '心搏骤停 · 可施救', apnea: '呼吸暂停 · 可施救', resuscitating: '复苏中 · 按压支持' }[sim.life.status]) : sim.boundaries.length ? '已触及模型边界' : severe ? '存在明显异常' : sim.symptoms.length ? '出现症状 / 参数异常' : abnormal ? '指标偏离参考区间' : '内环境平稳'}</span><small>${severe ? 'CRITICAL STATE' : any ? 'SYSTEM RESPONSE' : 'HOMEOSTASIS'}</small>`;
  for (const m of primaryMetrics) {
    const s = statusOf(METRIC_BY_ID[m.id], v[m.id]);
    const bpStatus = m.id === 'sbp' ? statusOf(METRIC_BY_ID.dbp, v.dbp) : 'normal';
    const actualStatus = s !== 'normal' ? s : bpStatus;
    $(`#value-${m.id}`).textContent = m.id === 'sbp' ? `${Math.round(v.sbp)}/${Math.round(v.dbp)}` : formatMetric(m.id, v[m.id]);
    $(`#status-${m.id}`).textContent = actualStatus === 'normal' ? '参考区间内' : actualStatus === 'high' ? '↑ 偏高' : '↓ 偏低';
    $(`#status-${m.id}`).className = `metric-status ${actualStatus}`;
    $(`[data-metric="${m.id}"]`).classList.toggle('abnormal', actualStatus !== 'normal');
  }
  const pulse = pulseReading(v, dead);
  $('#value-spo2').textContent = pulse.text;
  if (pulse.unreliable) {
    $('#status-spo2').textContent = pulse.label;
    $('#status-spo2').className = 'metric-status low';
    $('[data-metric="spo2"]').classList.add('abnormal');
  }
  const coupling = physiologySummary(v, sim.life);
  $('#coupling-title').textContent = coupling.title;
  $('#coupling-description').textContent = coupling.description;
  for (const key of ['cardiacOutput', 'oxygenDelivery', 'oxygenExtraction', 'brainOxygen', 'renalPerfusion', 'alveolarVentilation']) {
    $(`#coupling-${key}`).textContent = formatMetric(key, coupling.values[key]);
  }
  $('#wave-value-ecg').innerHTML = `${Math.round(v.hr)}<small>bpm</small>`;
  $('#wave-value-resp').innerHTML = `${Math.round(v.ventilationRate)}<small>${sim.support.ventilated ? '含辅助' : '次/min'}</small>`;
  $('#wave-value-eeg').innerHTML = `${v.eeg.toFixed(1)}<small>Hz</small>`;
  $('#organ-detail').innerHTML = organDetail(state.organ, v);
  $('#symptom-count').textContent = sim.symptoms.length;
  const systemsExpanded = $('.system-signs')?.open;
  const physical = sim.symptoms.filter(x => x.kind === 'physical');
  const system = sim.symptoms.filter(x => x.kind !== 'physical');
  const chips = items => items.map(x => `<button class="symptom-chip ${x.severity}" data-symptom="${x.id}" title="${x.explanation}">${icon(x.severity === 'high' ? 'warn' : 'activity')}${x.name}</button>`).join('');
  $('#symptoms').innerHTML = (dead ? `<div class="death-notice" role="status"><b>模型已死亡 · ${clockText(sim.life.time)}</b><p>${sim.life.cause}。生命活动已终止，实验停留在终末状态。</p><small>可导出记录或新建实验。下方保留死亡前症状和生化样本，不能用于预测真实死亡。</small></div>` : '')
    + `<div class="observed-signs"><b>${dead ? '终末前的可观察表现' : '当前可观察表现'}</b>${physical.length ? '<div class="symptom-chips">' + chips(physical) + '</div><p>' + physical.slice(0, 2).map(x => x.explanation).join(' ') + '</p>' : '<p>尚无明显外在症状；可继续观察各项参数。</p>'}</div>
    <div class="damage-grid">${ORGAN_DAMAGE.map(o => `<button class="damage-card ${v[o.key] >= 70 ? 'failed' : v[o.key] > 0 ? 'injured' : ''}" data-organ="${o.id}" aria-label="查看${o.name}损伤"><span>${o.name}<small>${v[o.key] >= 70 ? '衰竭' : v[o.key] > 0 ? '不可逆损伤' : '未损伤'}</small></span><div class="damage-track"><i style="width:${v[o.key]}%"></i></div><b>${v[o.key].toFixed(1)}<small> / 100</small></b></button>`).join('')}</div>
    <small class="damage-caption">损伤为累积教学刻度，70 起标记模型衰竭；解除诱因后不会清零。</small>
    ${system.length ? '<details class="system-signs"><summary>系统与实验室异常（' + system.length + '）</summary><div class="symptom-chips">' + chips(system) + '</div></details>' : ''}`;
  if (systemsExpanded && $('.system-signs')) $('.system-signs').open = true;
  const appearance = updateAnatomyState($('#anatomy'), v, sim.symptoms, sim.life, { paused: !state.running || document.hidden || state.view !== 'lab', reducedMotion: reducedMotion.matches, visible: state.view === 'lab' });
  if ($('#appearance-summary').textContent !== appearance.summary) $('#appearance-summary').textContent = appearance.summary;

  if (sim.interactions.length) $('#symptoms').insertAdjacentHTML('beforeend', `<p class="interaction-inline">${icon('info')} ${sim.interactions.length} 项相互作用正在影响模型 · 详见体内活性</p>`);
  if (sim.boundaries.length) $('#symptoms').insertAdjacentHTML('beforeend', '<p class="boundary-note">部分参数触及数值保护范围；此状态不能用于推断真实人体可存活性。</p>');
  if (sim.time >= MAX_TIME) $('#symptoms').insertAdjacentHTML('beforeend', '<p class="boundary-note">已到达本次 7 天模型时限，请导出或新建实验。</p>');
  if (['active', 'events'].includes(state.tab)) renderLibrary();
  if (state.queue.length) renderQueuePreview();
  if (state.view === 'parameters') { updateParameterValues(); renderTrend(); }
  if (state.view === 'lab') drawSparks();
}

function drawSparks() {
  const recent = [...sim.history.filter(p => p.time >= sim.time - 60), { time: sim.time, ...sim.values }];
  for (const m of primaryMetrics) drawSpark($(`#spark-${m.id}`), recent, m.id, m.color);
}

function riskBadges(item) {
  if (item.kind !== 'drug') return '';
  return `<div class="toxicity-badges"><span class="toxicity-tag function-tag" tabindex="0" aria-label="主要作用：${item.primaryAction}。${item.primaryActionDetail}"><b>主要作用 · ${item.primaryAction}</b><span role="tooltip">${item.primaryActionDetail}</span></span>${item.toxicities.length ? item.toxicities.map(t => `<span class="toxicity-tag" tabindex="0" title="${t.detail}" aria-label="${t.label}：${t.detail}"><b>${t.label}</b><span role="tooltip">${t.detail}</span></span>`).join('') : '<small>风险未完整列出 ≠ 无毒性</small>'}</div>`;
}

function renderCare() {
  const r = sim.support, v = sim.values, dead = sim.life.status === 'dead';
  $('#rescue-state').textContent = { alive: '自主循环', critical: '危重 · 可干预', arrest: '心搏骤停 · 可施救', apnea: '自主呼吸暂停', resuscitating: '复苏中 · 按压支持', dead: '不可逆脑功能终止（模型）' }[sim.life.status];
  $('#rescue-status').textContent = `气道：${r.intubated ? '导管已建立' : '未插管'} · 辅助通气：${r.ventilated ? '已开启' : '关闭'} · 氧支持：${r.oxygen ? '开启' : '关闭'} · 已按压 ${r.totalCompressions} 次 · 支持血流 ${v.cprFlow.toFixed(2)} L/min`;
  $('#brain-reserve-label').textContent = `不可逆脑损伤 ${v.brainDamage.toFixed(1)} / 100 · 终末阈值为模型规则，非临床诊断`;
  $('#brain-damage-progress').value = v.brainDamage;
  $('#apply-infection').disabled = dead || sim.time >= MAX_TIME;
  $('#compression-button').disabled = dead || !r.arrest;
  $$('[data-rescue]').forEach(el => { el.disabled = dead || (el.dataset.rescue === 'ventilate' && !r.intubated); });
  $('#infection-status').innerHTML = sim.infections.length ? sim.infections.map(x => `<div class="infection-row"><b>${x.item.name}</b><span>负荷 ${x.load.toFixed(1)} · 免疫反应 ${(x.immune * 100).toFixed(0)}% · ${x.treatment > 0.01 ? '匹配治疗生效中' : '无匹配药物作用'}</span><progress max="100" value="${x.load}" aria-label="${x.item.name}负荷"></progress></div>`).join('') : '<p>暂无感染情景。可添加不同的合成病毒或细菌情景。</p>';
  const products = sim.infusions.filter(x => x.remaining > 0).map(x => `${x.item.name}：剩余 ${x.remaining.toFixed(0)} mL`);
  const pumps = sim.doses.filter(x => x.reservoir > 0).map(x => `${ITEM_BY_ID[x.id].name}泵入：剩余 ${x.reservoir.toFixed(2)} 模拟单位${x.volume === undefined ? '' : ` / ${deliveryNumber(x.fluidRemaining)} mL（${x.concentration} 模拟单位/mL）`}`);
  $('#infusion-status').textContent = [...products, ...pumps].join('；') || '暂无进行中的输注。';
}

function rescue(action) {
  try {
    sim.performRescue(action);
    if (action === 'compress') { setSpeed(1); state.running = true; }
    if (action.startsWith('training')) { state.running = false; setSpeed(1); }
    render(); save();
    if (action !== 'compress') toast('急救操作已记录；可继续模拟观察效果。');
  } catch (error) { toast(error.message); }
}

function renderLibrary() {
  const container = $('#library-content');
  const pagination = $('#library-pagination');
  if (state.tab === 'active') {
    const drugs = sim.activeDrugStatus();
    const foods = sim.exposures.filter(x => x.item.kind === 'food' && x.strength > 0.01);
    const digesting = sim.meals.filter(m => m.remaining > 0.1);
    const progress = (label, value, caption, cls = '') => `<div class="dual-progress ${cls}"><div><span>${label}</span><b>${caption}</b></div><progress max="100" value="${Math.max(0, Math.min(100, value))}" aria-label="${label}"></progress></div>`;
    const duration = minutes => { const total = Math.ceil(minutes); return `${total >= 1440 ? Math.floor(total / 1440) + ' 天 ' : ''}${total >= 60 ? Math.floor(total / 60) % 24 + ' 时 ' : ''}${total % 60} 分`; };
    container.innerHTML = drugs.length || foods.length || digesting.length ? `<div class="active-list">${drugs.map(x => `<article class="drug-activity"><div class="drug-activity-heading"><span class="item-symbol">${icon('pill')}</span><b>${x.item.name}</b><small>${x.strength < 0.15 ? (x.pendingAbsorption ? '等待转运 / 起效' : '残留暴露 · 低于作用展示阈值') : x.exposure.toFixed(2) + ' rel.'}</small><button class="button remove-active-drug" data-remove-drug="${x.item.id}" aria-label="移除体内的${x.item.name}" ${x.frozen || sim.time >= MAX_TIME ? 'disabled' : ''}>移除药物</button></div>${progress(x.item.clearance === 'local' ? '肠道局部活性' : '药物体内活性', x.strength / 3 * 100, Math.round(x.strength / 3 * 100) + '%')}
      ${progress(x.frozen ? '作用时间 · 已冻结' : '预计作用余时（模型阈值）', x.progress * 100, x.frozen ? '终止态不再推演' : (x.capped ? '超过 ' : '约 ') + duration(x.remaining), 'remaining-time')}</article>`).join('')}
      ${foods.map(x => `<div class="food-activity"><b>${x.item.name} · 成分活性</b>${progress('营养 / 成分池代理', x.strength / 3 * 100, x.exposure.toFixed(2) + ' rel.')}</div>`).join('')}
      ${digesting.map(m => `<div class="food-activity"><b>${ITEM_BY_ID[m.id].name} · ${sim.life.status === 'dead' ? '终止时剩余' : '消化中'}</b>${progress('已消化', (1 - m.remaining / m.amount) * 100, '剩余 ' + m.remaining.toFixed(1) + ' ' + ITEM_BY_ID[m.id].unit)}</div>`).join('')}</div>
      <p class="active-note">活性为相对刻度，rel. 不是血药浓度。余时以最大模型响应的 5% 为展示阈值，包含待吸收阶段；不是临床药效时长。低于阈值的残留仍参与计算，追加用药、清除或体液条件变化会重估。移除药物属于实验编辑：清除该药全部批次及未输入部分，保留已经发生的体征变化和器官损伤。</p>` : emptyState('activity', '体内暂时没有活性干预', '添加干预后，在这里观察吸收、作用和消退。');
    container.insertAdjacentHTML('beforeend', sim.interactions.map(i => `<div class="queue-warning"><b>${icon('warn')}${i.name}</b><p>${i.participants.join(' + ')} · ${i.explanation}</p></div>`).join(''));
    pagination.innerHTML = '<span>双进度 · 活性与剩余时间分别计算</span>'; return;
  }
  if (state.tab === 'events') {
    container.innerHTML = `<div class="event-list">${sim.events.slice().reverse().map(event => `<div class="event-row"><time>${clockText(event.time)}</time><i class="event-dot ${event.type}"></i><div><strong>${event.title}</strong><p>${event.detail}</p></div></div>`).join('')}</div>`;
    pagination.innerHTML = `<span>已记录 ${sim.events.length} 条事件 · 最多保留最近 300 条</span><button class="text-button" data-action="export-json">导出完整实验输入 ${icon('download')}</button>`; return;
  }
  const query = state.query.trim().toLowerCase();
  const matching = CATALOG.filter(item => item.kind === state.tab && (state.category === 'all' || item.category === state.category) && (!query || `${item.name} ${item.english} ${item.category} ${item.route} ${item.primaryAction ?? ''} ${item.mechanism}`.toLowerCase().includes(query)));
  if (state.tab === 'drug' && state.category === 'all' && !query) {
    const featured = ['metoprolol', 'furosemide', 'metformin', 'aspirin', 'diazepam', 'paracetamol'];
    const rank = item => featured.includes(item.id) ? featured.indexOf(item.id) : featured.length;
    matching.sort((a, b) => rank(a) - rank(b));
  }
  const pageSize = 6; const pages = Math.max(1, Math.ceil(matching.length / pageSize)); state.page = Math.min(state.page, pages);
  const visible = matching.slice((state.page - 1) * pageSize, state.page * pageSize);
  container.innerHTML = visible.length ? `<div class="catalog-grid">${visible.map(item => {
    const selected = state.queue.some(e => e.id === item.id);
    const special = item.kind === 'food' ? '--item-bg:#fbf4e9;--item-color:#bca579' : item.category === '凝血与血小板' ? '--item-bg:#f8efec;--item-color:#ba9383' : item.category === '镇静与睡眠' ? '--item-bg:#f3eef7;--item-color:#ab97ba' : '';
    return `<article class="item-card ${selected ? 'selected' : ''}"><div class="item-card-top"><span class="item-symbol" style="${special}">${icon(item.kind === 'drug' ? 'pill' : 'food')}</span><span class="category-tag">${item.category}</span></div><button class="item-name" data-detail="${item.id}">${item.name}${icon('chevron')}</button><span class="item-english">${item.english}</span>${routeBadge(item)}${riskBadges(item)}<p class="item-description">${item.mechanism}</p><div class="item-bottom"><span>${item.reference} ${item.unit} · ${item.kind === 'food' ? '典型份量' : '模型标定'}</span><button class="item-add" data-add="${item.id}" aria-label="${selected ? '移除' : '加入'}${item.name}" title="${selected ? '从清单移除' : '加入干预清单'}" aria-pressed="${selected}">${icon(selected ? 'check' : 'plus')}</button></div></article>`;
  }).join('')}</div>` : emptyState('search', '没有找到匹配内容', '试试通用名称、英文名称或更宽泛的分类。');
  pagination.innerHTML = `<span>显示 ${matching.length ? (state.page - 1) * pageSize + 1 : 0}–${Math.min(matching.length, state.page * pageSize)} / ${matching.length} 项</span><div class="pager"><button data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="上一页">‹</button>${Array.from({ length: pages }, (_, i) => `<button data-page="${i + 1}" class="${state.page === i + 1 ? 'active' : ''}" aria-label="第 ${i + 1} 页" ${state.page === i + 1 ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}<button data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="下一页">›</button></div>`;
}
function emptyState(symbol, heading, detail) { return `<div class="empty-state">${icon(symbol)}<b>${heading}</b><p>${detail}</p></div>`; }

function toggleQueue(id) {
  const existing = state.queue.findIndex(e => e.id === id);
  if (existing >= 0) state.queue.splice(existing, 1);
  else {
    if (state.queue.length >= 24) { toast('每批最多加入 24 项干预。'); return; }
    state.queue.push(defaultEntry(ITEM_BY_ID[id]));
  }
  renderQueue(); renderLibrary();
}

function renderQueue() {
  $('#queue-count').textContent = state.queue.length;
  $('#queue-items').classList.toggle('has-solution', state.queue.some(entry => ITEM_BY_ID[entry.id].solution));
  $('#clear-queue').disabled = !state.queue.length;
  $('#queue-items').innerHTML = state.queue.length ? state.queue.map(entry => {
    const item = ITEM_BY_ID[entry.id];
    return `<div class="queue-row dose-row"><span class="item-symbol">${icon(item.kind === 'drug' ? 'pill' : 'food')}</span><div class="queue-row-info"><strong>${item.name}</strong>${routeBadge(item)}</div><output class="dose-value" id="dose-value-${item.id}">${entry.amount} ${item.unit}</output><button class="remove-item" data-remove="${item.id}" aria-label="移除${item.name}">${icon('close')}</button>${item.solution ? solutionControls(item, entry) : `<div class="dose-slider"><input type="range" min="0" max="${item.reference * 10}" step="${item.reference / 100}" value="${entry.amount}" data-amount="${item.id}" aria-label="${item.name}用量" aria-valuetext="${entry.amount} ${item.unit}" aria-describedby="dose-guide-${item.id}"><span class="dose-reference-tick" aria-hidden="true"></span><div class="dose-scale"><span>0</span><span>上限 ${item.reference * 10} ${item.unit}（10×）</span></div><div class="dose-guide" id="dose-guide-${item.id}"><span>↑ 模型标定量：${item.reference} ${item.unit}（1×）</span><small>${item.kind === 'food' ? '典型份量，不是营养处方' : item.kind === 'pathogen' ? '虚构单位，不代表现实注射或感染剂量' : '模型标定值，不是临床操作或用药建议'}</small></div></div>`}</div>`;

  }).join('') : `<div class="queue-empty"><div class="queue-empty-icon">${icon('flask')}</div><b>准备好你的第一次干预</b><p>点击左侧的 +，加入所需干预项目</p></div>`;
  renderQueuePreview();
}
function renderQueuePreview() {
  let valid = state.queue.length > 0;
  let error = '';
  try { state.queue.forEach(validateEntry); } catch (e) { valid = false; error = e.message; }
  $('#administer').disabled = !valid || sim.time >= MAX_TIME || sim.life.status === 'dead';
  $('#administer-count').textContent = state.queue.length ? `(${state.queue.length})` : '';
  const interactions = state.queue.length ? sim.preview(state.queue) : [];
  $('#queue-interactions').innerHTML = error ? `<div class="queue-warning"><b>${icon('warn')}请检查用量</b><p>${error}</p></div>` : interactions.map(i => `<div class="queue-warning"><b>${icon('warn')}${i.name}</b><p>${i.explanation}</p></div>`).join('');
}

function showDetails(id) {
  const item = ITEM_BY_ID[id]; if (!item) return;
  const stats = item.kind === 'drug' ? [
    ['模型标定量', `${item.reference} ${item.unit}`], item.intravenous ? ['进入方式（模型）', item.infusionMinutes ? `${item.infusionMinutes} min 分时泵入` : '直接进入中央室'] : ['吸收半期（模型）', `${item.absorption} min`], [item.clearance === 'local' ? '局部消退半期（模型）' : '集总清除半期（模型）', `${item.halfLife / 60 < 1 ? item.halfLife + ' min' : (item.halfLife / 60).toFixed(1) + ' h'}`],
  ] : item.kind === 'food' ? [['典型份量', `${item.reference} ${item.unit}`], ['碳水 / 蛋白 / 脂肪', `${item.nutrients.carbs} / ${item.nutrients.protein} / ${item.nutrients.fat} g`], ['水分 / 钾', `${item.nutrients.water} mL / ${item.nutrients.potassium} mg`]] : [['模型标定', `${item.reference} ${item.unit}`], ['途径', item.route], ['说明', item.kind === 'pathogen' ? '仅合成感染情景' : '分时输注，可停止']];
  $('#detail-content').innerHTML = `<div class="item-symbol" style="width:42px;height:42px">${icon(item.kind === 'drug' ? 'pill' : 'food')}</div><h2>${item.name}</h2><div class="detail-subtitle">${item.english} / ${item.category} / ${item.route}</div>${routeBadge(item)}<p class="detail-mechanism">${item.mechanism}</p>${riskBadges(item)}${item.solution ? `<p class="solution-detail">支持浓度与体积控制 · 默认模型浓度 ${deliveryNumber(item.solution.concentration)} ${item.unit}/mL；实际药量 = 浓度 × 体积。${item.intravenous ? '模型载液统一按盐水样成分混合，会影响容量与浓度' : '口服液水分独立吸收；局部药物的肠道转运另计'}，不模拟真实制剂配伍。</p>` : ''}${item.kind === 'drug' ? `<p class="timing-evidence"><b>${item.timingEvidence ? '已核对的标签时间信息' : '时间参数说明'}</b><br>${item.timingEvidence?.text ?? '本条使用教学集总动力学，尚未逐制剂校准。清除半期、效应延迟和临床作用时长不是同一数值。'}${item.onsetDelay ? `<br>局部转运延迟：${item.onsetDelay / 60} h（模型参数）` : ''}${item.recovery ? '<br>另有慢效应恢复项，功能恢复可以晚于药物清除。' : ''}</p>` : ''}<div class="detail-stats">${stats.map(([label, value]) => `<div class="detail-stat"><span>${label}</span><b>${value}</b></div>`).join('')}</div><p class="detail-warning">${item.kind === 'drug' ? '标定量只用于归一化模型暴露，不是推荐剂量。所示时间常数与响应未经临床校准，不能推断安全性或真实起效时间。' : item.kind === 'food' ? '营养值为典型近似，不是安全摄入建议。' : '仅为虚构教学输入，不包含病原体真实剂量、输血匹配或临床操作步骤。'}</p><div class="dialog-actions">${item.source ? `<a href="${item.source}" target="_blank" rel="noopener">查看 DailyMed 标签资料 ↗</a>` : '<span></span>'}<button class="button button-primary" data-detail-add="${item.id}">${icon('plus')}${state.queue.some(x => x.id === id) ? '已在干预清单中' : '加入干预清单'}</button></div>`;
  $('#detail-dialog').showModal();
}

function showSymptom(id) {
  const symptom = sim.symptoms.find(s => s.id === id); if (!symptom) return;
  const m = METRIC_BY_ID[symptom.key];
  const observed = sim.life.terminalValues ?? sim.values;
  $('#detail-content').innerHTML = `<div class="eyebrow">SYSTEM RESPONSE</div><h2>${symptom.name}</h2><p class="detail-mechanism">${symptom.explanation}</p><div class="detail-stats"><div class="detail-stat"><span>${m.name}${sim.life.status === 'dead' ? ' · 终末前' : ''}</span><b>${formatMetric(m.id, observed[m.id])} ${m.unit}</b></div><div class="detail-stat"><span>展示参考区间</span><b>${m.range.join('–')}</b></div><div class="detail-stat"><span>模拟时间</span><b>${clockText(sim.time)}</b></div></div><p class="detail-warning">这是当前数值触发的教学症状，不是临床诊断。单个指标不能代表完整的真实病情。</p><div class="dialog-actions"><button class="button button-primary" data-symptom-trend="${m.id}">查看参数趋势 ${icon('chart')}</button></div>`;
  $('#detail-dialog').showModal();
}

function renderParameters() {
  $('#parameter-count').textContent = METRICS.length;
  const groups = [...new Set(METRICS.map(m => m.group))];
  $('#parameter-groups').innerHTML = groups.map(group => `<article class="panel parameter-group"><h3>${group}</h3><table class="parameter-table"><thead><tr><th scope="col">监测参数</th><th scope="col">当前值</th><th scope="col">参考区间</th><th scope="col">状态</th></tr></thead><tbody>${METRICS.filter(m => m.group === group).map(m => `<tr data-trend="${m.id}" tabindex="0" aria-label="查看${m.name}趋势"><td>${m.name}</td><td id="parameter-${m.id}"></td><td>${m.range.join('–')}</td><td><span class="metric-status" id="parameter-status-${m.id}"></span></td></tr>`).join('')}</tbody></table></article>`).join('');
  updateParameterValues();
}
function updateParameterValues() {
  for (const m of METRICS) {
    $(`#parameter-${m.id}`).innerHTML = `${formatMetric(m.id, sim.values[m.id])}<small>${m.unit}</small>`;
    const status = statusOf(m, sim.values[m.id]);
    const badge = $(`#parameter-status-${m.id}`); badge.className = `metric-status ${status}`;
    badge.textContent = status === 'normal' ? '区间内' : status === 'high' ? '↑ 偏高' : '↓ 偏低';
  }
}
function renderTrend() {
  const m = METRIC_BY_ID[state.trend];
  $('#trend-metric').value = state.trend;
  $('#trend-description').textContent = `${m.description} 绿色区域为展示参考区间。横轴为模拟分钟；初始点需要推进时间后才会形成曲线。`;
  drawTrend($('#trend-chart'), [...sim.history, { time: sim.time, ...sim.values }], state.trend, m.range);
}
function showTrend(id, scroll = true) {
  state.trend = id; setView('parameters'); renderTrend();
  if (scroll) $('.trend-panel').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
}

let confirmAction = null;
function confirmChange(title, description, label, action) {
  $('#confirm-title').textContent = title; $('#confirm-description').textContent = description;
  $('#confirm-accept').textContent = label; confirmAction = action; $('#confirm-dialog').showModal();
}
function reset(profile = sim.profile.id) {
  monitorAudio.stop();
  state.running = false; state.queue = []; state.visualTime = 0; sim = new Simulator(profile);
  selectOrgan(null);
  resetAnatomy($('#anatomy'));
  $('#profile').value = profile; $('#profile').title = sim.profile.description;
  renderQueue(); renderLibrary(); render(); save(); toast('已创建新的实验基线。');
}
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportJSON() { download(`vitalis-${sim.profile.id}-${Math.floor(sim.time)}min.json`, JSON.stringify(sim.exportReport(), null, 2), 'application/json'); toast('实验报告已导出，JSON 可再次导入重放。'); }
function exportCSV() {
  const columns = ['模拟时间(min)', ...METRICS.map(m => `${m.name} (${m.unit})`)];
  const samples = [...sim.history]; if (samples.at(-1)?.time !== sim.time) samples.push({ time: sim.time, ...sim.values });
  const rows = [columns.map(c => `"${c}"`).join(','), ...samples.map(p => [p.time, ...METRICS.map(m => p[m.id].toFixed(5))].join(','))];
  download(`vitalis-metrics-${Math.floor(sim.time)}min.csv`, '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8'); toast('参数时序已导出。参考区间与模型说明见 JSON 报告。');
}

function setSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return;
  state.speed = Math.max(1, Math.min(300, Math.round(speed)));
  $('#speed').value = String(state.speed);
  $('#speed-value').textContent = state.speed + '×';
  $('#speed').setAttribute('aria-valuetext', state.speed + ' 倍');
}

function forward(minutes) {
  try { const before = sim.time; sim.advance(minutes, { stopOnCrisis: true }); if (sim.attentionRequired) { state.running = false; setSpeed(1); } if (sim.time >= MAX_TIME || sim.life.status === 'dead') state.running = false; render(); save(); toast(`已推进 ${(sim.time - before).toFixed(1)} 分钟${sim.life.status === 'dead' ? '，模型死亡，实验已终止' : sim.attentionRequired ? '，出现骤停或呼吸暂停，已暂停以保留施救窗口' : '模拟时间'}。`); }
  catch (e) { state.running = false; toast(e.message); }
}

function bindEvents() {
  $('#infection-burden').addEventListener('input', e => { $('#infection-burden-value').textContent = e.target.value + ' 虚构单位'; });
  $('#infection-scenario').addEventListener('change', e => { $('#infection-description').textContent = ITEM_BY_ID[e.target.value].mechanism; });
  $('#apply-infection').addEventListener('click', () => {
    try {
      sim.administerBatch([{ id: $('#infection-scenario').value, amount: Number($('#infection-burden').value) }]);
      render(); save(); toast('已添加合成感染情景；可在药物库独立选择药物。');
    } catch (error) { toast(error.message); }
  });
  const updateSound = () => {
    $('#sound-toggle').textContent = monitorAudio.enabled ? '静音' : '开启声音';
    $('#sound-toggle').setAttribute('aria-pressed', String(monitorAudio.enabled));
    $('#sound-status').textContent = monitorAudio.enabled ? '已开启 · 心率同步 / 告警限频 / 暂停即停' : '声音已关闭 · 开启后与模型状态联动';
  };
  $('#sound-toggle').addEventListener('click', async () => {
    try { if (monitorAudio.enabled) monitorAudio.mute(); else { await monitorAudio.enable(); monitorAudio.preview('beat'); } updateSound(); }
    catch { toast('此浏览器暂时无法启用音频，模拟仍可正常运行。'); }
  });
  $('#compression-button').addEventListener('click', () => rescue('compress'));
  $('#compression-button').addEventListener('keydown', e => { if (e.repeat) e.preventDefault(); });
  $('#sound-volume').addEventListener('input', e => { monitorAudio.setVolume(Number(e.target.value) / 100); $('#sound-volume-value').textContent = e.target.value + '%'; });
  $$('[data-sound]').forEach(button => button.addEventListener('click', async () => {
    try { if (!monitorAudio.enabled) await monitorAudio.enable(); updateSound(); monitorAudio.stop(); monitorAudio.preview(button.dataset.sound); }
    catch { toast('音效暂时无法播放。'); }
  }));
  $('#anatomy-angle').addEventListener('input', event => {
    setAnatomyAngle($('#anatomy'), event.target.value);
    $('#angle-value').textContent = `${Number(event.target.value) > 0 ? '+' : ''}${event.target.value}°`;
  });

  $('.brand').addEventListener('click', event => { event.preventDefault(); setView('lab'); window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' }); });
  document.addEventListener('click', event => {
    const el = event.target.closest('button, [data-organ], summary'); if (!el) return;
    if (el.id !== 'sound-toggle' && !el.dataset.sound && el.id !== 'administer' && !el.disabled) monitorAudio.feedback();
    if (el.dataset.removeDrug) {
      try {
        sim.removeDrug(el.dataset.removeDrug); render(); save();
        toast('已移除该药全部批次；现有体征与器官损伤不会立即复原。');
      } catch (error) { toast(error.message); }
      return;
    }
    if (el.dataset.rescue) { rescue(el.dataset.rescue); return; }
    if (el.dataset.careTab) { setView('lab'); setTab(el.dataset.careTab); $('#intervention-section').scrollIntoView({ block: 'start' }); return; }
    if (el.dataset.view) { setView(el.dataset.view); return; }
    if (el.dataset.tab) { setTab(el.dataset.tab); return; }
    if (el.dataset.anatomyView) { setAnatomyAngle($('#anatomy'), el.dataset.anatomyView === 'back' ? 180 : 0); return; }
    if (el.dataset.organ) { selectOrgan(el.dataset.organ); return; }
    if (el.dataset.metric) { showTrend(el.dataset.metric); return; }
    if (el.dataset.add) { toggleQueue(el.dataset.add); return; }
    if (el.dataset.remove) { toggleQueue(el.dataset.remove); return; }
    if (el.dataset.detail) { showDetails(el.dataset.detail); return; }
    if (el.dataset.detailAdd) {
      if (!state.queue.some(e => e.id === el.dataset.detailAdd)) toggleQueue(el.dataset.detailAdd);
      $('#detail-dialog').close(); toast('已加入干预清单，可在清单中修改用量。'); return;
    }
    if (el.dataset.symptom) { showSymptom(el.dataset.symptom); return; }
    if (el.dataset.symptomTrend) { $('#detail-dialog').close(); showTrend(el.dataset.symptomTrend); return; }
    if (el.dataset.page) { state.page = Number(el.dataset.page); renderLibrary(); return; }
    if (el.dataset.close) { $(`#${el.dataset.close}`).close(); return; }
    if (el.dataset.forward) { forward(Number(el.dataset.forward)); return; }
    switch (el.dataset.action) {
      case 'about': $('#about-dialog').showModal(); break;
      case 'library': setView('lab'); setTab('drug'); $('#intervention-section').scrollIntoView({ behavior: 'smooth' }); break;
      case 'events': setView('lab'); setTab('events'); $('#intervention-section').scrollIntoView({ behavior: 'smooth' }); break;
      case 'zoom-in': setAnatomyZoom($('#anatomy'), state.zoom + 0.15); break;
      case 'zoom-out': setAnatomyZoom($('#anatomy'), state.zoom - 0.15); break;
      case 'zoom-reset': resetAnatomy($('#anatomy')); selectOrgan(null); break;
      case 'vessels': state.vessels = !state.vessels; setAnatomyVessels($('#anatomy'), state.vessels); el.classList.toggle('active', state.vessels); el.setAttribute('aria-pressed', String(state.vessels)); break;
      case 'export-json': exportJSON(); $('.export-menu').open = false; break;
      case 'export-csv': exportCSV(); $('.export-menu').open = false; break;
      case 'import': $('#import-file').click(); $('.export-menu').open = false; break;
    }
  });
  // 器官列表与参数行支持键盘；保持真实语义的原生按钮不重复处理。
  document.addEventListener('keydown', event => {
    const organ = event.target.closest('.organ');
    const trend = event.target.closest('tr[data-trend]');
    if (['Enter', ' '].includes(event.key) && (organ || trend)) { event.preventDefault(); if (organ) selectOrgan(organ.dataset.organ); if (trend) showTrend(trend.dataset.trend); }
  });
  $('#parameter-groups').addEventListener('click', event => { const row = event.target.closest('[data-trend]'); if (row) showTrend(row.dataset.trend); });
  $('#search').addEventListener('input', event => { state.query = event.target.value; state.page = 1; renderLibrary(); });
  $('#category').addEventListener('change', event => { state.category = event.target.value; state.page = 1; renderLibrary(); });
  $('#queue-items').addEventListener('input', event => {
    const field = event.target.dataset.solution;
    if (field) {
      const entry = state.queue.find(e => e.id === event.target.dataset.item);
      if (!entry || !['concentration', 'volume'].includes(field)) return;
      const item = ITEM_BY_ID[entry.id];
      entry[field] = event.target.valueAsNumber; entry.amount = solutionAmount(entry.concentration, entry.volume);
      $$(`[data-solution="${field}"][data-item="${item.id}"]`).forEach(input => { if (input !== event.target) input.value = Number.isFinite(entry[field]) ? entry[field] : ''; });
      $('#dose-value-' + item.id).textContent = deliveryNumber(entry.amount) + ' ' + item.unit;
      $('#solution-formula-' + item.id).textContent = solutionFormula(item, entry);
      $('#solution-guide-' + item.id).textContent = solutionGuide(item, entry);
      $('#solution-tick-' + item.id).style.left = Math.max(0, Math.min(100, item.reference / entry.concentration / item.solution.maxVolume * 100)) + '%';
      renderQueuePreview(); return;
    }
    if (!event.target.dataset.amount) return; const entry = state.queue.find(e => e.id === event.target.dataset.amount); if (entry) { entry.amount = event.target.valueAsNumber; const item = ITEM_BY_ID[entry.id]; $('#dose-value-' + entry.id).textContent = entry.amount + ' ' + item.unit; event.target.setAttribute('aria-valuetext', entry.amount + ' ' + item.unit); } renderQueuePreview(); });
  $('#clear-queue').addEventListener('click', () => { state.queue = []; renderQueue(); renderLibrary(); });
  $('#administer').addEventListener('click', () => {
    try {
      const count = state.queue.length; sim.administerBatch(state.queue); monitorAudio.feedback('confirm'); state.queue = [];
      state.running = true; renderQueue(); renderLibrary(); render(); save(); toast(`已应用 ${count} 项干预，按所示途径进入模型。可观察后续变化。`);
    } catch (e) { toast(e.message); }
  });
  $('#play-button').addEventListener('click', () => { if (sim.life.status === 'dead') return; state.running = !state.running; if (!state.running) monitorAudio.stop(); render(); if (!state.running) save(); });
  $('#speed').addEventListener('input', e => setSpeed(e.target.value));
  $('#speed').addEventListener('change', e => { setSpeed(e.target.value); toast(`${state.speed}× 时间：现实 1 秒对应模拟 ${state.speed} 秒。器官动作按当前体征播放。`); });
  $('#reset-button').addEventListener('click', () => confirmChange('重新开始本次实验？', '当前体征、时间与干预记录将被清空。需要保留时，请先取消并导出实验。', '重置实验', () => reset()));
  $('#profile').addEventListener('change', event => {
    const profile = event.target.value; const name = PROFILES.find(p => p.id === profile).name;
    event.target.value = sim.profile.id;
    if (!sim.inputs.length && !sim.time) reset(profile);
    else confirmChange(`切换至${name}？`, '切换基线将新建实验并清空当前记录。需要保留时，请先导出。', '切换基线', () => reset(profile));
  });
  $('#confirm-cancel').addEventListener('click', () => { confirmAction = null; $('#confirm-dialog').close(); });
  $('#confirm-accept').addEventListener('click', () => { const action = confirmAction; confirmAction = null; $('#confirm-dialog').close(); action?.(); });
  $('#confirm-dialog').addEventListener('cancel', () => { confirmAction = null; });
  $('#trend-metric').addEventListener('change', event => { state.trend = event.target.value; renderTrend(); });
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('存档超过 5 MB，请使用本应用导出的实验 JSON。');
      const restored = Simulator.restore(JSON.parse(await file.text()));
      confirmChange('载入导入的实验？', `已验证：${restored.profile.name}，模拟时间 ${clockText(restored.time)}，${restored.inputs.length} 批干预。载入后替换当前实验并暂停。`, '载入实验', () => {
        sim = restored; state.running = false; state.queue = []; state.visualTime = 0;
        $('#profile').value = sim.profile.id; $('#profile').title = sim.profile.description;
        renderQueue(); renderLibrary(); render(); save(); toast('实验已导入并完成确定性重放。');
      });
    } catch (e) { toast(`导入失败：${e.message}`); }
  });
  document.addEventListener('visibilitychange', () => { previousFrame = performance.now(); if (document.hidden) { monitorAudio.stop(); save(); } });
  window.addEventListener('pagehide', () => { monitorAudio.stop(); save(); });
  window.addEventListener('resize', () => { drawSparks(); if (state.view === 'parameters') renderTrend(); });
  // 点击弹层背景关闭信息窗；确认窗只使用明确按钮或 Escape。
  for (const id of ['detail-dialog', 'about-dialog']) $(`#${id}`).addEventListener('click', event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); } });
}

let previousFrame = performance.now(); let lastRender = 0; let lastSave = 0; let lastWave = 0;
function frame(now) {
  const elapsed = Math.min((now - previousFrame) / 1000, 0.25); previousFrame = now;
  if (state.running && !document.hidden) {
    try { sim.advance(elapsed * state.speed / 60, { stopOnCrisis: true }); if (sim.attentionRequired) { state.running = false; setSpeed(1); save(); toast('出现骤停或呼吸暂停，已自动暂停；可使用急救面板。'); } state.visualTime += elapsed; if (sim.time >= MAX_TIME || sim.life.status === 'dead') { state.running = false; save(); } }
    catch (e) { state.running = false; toast(`模拟已暂停：${e.message}`); }
  }
  monitorAudio.tick(sim, state.running, document.hidden);
  if (now - lastRender > 400) { render(); lastRender = now; }
  if (!document.hidden && state.view === 'lab' && now - lastWave > (reducedMotion.matches ? 500 : 32)) {
    for (const type of ['ecg', 'resp', 'eeg']) drawWave($(`#wave-${type}`), type, sim.values, reducedMotion.matches ? 5 : state.visualTime);
    animateAnatomy($('#anatomy'), sim.values, state.visualTime, !state.running, reducedMotion.matches);
    lastWave = now;
  }
  if (state.running && now - lastSave > 5000) { save(); lastSave = now; }
  requestAnimationFrame(frame);
}

initialize(); requestAnimationFrame(frame);
