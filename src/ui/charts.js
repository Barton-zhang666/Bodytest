function contextFor(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr); const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, width: rect.width, height: rect.height };
}

const gauss = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
function signal(type, t, values) {
  if ((type === 'ecg' && values.hr === 0) || (type === 'resp' && (values.ventilationRate ?? values.rr) === 0) || (type === 'eeg' && values.eeg === 0)) return 0;
  if (type === 'ecg') {
    const p = ((t * values.hr / 60) % 1 + 1) % 1;
    return 0.09 * gauss(p, 0.18, 0.04) - 0.14 * gauss(p, 0.36, 0.016) + 0.95 * gauss(p, 0.40, 0.014) - 0.27 * gauss(p, 0.44, 0.016) + 0.18 * gauss(p, 0.66, 0.075);
  }
  if (type === 'resp') return Math.sin(t * (values.ventilationRate ?? values.rr) / 60 * Math.PI * 2) * 0.6;
  return (Math.sin(t * values.eeg * Math.PI * 2) * 0.35 + Math.sin(t * values.eeg * 1.37 * Math.PI * 2) * 0.16 + Math.sin(t * 0.8) * 0.08) * (1 + values.sedation / 150);
}

export function drawWave(canvas, type, values, seconds) {
  const c = contextFor(canvas); if (!c) return;
  const { ctx, width, height } = c;
  ctx.strokeStyle = '#e8f0ee'; ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const colors = { ecg: '#279d89', resp: '#5b94ad', eeg: '#a28cb5' };
  const windowSeconds = type === 'eeg' ? 2.3 : 5;
  ctx.strokeStyle = colors[type]; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
  for (let x = 0; x <= width; x++) {
    const t = seconds - windowSeconds + x / width * windowSeconds;
    const y = height * 0.55 - signal(type, t, values) * height * 0.72;
    if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawSpark(canvas, points, key, color = '#279d89') {
  const c = contextFor(canvas); if (!c) return;
  const { ctx, width, height } = c;
  const values = points.map(p => p[key]);
  if (!values.length) return;
  const min = Math.min(...values); const max = Math.max(...values);
  const spread = Math.max(max - min, Math.abs(max) * 0.12, 0.2);
  const low = min - spread * 0.4; const high = max + spread * 0.4;
  const coords = values.map((v, i) => [values.length < 2 ? 0 : i / (values.length - 1) * width, height - 4 - (v - low) / (high - low) * (height - 8)]);
  if (coords.length === 1) coords.push([width, coords[0][1]]);
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, color + '26'); gradient.addColorStop(1, color + '00');
  ctx.beginPath(); ctx.moveTo(0, height); coords.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(width, height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); coords.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
}

export function drawTrend(canvas, history, key, reference) {
  const c = contextFor(canvas); if (!c) return;
  const { ctx, width, height } = c;
  const pts = history.length ? history : [{ time: 0, [key]: 0 }];
  const min = Math.min(...pts.map(p => p[key]), reference[0]);
  const max = Math.max(...pts.map(p => p[key]), reference[1]);
  const spread = Math.max(max - min, 1); const lo = min - spread * 0.2; const hi = max + spread * 0.2;
  const left = 48; const bottom = height - 28; const top = 16; const right = width - 16;
  const y = v => bottom - (v - lo) / (hi - lo) * (bottom - top);
  const start = pts[0].time; const end = Math.max(start + 1, pts.at(-1).time);
  ctx.fillStyle = '#eaf5f0'; ctx.fillRect(left, y(reference[1]), right - left, Math.max(1, y(reference[0]) - y(reference[1])));
  ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    const val = lo + (hi - lo) * i / 4;
    ctx.fillStyle = '#81918e'; ctx.fillText(val.toFixed(spread < 10 ? 1 : 0), left - 9, y(val) + 3);
    ctx.strokeStyle = '#e5ece9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y(val)); ctx.lineTo(right, y(val)); ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) ctx.fillText(`${Math.round(start + (end - start) * i / 4)} min`, left + (right - left) * i / 4, height - 7);
  ctx.strokeStyle = '#239b86'; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => { const px = left + (p.time - start) / (end - start) * (right - left); if (!i) ctx.moveTo(px, y(p[key])); else ctx.lineTo(px, y(p[key])); }); ctx.stroke();
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(left, y(pts[0][key]), 3, 0, Math.PI * 2); ctx.fillStyle = '#239b86'; ctx.fill(); }
}
