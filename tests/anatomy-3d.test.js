import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/vendor/three/three.module.js';
import { buildAnatomy, meshStatistics, sectionGeometry, ORGAN_CENTERS, disposeAnatomy } from '../src/ui/anatomy-mesh.js';
import { AnatomyView, normalizedAngle, motionScales } from '../src/ui/anatomy-renderer.js';
import { ORGANS } from '../src/ui/anatomy.js';
import { anatomyState } from '../src/ui/anatomy-state.js';
import { BASE } from '../src/data/metrics.js';

const model = buildAnatomy();

test('全部器官具有真实三维厚度，解剖前后左右位置及网格预算可验证', () => {
  assert.deepEqual([...model.organs.keys()].sort(), ORGANS.map(o => o.id).sort());
  model.root.updateMatrixWorld(true);
  for (const { group } of model.organs.values()) {
    const extent = new T.Box3().setFromObject(group).getSize(new T.Vector3());
    assert.ok(extent.x > .02 && extent.y > .02 && extent.z > .015);
  }
  assert.ok(ORGAN_CENTERS.liver[0] < 0 && ORGAN_CENTERS.stomach[0] > 0);
  assert.ok(ORGAN_CENTERS.kidneys[2] < ORGAN_CENTERS.stomach[2]);
  assert.ok(ORGAN_CENTERS.brain[1] > ORGAN_CENTERS.lungs[1] && ORGAN_CENTERS.lungs[1] > ORGAN_CENTERS.intestines[1]);
  const stats = meshStatistics(model.root);
  assert.ok(stats.triangles < 240000 && stats.meshes < 160);
});

test('连续人体外壳无孤立部件或开放边，减面后仍保留闭合拓扑', () => {
  const shell = model.body.getObjectByName('continuous-body').geometry;
  const count = shell.attributes.position.count, indices = shell.index.array;
  const parents = Array.from({ length: count }, (_, i) => i), edges = new Map();
  const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3);
    assert.notEqual(a, b); assert.notEqual(a, c); assert.notEqual(b, c);
    parents[find(a)] = find(b); parents[find(c)] = find(b);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = Math.min(u, v) * count + Math.max(u, v);
      const value = edges.get(key) ?? [0, 0];
      value[0]++; value[1] += u < v ? 1 : -1; edges.set(key, value);
    }
  }
  assert.equal(new Set(parents.map((_, i) => find(i))).size, 1);
  for (const [count, winding] of edges.values()) { assert.equal(count, 2); assert.equal(winding, 0); }
});

test('所有顶点、法线和索引有效，连续躯干表面法线朝外', () => {
  const seen = new Set();
  model.root.traverse(mesh => {
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const { position, normal } = mesh.geometry.attributes;
    assert.ok(position.array.every(Number.isFinite)); assert.ok(normal.array.every(Number.isFinite));
    assert.equal(mesh.geometry.attributes.color.count, position.count);
    assert.ok(mesh.geometry.index.array.every(i => i >= 0 && i < position.count));
  });
  const shape = sectionGeometry([[0, 0, 0, .2, .1], [0, .5, 0, .2, .1], [0, 1, 0, .2, .1]]);
  assert.ok(shape.attributes.normal.getX(33) > .9);
  shape.dispose();
});

test('男性 A 形站姿具有宽肩收腰、外展手臂和分开的踝部', () => {
  const positions = model.body.getObjectByName('continuous-body').geometry.attributes.position;
  const halfWidths = { shoulder: 0, waist: 0, wrist: 0 }, ankles = [];
  for (let i = 0; i < positions.count; i++) {
    const x = Math.abs(positions.getX(i)), y = positions.getY(i);
    if (Math.abs(y - 1.46) < .01) halfWidths.shoulder = Math.max(halfWidths.shoulder, x);
    if (Math.abs(y - 1.105) < .01 && x < .22) halfWidths.waist = Math.max(halfWidths.waist, x);
    if (Math.abs(y - .955) < .008) halfWidths.wrist = Math.max(halfWidths.wrist, x);
    if (Math.abs(y - .13) < .006 && positions.getX(i) > 0) ankles.push(x);
  }
  assert.ok(halfWidths.shoulder > halfWidths.waist * 1.65);
  assert.ok(halfWidths.wrist > .43);
  assert.ok(ankles.length && Math.min(...ankles) > .10);
});

test('脑体为完整曲面，中线上下均有表面，沟回具有变化而非两个分离椭球', () => {
  const cerebrum = model.organs.get('brain').group.getObjectByName('continuous-cerebrum');
  assert.ok(cerebrum?.isMesh);
  cerebrum.updateWorldMatrix(true, true);
  const origin = cerebrum.getWorldPosition(new T.Vector3());
  for (const y of [-.015, .015, .035, .048]) {
    const ray = new T.Raycaster(origin.clone().add(new T.Vector3(0, y, .5)), new T.Vector3(0, 0, -1));
    assert.ok(ray.intersectObject(cerebrum).length > 0, `中线高度 ${y} 不应出现分离空隙`);
  }
  const colors = cerebrum.geometry.attributes.color.array;
  assert.ok(Math.min(...colors) < .85 && Math.max(...colors) > .98);
});

