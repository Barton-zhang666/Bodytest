import * as T from '../vendor/three/three.module.js';
import { buildAnatomy, disposeAnatomy, meshStatistics } from './anatomy-mesh.js';
import { mixColor } from './anatomy-state.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const normalizedAngle = degrees => {
  const value = Number(degrees);
  return Number.isFinite(value) ? ((value + 180) % 360 + 360) % 360 - 180 : 0;
};

// 缩放前后同一屏幕点在相机观察平面的偏移，用于保持鼠标焦点不漂移。
export function anchoredZoomTarget(before, after, target) {
  return new T.Vector3(target.x + before.x - after.x, target.y + before.y - after.y, 0);
}

export function motionScales(hr, rr, heartPhase, lungPhase) {
  return {
    heart: hr > 0 ? 1 + Math.max(0, Math.sin(heartPhase)) ** 5 * .065 : 1,
    lungs: rr > 0 ? [1 + Math.sin(lungPhase) * .022, 1 + Math.sin(lungPhase) * .028, 1 + Math.sin(lungPhase) * .023] : [1, 1, 1],
  };
}

export class AnatomyView {
  constructor(element, { onSelect, onView } = {}) {
    this.element = element; this.onSelect = onSelect; this.onView = onView;
    this.canvas = element.querySelector('canvas'); this.notice = element.querySelector('.anatomy-fallback');
    this.label = element.querySelector('.anatomy-3d-label');
    this.labelPoint = new T.Vector3(); this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
    this.yaw = 0; this.zoom = 1; this.selected = null;
    this.target = new T.Vector3(); this.zoomPlane = new T.Plane(new T.Vector3(0, 0, 1), 0);
    this.dirty = true; this.inViewport = false; this.visible = true; this.lost = false;
    this.heartPhase = 0; this.lungPhase = 0; this.lastTime = 0; this.frames = 0;
    this.events = new AbortController();
    try {
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      this.canvas.hidden = true; this.notice.hidden = false;
      this.notice.textContent = '当前设备无法启用 WebGL2 三维渲染。仍可用左侧器官列表查看实时参数；请检查浏览器硬件加速设置。';
      element.dataset.renderer = 'unavailable'; return;
    }
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(30, 1, .01, 15);
    this.scene.add(new T.HemisphereLight('#fffaf0', '#849a92', 1.25));
    for (const [color, intensity, position] of [['#fff0dd', 2.5, [-3, 4, 5]], ['#e1f3fa', .65, [3, 1, 3]], ['#e7fff4', 1.3, [1, 3, -4]]]) {
      const light = new T.DirectionalLight(color, intensity); light.position.set(...position); this.scene.add(light);
    }
    this.model = buildAnatomy(); this.model.root.position.y = -.92;
    this.pivot = new T.Group(); this.pivot.add(this.model.root); this.scene.add(this.pivot);
    for (const organ of this.model.organs.values()) {
      organ.materials = new Set();
      organ.group.traverse(mesh => { if (mesh.isMesh) organ.materials.add(mesh.material); });
      for (const mat of organ.materials) mat.userData.baseColor = mat.color.getHexString();
    }
    element.dataset.renderer = 'webgl2';
    const statistics = meshStatistics(this.model.root);
    element.dataset.triangles = statistics.triangles; element.dataset.meshes = statistics.meshes;
    const observe = () => { this.resize(); this.requestRender(); };
    this.resizeObserver = new ResizeObserver(observe); this.resizeObserver.observe(element);
    this.intersection = new IntersectionObserver(entries => {
      this.inViewport = entries[0].isIntersecting;
      if (this.inViewport) { this.resize(); this.requestRender(); }
    });
    this.intersection.observe(element);
    this.bindControls(); this.setAngle(-18); this.resize();
  }

  listen(target, name, fn, options = {}) { target.addEventListener(name, fn, { ...options, signal: this.events.signal }); }

