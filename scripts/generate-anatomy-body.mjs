// 离线生成连续人体外壳。只在修改造型时运行；浏览器不执行体素采样。
import fs from 'node:fs/promises';
import { MeshoptSimplifier } from 'meshoptimizer';

const smoothMin = (a, b, k = .014) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * .25;
};
const bell = (v, center, width) => Math.exp(-(((v - center) / width) ** 2));
const cubic = (a, b, c, d, t) => b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));

// 每个截面：[高度、横向中心、前后中心、半宽、半厚]。
// 标准男性 A 形站姿：肩胸宽于骨盆，肩位提高、颈部缩短，双足自然分开。
const torso = [
  [.815, 0, -.013, .025, .027], [.86, 0, -.012, .108, .079], [.92, 0, -.011, .147, .096],
  [.98, 0, -.005, .15, .104], [1.045, 0, -.004, .139, .101], [1.105, 0, -.006, .135, .097],
  [1.17, 0, -.008, .148, .103], [1.24, 0, -.01, .173, .115], [1.32, 0, -.013, .196, .124],
  [1.39, 0, -.015, .207, .124], [1.45, 0, -.016, .212, .109], [1.49, 0, -.016, .203, .085],
  [1.516, 0, -.013, .157, .058], [1.54, 0, -.01, .102, .048], [1.562, 0, -.008, .057, .046],
  [1.603, 0, -.003, .05, .042], [1.617, 0, 0, .04, .037],
];
const head = [
  [1.596, 0, .023, .033, .031], [1.615, 0, .022, .049, .047], [1.64, 0, .009, .064, .064],
  [1.667, 0, -.002, .071, .077], [1.691, 0, -.006, .077, .082], [1.721, 0, -.009, .078, .088],
  [1.755, 0, -.012, .079, .09], [1.785, 0, -.014, .071, .079], [1.814, 0, -.015, .047, .053],
  [1.831, 0, -.015, .001, .001],
];
const arm = [
  [.95, .442, .025, .019, .021], [1.005, .42, .022, .025, .028], [1.07, .393, .017, .038, .04],
  [1.125, .367, .01, .043, .045], [1.185, .338, .003, .039, .041], [1.228, .316, -.002, .035, .036],
  [1.285, .293, -.006, .045, .05], [1.35, .267, -.012, .055, .061], [1.411, .242, -.016, .061, .066],
  [1.461, .223, -.018, .062, .062], [1.493, .211, -.017, .048, .046], [1.514, .201, -.014, .015, .019],
  [1.52, .198, -.012, .001, .001],
];
const leg = [
  [.068, .139, .003, .026, .03], [.13, .138, .001, .028, .031], [.22, .136, -.009, .036, .042],
  [.31, .133, -.018, .049, .058], [.39, .128, -.02, .057, .065], [.456, .122, -.009, .047, .054],
  [.505, .119, .007, .041, .045], [.55, .117, .003, .047, .051], [.61, .114, -.004, .061, .066],
  [.69, .107, -.012, .077, .079], [.77, .101, -.02, .083, .086], [.85, .088, -.025, .081, .087],
  [.921, .077, -.023, .067, .074], [.945, .074, -.018, .039, .051],
];
const palm = [[.881, .466, .03, .024, .012], [.902, .463, .029, .029, .016], [.934, .453, .026, .027, .018], [.96, .438, .024, .018, .019]];

function profile(rows, y) {
  let i = 0;
  while (i < rows.length - 2 && y > rows[i + 1][0]) i++;
  const t = Math.max(0, Math.min(1, (y - rows[i][0]) / (rows[i + 1][0] - rows[i][0])));
  return [1, 2, 3, 4].map(c => cubic(rows[Math.max(0, i - 1)][c], rows[i][c], rows[i + 1][c], rows[Math.min(rows.length - 1, i + 2)][c], t));
}
function loft(x, y, z, rows, p, relief = 0) {
  const [cx, cz, w, d] = p;
  const radial = (Math.hypot((x - cx) / w, (z - cz) / d) - 1) * Math.min(w, d) - relief;
  const cap = Math.max(rows[0][0] - y, y - rows.at(-1)[0]);
  return Math.max(radial, cap);
}
function ellipsoid(x, y, z, cx, cy, cz, a, b, c) {
  return (Math.hypot((x - cx) / a, (y - cy) / b, (z - cz) / c) - 1) * Math.min(a, b, c);
}
function segment(x, y, z, a, b, r0, r1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t) - (r0 + (r1 - r0) * t);
}
const fingers = Array.from({ length: 4 }, (_, i) => {
  const x = .449 + i * .013, length = [.053, .066, .061, .047][i];
  return [[x, .891, .031], [x + .014, .891 - length, .041], .0062, .0048];
});
fingers.push([[.441, .926, .038], [.425, .885, .052], .01, .007]);

