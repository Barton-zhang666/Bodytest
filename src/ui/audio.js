// 监护声音以现实时间调度，避免快进倍速造成密集鸣叫。所有声源都通过总音量节点。
export class MonitorAudio {
  constructor(contextFactory = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.contextFactory = contextFactory;
    this.enabled = false;
    this.volume = 0.25;
    this.nodes = new Set();
    this.buffers = new Map();
    this.nextBeat = 0; this.nextAlarm = 0;
    this.lastSim = null; this.wasDead = false; this.monitoring = false;
  }

  async enable() {
    if (!this.context) {
      this.context = this.contextFactory();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    this.enabled = true; this.setVolume(this.volume);
    this.nextBeat = 0; this.nextAlarm = 0;
    // 素材不可用时仍可使用程序合成的反馈，不阻塞开启操作。
    if (!this.loading) this.loading = Promise.all(['click', 'confirm'].map(async name => {
      try {
        const response = await fetch(new URL(`../assets/audio/${name}.ogg`, import.meta.url));
        if (!response.ok) return;
        this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch { /* 离线缺失或浏览器解码不支持：feedback 使用合成音。 */ }
    }));
  }

  mute() {
    this.enabled = false; this.stop();
    if (this.master) this.master.gain.setValueAtTime(0, this.context.currentTime);
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.015);
  }

  stop() {
    for (const node of this.nodes) { try { node.stop(); } catch { /* 已结束 */ } }
    this.nodes.clear(); this.nextBeat = 0; this.nextAlarm = 0;
  }

  track(node) {
    this.nodes.add(node);
    node.onended = () => { this.nodes.delete(node); node.disconnect(); };
  }

  tone(frequency, duration = 0.09, delay = 0, gain = 0.18) {
    if (!this.enabled || !this.volume || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.008);
    envelope.gain.setValueAtTime(gain, start + Math.max(0.009, duration - 0.025));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    this.track(oscillator);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
  }

  feedback(name = 'click') {
    if (!this.enabled || !this.volume || this.context.state !== 'running') return;
    const buffer = this.buffers.get(name);
    if (!buffer) { this.tone(name === 'confirm' ? 740 : 520, 0.055, 0, 0.1); return; }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = 0.22;
    source.connect(gain); gain.connect(this.master); this.track(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  preview(kind) {
    if (kind === 'beat') this.tone(860);
    else if (kind === 'alarm') { this.tone(660, 0.13); this.tone(880, 0.13, 0.2); }
    else if (kind === 'terminal') this.tone(440, 1.2, 0, 0.14);
    else this.feedback(kind);
  }

  tick(sim, running, hidden = false) {
    const dead = sim.life.status === 'dead';
    if (sim !== this.lastSim) { this.stop(); this.lastSim = sim; this.wasDead = dead; }
    if (!this.enabled || hidden) { this.stop(); this.wasDead = dead; return; }
    if (dead && !this.wasDead) { this.stop(); this.preview('terminal'); }
    this.wasDead = dead;
    if (!running || dead) {
      if (this.monitoring && !dead) this.stop();
      this.monitoring = false; return;
    }
    this.monitoring = true;
    const now = this.context.currentTime;
    if (now >= this.nextBeat && sim.values.hr > 0) {
      this.tone(sim.values.spo2 < 90 ? 680 : 860);
      this.nextBeat = now + 60 / Math.max(15, sim.values.hr);
    }
    const critical = ['critical', 'arrest', 'apnea', 'resuscitating'].includes(sim.life.status) || sim.symptoms.some(s => s.severity === 'high');
    if (critical && now >= this.nextAlarm) { this.preview('alarm'); this.nextAlarm = now + 5; }
  }
}