  bindControls() {
    this.listen(this.canvas, 'pointerdown', e => {
      if (e.button !== 0 || this.gesture) return;
      this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(e.pointerId);
      this.zoomPointer = { x: e.clientX, y: e.clientY };
      this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    });
    this.listen(this.canvas, 'pointermove', e => {
      this.zoomPointer = { x: e.clientX, y: e.clientY };
      const g = this.gesture; if (!g || e.pointerId !== g.id) return;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5) g.moved = true;
      if (g.moved && e.clientX !== g.lastX) this.setAngle(this.yaw + (e.clientX - g.lastX) * .42);
      g.lastX = e.clientX; g.lastY = e.clientY;
    });
    this.listen(this.canvas, 'pointerup', e => {
      const g = this.gesture; if (!g || e.pointerId !== g.id) return;
      this.gesture = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (!g.moved) this.pick(e.clientX, e.clientY);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) this.listen(this.canvas, type, () => { this.gesture = null; });
    this.listen(this.canvas, 'wheel', e => {
      e.preventDefault(); this.zoomPointer = { x: e.clientX, y: e.clientY };
      this.setZoom(this.zoom * Math.exp(-e.deltaY * .001));
    }, { passive: false });
    this.listen(this.canvas, 'keydown', e => {
      const keys = { ArrowLeft: -12, ArrowRight: 12 };
      if (keys[e.key]) { e.preventDefault(); this.setAngle(this.yaw + keys[e.key]); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.setZoom(this.zoom + .1); }
      if (e.key === '-') { e.preventDefault(); this.setZoom(this.zoom - .1); }
      if (e.key === 'Home') { e.preventDefault(); this.reset(); }
      if (e.key === 'Escape') this.onSelect?.(null);
    });
    this.listen(this.canvas, 'webglcontextlost', e => {
      e.preventDefault(); this.lost = true; this.notice.hidden = false;
      this.notice.textContent = '三维画面暂时中断，正在等待图形上下文恢复；模拟参数仍可查看。';
    });
    this.listen(this.canvas, 'webglcontextrestored', () => { this.lost = false; this.notice.hidden = true; this.resize(); this.requestRender(); });
    this.listen(document, 'visibilitychange', () => { if (!document.hidden) this.requestRender(); });
    this.listen(window, 'pagehide', e => { if (!e.persisted) this.dispose(); });
  }

