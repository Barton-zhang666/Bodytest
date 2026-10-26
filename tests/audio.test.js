import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MonitorAudio } from '../src/ui/audio.js';

function setup() {
  const scheduled = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
  const context = {
    currentTime: 0, state: 'suspended', destination: {},
    async resume() { this.state = 'running'; },
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; },
    createOscillator() {
      return { frequency: param(), connect() {}, disconnect() {}, start(time) { scheduled.push({ time, frequency: this.frequency.value }); }, stop(time) { if (time === undefined) this.onended?.(); } };
    },
  };
  const sound = new MonitorAudio(() => context);
  sound.loading = Promise.resolve(); // 不请求素材，调度测试只使用合成回退。
  const sim = { life: { status: 'alive' }, values: { hr: 60, spo2: 98 }, symptoms: [] };
  return { sound, context, scheduled, sim };
}

test('音频默认关闭，显式启用后按心率节拍调度，暂停和静音取消声源', async () => {
  const { sound, context, scheduled, sim } = setup();
  sound.tick(sim, true); assert.equal(scheduled.length, 0);
  await sound.enable(); sound.tick(sim, true); assert.equal(scheduled.length, 1);
  context.currentTime = 0.5; sound.tick(sim, true); assert.equal(scheduled.length, 1);
  context.currentTime = 1; sound.tick(sim, true); assert.equal(scheduled.length, 2);
  sound.tick(sim, false); assert.equal(sound.nodes.size, 0);
  sound.mute(); context.currentTime = 2; sound.tick(sim, true); assert.equal(scheduled.length, 2);
});

test('告警限频、死亡短提示只触发一次，隐藏与新实验清理所有声源', async () => {
  const { sound, context, scheduled, sim } = setup();
  await sound.enable(); sim.life.status = 'critical'; sound.tick(sim, true);
  assert.equal(scheduled.length, 3);
  context.currentTime = 0.1; sound.tick(sim, true); assert.equal(scheduled.length, 3);
  context.currentTime = 5; sound.tick(sim, true); assert.equal(scheduled.length, 6);
  sim.life.status = 'dead'; sound.tick(sim, false); assert.equal(scheduled.length, 7);
  sound.tick(sim, false); assert.equal(scheduled.length, 7);
  sound.tick(sim, false, true); assert.equal(sound.nodes.size, 0);
  sound.tick({ ...sim, life: { status: 'alive' } }, false); assert.equal(sound.nodes.size, 0);
});

test('音量为零不创建声源，已死亡存档不会重新告警', async () => {
  const { sound, scheduled, sim } = setup();
  await sound.enable(); sound.setVolume(0); sound.tick(sim, true); sound.preview('alarm');
  assert.equal(scheduled.length, 0);
  sound.setVolume(0.25); sim.life.status = 'dead';
  sound.tick({ ...sim }, false); assert.equal(scheduled.length, 0);
});

test('发布的 CC0 音效为实际 OGG 文件且保留原始授权', () => {
  for (const name of ['click', 'confirm']) {
    const bytes = fs.readFileSync(new URL(`../src/assets/audio/${name}.ogg`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    assert.ok(bytes.length > 1000 && bytes.length < 20000);
  }
  assert.match(fs.readFileSync(new URL('../src/assets/audio/LICENSE-Kenney.txt', import.meta.url), 'utf8'), /CC0/);
});