test('射线能在三维前后视角拾取器官，不依赖 SVG 平面热点', () => {
  model.root.updateMatrixWorld(true);
  for (const id of ['brain', 'lungs', 'heart', 'kidneys', 'bladder']) {
    const objects = model.pickable.filter(m => m.userData.organ === id);
    const center = new T.Box3().setFromObject(model.organs.get(id).group).getCenter(new T.Vector3());
    // 成对器官的中心为空隙，使用实际网格的包围盒中心发射射线。
    const part = new T.Box3().setFromObject(objects[0]).getCenter(new T.Vector3());
    for (const side of [-1, 1]) {
      const ray = new T.Raycaster(new T.Vector3(part.x, part.y, side * 2), new T.Vector3(0, 0, -side));
      assert.ok(ray.intersectObjects(objects, false).length > 0, id);
    }
    assert.ok(Number.isFinite(center.z));
  }
});

test('选择实色仅影响目标器官，损伤着色复用原症状状态且保持透明规则', () => {
  const view = Object.create(AnatomyView.prototype); view.model = model; view.selected = 'heart';
  for (const organ of model.organs.values()) {
    organ.materials = new Set(); organ.group.traverse(m => { if (m.isMesh) organ.materials.add(m.material); });
    for (const m of organ.materials) m.userData.baseColor = m.color.getHexString();
  }
  const values = { ...BASE, liverDamage: 80 };
  view.visual = anatomyState(values, [], { status: 'alive' }); view.applyMaterials();
  for (const [id, organ] of model.organs) for (const m of organ.materials) {
    assert.equal(m.transparent, id !== 'heart'); assert.equal(m.opacity === 1, id === 'heart');
  }
  assert.notEqual(model.organs.get('liver').material.color.getHexString(), model.organs.get('liver').material.userData.baseColor);
  assert.equal(values.liverDamage, 80);
  view.selected = null; view.visual = anatomyState(BASE, [], { status: 'alive' }); view.applyMaterials();
  assert.ok([...model.organs.values()].every(o => o.material.transparent));
});

test('缩放在实际鼠标射线击中处锚定，连续放大缩小后投影不漂移', () => {
  const view = Object.create(AnatomyView.prototype);
  view.camera = new T.PerspectiveCamera(30, 500 / 600, .01, 15);
  view.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 }) };
  view.pointer = new T.Vector2(); view.raycaster = new T.Raycaster();
  view.zoomPlane = new T.Plane(new T.Vector3(0, 0, 1), 0);
  view.target = new T.Vector3(); view.zoom = 1; view.yaw = 0;
  view.requestRender = () => {}; view.zoomPointer = { x: 305, y: 247 };
  view.model = { root: new T.Mesh(new T.SphereGeometry(.5, 24, 16), new T.MeshBasicMaterial()) };
  view.model.root.position.set(.15, .12, .1); view.model.root.updateMatrixWorld();
  view.updateCamera(); view.cursorOnPlane();
  const anchor = view.raycaster.intersectObject(view.model.root)[0].point;
  const before = anchor.clone().project(view.camera);
  for (const zoom of [1.5, 2.4, .75, 1]) {
    view.setZoom(zoom);
    const after = anchor.clone().project(view.camera);
    assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
    assert.equal(view.target.z, 0);
  }
});

test('旋转只有纵轴一个自由度；心跳/呼吸停止时对应三维变换回到静止', () => {
  const view = Object.create(AnatomyView.prototype); view.pivot = new T.Group(); view.requestRender = () => {};
  view.setAngle(90, 40); assert.equal(view.pivot.rotation.x, 0); assert.equal(view.pivot.rotation.z, 0);
  assert.ok(Math.abs(view.pivot.rotation.y - Math.PI / 2) < 1e-12);
  assert.equal(normalizedAngle(450), 90); assert.equal(normalizedAngle(-450), -90); assert.equal(normalizedAngle(Infinity), 0);
  assert.deepEqual(motionScales(0, 0, Math.PI / 2, Math.PI / 2), { heart: 1, lungs: [1, 1, 1] });
  const active = motionScales(72, 16, Math.PI / 2, Math.PI / 2);
  assert.ok(active.heart > 1 && active.lungs.every(x => x > 1));
});

test('三维共享材质与几何可释放', () => {
  let count = 0;
  model.organs.get('heart').material.addEventListener('dispose', () => { count++; });
  disposeAnatomy(model); assert.equal(count, 1);
});