  resize() {
    if (!this.renderer || this.disposed) return;
    const { width, height } = this.element.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, width < 400 ? 1.25 : 1.5);
    if (this.width === width && this.height === height && this.ratio === ratio) return;
    this.width = width; this.height = height; this.ratio = ratio;
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.updateCamera(); this.dirty = true;
  }

  updateCamera() {
    if (!this.camera) return;
    this.camera.position.set(this.target.x, this.target.y, 3.65 * Math.max(1, .60 / this.camera.aspect) / this.zoom);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }

  setAngle(yaw) {
    this.yaw = normalizedAngle(yaw);
    if (this.pivot) this.pivot.rotation.set(0, this.yaw * Math.PI / 180, 0);
    // 半透明头部仍显示脑结构，但背面不透出面部的眼唇细节。
    if (this.model?.faceDetails) this.model.faceDetails.visible = Math.abs(this.yaw) <= 90;
    this.onView?.({ yaw: this.yaw, zoom: this.zoom }); this.requestRender();
  }

  cursorOnPlane() {
    if (!this.camera) return null;
    const rect = this.canvas.getBoundingClientRect(), p = this.zoomPointer;
    const inside = p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    this.pointer.set(inside ? (p.x - rect.left) / rect.width * 2 - 1 : 0, inside ? 1 - (p.y - rect.top) / rect.height * 2 : 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.zoomPlane, new T.Vector3());
  }

  setZoom(zoom) {
    const nextZoom = clamp(Number(zoom) || 1, .75, 2.4);
    if (nextZoom === this.zoom) return;
    this.zoomPlane.constant = 0;
    let before = this.cursorOnPlane();
    if (this.model) {
      this.model.root.updateWorldMatrix(true, true);
      const hit = this.raycaster.intersectObject(this.model.root, true).find(hit => {
        for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
        return true;
      });
      if (hit) { this.zoomPlane.constant = -hit.point.z; before = this.cursorOnPlane(); }
    }
    this.zoom = nextZoom; this.updateCamera();
    const after = this.cursorOnPlane();
    if (before && after) { this.target.copy(anchoredZoomTarget(before, after, this.target)); this.updateCamera(); }
    this.onView?.({ yaw: this.yaw, zoom: this.zoom }); this.requestRender();
  }

  reset() { this.target.set(0, 0, 0); this.zoom = 1; this.updateCamera(); this.setAngle(0); }

  pick(x, y) {
    if (!this.renderer || this.lost) return;
    const box = this.canvas.getBoundingClientRect();
    this.pointer.set((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2);
    this.scene.updateMatrixWorld(true); this.raycaster.setFromCamera(this.pointer, this.camera);
    this.onSelect?.(this.raycaster.intersectObjects(this.model.pickable, false)[0]?.object.userData.organ ?? null);
  }

  setSelection(id) {
    this.selected = this.model?.organs.has(id) ? id : null;
    this.applyMaterials(); this.requestRender();
  }

  applyMaterials() {
    if (!this.model) return;
    for (const [id, organ] of this.model.organs) {
      const injury = this.visual?.organs.find(o => o.id === id);
      for (const mat of organ.materials) {
        mat.color.set(injury && injury.stage !== 'healthy' ? mixColor(injury.color, '#' + mat.userData.baseColor, .12) : '#' + mat.userData.baseColor);
        const opaque = id === this.selected;
        if (mat.transparent === opaque) { mat.transparent = !opaque; mat.needsUpdate = true; }
        mat.opacity = opaque ? 1 : mat === organ.detail ? .64 : .56;
        mat.depthWrite = opaque;
        mat.emissive.set(opaque ? '#231a12' : '#000000'); mat.emissiveIntensity = .16;
      }
    }
  }

  setAppearance(visual, summary, paused, reducedMotion, visible) {
    this.visible = visible;
    this.canvas.setAttribute('aria-label', '可旋转的三维半透明人体。' + summary);
    const signature = JSON.stringify([visual.cyanosis, visual.jaundice, visual.shake, visual.dead, visual.organs.map(o => o.color + o.stage)]);
    this.visual = visual;
    if (this.model && signature !== this.signature) {
      this.signature = signature;
      for (const mat of this.model.skinMaterials) mat.color.set(mixColor('#d8c7b4', '#e6bc4c', visual.jaundice));
      this.model.lips.color.set(mixColor('#ba7977', '#56369b', visual.cyanosis));
      this.model.eyes.color.set(mixColor('#f1ede1', '#f4c33c', visual.jaundice));
      this.applyMaterials(); this.requestRender();
    }
    if (this.model && (paused || reducedMotion || visual.dead)) {
      if (this.model.root.position.x !== 0) { this.model.root.position.x = 0; this.requestRender(); }
      if (reducedMotion || visual.dead) {
        const heart = this.model.organs.get('heart').group, lungs = this.model.organs.get('lungs').group;
        if (heart.scale.x !== 1 || lungs.scale.x !== 1) { heart.scale.setScalar(1); lungs.scale.setScalar(1); this.requestRender(); }
      }
    }
  }

  animate(values, seconds, paused, reducedMotion) {
    const dt = clamp(seconds - this.lastTime, 0, .25); this.lastTime = seconds;
    if (!this.renderer || this.disposed || !this.visible || !this.inViewport || document.hidden || this.lost) return;
    if (!paused && !reducedMotion && !this.visual?.dead) {
      this.heartPhase = (this.heartPhase + dt * values.hr / 60 * Math.PI * 2) % (Math.PI * 2);
      const rr = values.ventilationRate ?? values.rr;
      this.lungPhase = (this.lungPhase + dt * rr / 60 * Math.PI * 2) % (Math.PI * 2);
      const scales = motionScales(values.hr, rr, this.heartPhase, this.lungPhase);
      this.model.organs.get('heart').group.scale.setScalar(scales.heart);
      this.model.organs.get('lungs').group.scale.set(...scales.lungs);
      this.model.root.position.x = this.visual?.shake ? Math.sin(seconds * Math.PI * 10) * .0045 : 0;
      this.dirty = true;
    }
    this.draw();
  }

  requestRender() {
    this.dirty = true;
    if (this.request || this.disposed || !this.renderer) return;
    this.request = requestAnimationFrame(() => { this.request = null; this.draw(); });
  }

  draw() {
    if (!this.dirty || this.disposed || this.lost || !this.inViewport || !this.visible || document.hidden || !this.width) return;
    this.renderer.render(this.scene, this.camera); this.dirty = false; this.frames++;
    this.element.dataset.renderCount = this.frames;
    this.element.dataset.drawCalls = this.renderer.info.render.calls;
    this.label.hidden = !this.selected;
    if (this.selected) {
      const organ = this.model.organs.get(this.selected);
      this.labelPoint.copy(organ.group.position); this.model.root.localToWorld(this.labelPoint); this.labelPoint.project(this.camera);
      this.label.style.left = clamp((this.labelPoint.x + 1) * this.width / 2, 55, this.width - 55) + 'px';
      this.label.style.top = clamp((1 - this.labelPoint.y) * this.height / 2 - 30, 26, this.height - 40) + 'px';
    }
  }

  dispose() {
    this.disposed = true; this.events.abort();
    this.resizeObserver?.disconnect(); this.intersection?.disconnect();
    if (this.request) cancelAnimationFrame(this.request);
    if (this.model) disposeAnatomy(this.model);
    this.renderer?.dispose();
  }
}