function field(x, y, z, profiles) {
  x = Math.abs(x);
  let value = 1;
  if (y > .79 && y < 1.64 && x < .245) {
    const front = Math.max(0, z) / .12, back = Math.max(0, -z) / .12;
    // 胸肌、肋缘、腹直肌、脐凹、背部肩胛和臀部起伏直接进入连续表面。
    const relief = front * (.018 * bell(x, .095, .073) * bell(y, 1.397, .065)
      + .008 * bell(x, .043, .035) * bell(y, 1.17, .14)
      - .006 * bell(x, 0, .014) * bell(y, 1.38, .12)
      - .007 * bell(x, 0, .013) * bell(y, 1.064, .013)
      - .006 * bell(x, .11, .058) * bell(y, 1.323, .016)
      - .003 * bell(x, .047, .036) * (bell(y, 1.24, .007) + bell(y, 1.186, .007) + bell(y, 1.132, .007)))
      + back * (.015 * bell(x, .095, .055) * bell(y, 1.42, .075)
      + .012 * bell(x, .08, .05) * bell(y, .913, .055)
      - .006 * bell(x, 0, .015) * bell(y, 1.22, .22));
    value = loft(x, y, z, torso, profiles[0], relief);
  }
  if (y > 1.57 && x < .105) {
    const front = Math.max(0, Math.min(1, (z - .015) / .06));
    const relief = front * (-.008 * bell(x, .029, .016) * bell(y, 1.699, .01)
      + .005 * bell(x, .044, .02) * bell(y, 1.675, .016)
      + .006 * bell(x, .028, .023) * bell(y, 1.716, .009)
      + .022 * bell(x, 0, .009) * bell(y, 1.681, .023)
      + .008 * bell(x, 0, .022) * bell(y, 1.637, .012));
    value = smoothMin(value, loft(x, y, z, head, profiles[1], relief), .009);
    value = smoothMin(value, ellipsoid(x, y, z, .079, 1.691, -.006, .012, .025, .014), .004);
  }
  if (y > .87 && y < 1.54 && x > .15) {
    const muscle = .007 * bell(y, 1.35, .06) * bell(z, .043, .026) + .005 * bell(y, 1.12, .06) * bell(z, -.012, .03);
    value = smoothMin(value, loft(x, y, z, arm, profiles[2], muscle), .021);
    if (y < .97) value = smoothMin(value, loft(x, y, z, palm, profiles[4]), .009);
  }
  if (y > .8 && y < .935 && x > .29) {
    for (const [a, b, r0, r1] of fingers) value = smoothMin(value, segment(x, y, z, a, b, r0, r1), .0025);
  }
  if (y < .97 && x < .205) {
    const relief = .007 * bell(y, .505, .028) * bell(z, .044, .021)
      + .007 * bell(y, .7, .13) * bell(x, .13, .04) * bell(z, .05, .05);
    value = smoothMin(value, loft(x, y, z, leg, profiles[3], relief), .015);
    if (y < .13) {
      value = smoothMin(value, ellipsoid(x, y, z, .139, .049, .025, .034, .038, .067), .008);
      value = smoothMin(value, ellipsoid(x, y, z, .143, .034, .096, .04, .024, .06), .008);
      for (let i = 0; i < 5; i++) value = smoothMin(value, ellipsoid(x, y, z, .111 + i * .014, .029, .144 - i * .005, .008, .011, .019 - i * .001), .003);
    }
  }
  return value;
}

const step = .007, origin = [-.553, -.014, -.175], dimensions = [159, 267, 54];
const [nx, ny, nz] = dimensions;
const values = new Float32Array(nx * ny * nz);
const id = (x, y, z) => (y * nz + z) * nx + x;
for (let y = 0; y < ny; y++) {
  const wy = origin[1] + y * step, profiles = [torso, head, arm, leg, palm].map(rows => profile(rows, wy));
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) values[id(x, y, z)] = field(origin[0] + x * step, wy, origin[2] + z * step, profiles);
}

// 一致的四面体剖分消除跨体素面歧义；共享边顶点保留连续法线。
const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const positions = [], indices = [], edges = new Map();
function point(a, b, ids, pts) {
  let ia = ids[a], ib = ids[b];
  if (ia > ib) [ia, ib] = [ib, ia];
  const key = ia * values.length + ib;
  if (edges.has(key)) return edges.get(key);
  const va = values[ids[a]], vb = values[ids[b]], t = va / (va - vb), index = positions.length / 3;
  for (let c = 0; c < 3; c++) positions.push(pts[a][c] + (pts[b][c] - pts[a][c]) * t);
  edges.set(key, index); return index;
}
function triangle(a, b, c, outside) {
  const p = positions.slice(a * 3, a * 3 + 3), q = positions.slice(b * 3, b * 3 + 3), r = positions.slice(c * 3, c * 3 + 3);
  const u = q.map((v, i) => v - p[i]), v = r.map((w, i) => w - p[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = n.reduce((sum, w, i) => sum + w * (outside[i] - p[i]), 0);
  indices.push(...(dot > 0 ? [a, b, c] : [a, c, b]));
}
for (let y = 0; y < ny - 1; y++) for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
  const ids = corners.map(([dx, dy, dz]) => id(x + dx, y + dy, z + dz));
  if (ids.every(i => values[i] > 0) || ids.every(i => values[i] <= 0)) continue;
  const pts = corners.map(([dx, dy, dz]) => [origin[0] + (x + dx) * step, origin[1] + (y + dy) * step, origin[2] + (z + dz) * step]);
  for (const tet of tetrahedra) {
    const inside = tet.filter(i => values[ids[i]] <= 0), outside = tet.filter(i => values[ids[i]] > 0);
    if (!inside.length || !outside.length) continue;
    if (inside.length === 1 || outside.length === 1) {
      const single = inside.length === 1 ? inside : outside, others = inside.length === 1 ? outside : inside;
      const tri = others.map(i => point(single[0], i, ids, pts)); triangle(...tri, pts[outside[0]]);
    } else {
      const a = point(inside[0], outside[0], ids, pts), b = point(inside[0], outside[1], ids, pts);
      const c = point(inside[1], outside[0], ids, pts), d = point(inside[1], outside[1], ids, pts);
      triangle(a, b, c, pts[outside[0]]); triangle(b, d, c, pts[outside[0]]);
    }
  }
}
// 保持拓扑的离线边折叠；相对误差上限对应约 1 mm，浏览器不加载优化器。
await MeshoptSimplifier.ready;
// 等值面恰好经过格点时，不同边可能产生同位置顶点；先焊接并去掉零面积面。
const weldedPositions = [], weld = new Map(), weldedMap = [];
for (let i = 0; i < positions.length; i += 3) {
  const p = positions.slice(i, i + 3), key = p.map(v => Math.round(v * 1e6)).join(',');
  if (!weld.has(key)) { weld.set(key, weldedPositions.length / 3); weldedPositions.push(...p); }
  weldedMap.push(weld.get(key));
}
const weldedFaces = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const tri = indices.slice(i, i + 3).map(v => weldedMap[v]);
  if (new Set(tri).size !== 3) continue;
  const key = [...tri].sort((a, b) => a - b).join(',');
  // 恰落在格面上的正反重合三角形不构成外壳，成对剔除。
  if (weldedFaces.has(key)) weldedFaces.delete(key); else weldedFaces.set(key, tri);
}
const weldedIndices = [...weldedFaces.values()].flat();
// 保留连通的人体外壳，剔除采样边界附近不属于人体的亚毫米孤立碎片。
const parents = Array.from({ length: weldedPositions.length / 3 }, (_, i) => i);
const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
for (let i = 0; i < weldedIndices.length; i += 3) {
  const [a, b, c] = weldedIndices.slice(i, i + 3); parents[find(a)] = find(b); parents[find(c)] = find(b);
}
const sizes = new Map();
for (let i = 0; i < parents.length; i++) { const r = find(i); sizes.set(r, (sizes.get(r) ?? 0) + 1); }
const largest = [...sizes].sort((a, b) => b[1] - a[1])[0][0];
const connected = weldedIndices.filter(i => find(i) === largest);
const [simplified, error] = MeshoptSimplifier.simplify(new Uint32Array(connected), new Float32Array(weldedPositions), 3, 100000 * 3, .0006);
const surfaceFaces = new Map();
for (let i = 0; i < simplified.length; i += 3) {
  const tri = [...simplified.slice(i, i + 3)], key = [...tri].sort((a, b) => a - b).join(',');
  if (surfaceFaces.has(key)) surfaceFaces.delete(key); else surfaceFaces.set(key, tri);
}
const remap = new Map(), compactPositions = [], compactIndices = [];
for (const index of [...surfaceFaces.values()].flat()) {
  if (!remap.has(index)) {
    remap.set(index, compactPositions.length / 3);
    compactPositions.push(...weldedPositions.slice(index * 3, index * 3 + 3));
  }
  compactIndices.push(remap.get(index));
}
const vertexCount = remap.size;
// float32 顶点保留平滑轮廓；索引根据实际顶点数选 16/32 位。
const positionData = new Float32Array(compactPositions), IndexArray = vertexCount < 65536 ? Uint16Array : Uint32Array;
const indexData = new IndexArray(compactIndices), encode = array => Buffer.from(array.buffer).toString('base64');
const source = `// 自动生成：node scripts/generate-anatomy-body.mjs；勿手工修改编码数据。\n// 连续人体外壳，${vertexCount} 顶点 / ${compactIndices.length / 3} 三角面。\nconst decode = (text, Type) => { const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0)); return new Type(bytes.buffer); };\nexport const bodyPositions = decode('${encode(positionData)}', Float32Array);\nexport const bodyIndices = decode('${encode(indexData)}', ${IndexArray.name});\n`;
await fs.writeFile(new URL('../src/data/anatomy-body.generated.js', import.meta.url), source);
console.log(`连续人体：${vertexCount} 顶点，${compactIndices.length / 3} 面，误差 ${error.toFixed(6)}，${(source.length / 1024).toFixed(0)} KiB。`);
