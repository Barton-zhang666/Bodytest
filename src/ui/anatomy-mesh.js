import * as T from '../vendor/three/three.module.js';
import { createCerebrumGeometry } from './anatomy-brain.js';
import { bodyPositions, bodyIndices } from '../data/anatomy-body.generated.js';

// 米制、正面朝 +Z；模型左侧为 +X。全部几何由确定性函数生成。
export const ORGAN_CENTERS = {
  brain: [0, 1.752, -0.015], thyroid: [0, 1.535, 0.043], lungs: [0, 1.354, 0],
  heart: [0.038, 1.305, 0.045], liver: [-0.066, 1.185, 0.012], stomach: [0.075, 1.161, 0.016],
  spleen: [0.125, 1.172, -0.025], pancreas: [0.043, 1.114, -0.025], kidneys: [0, 1.098, -0.052],
  intestines: [0, 0.994, 0.029], bladder: [0, 0.868, 0.028],
};

const vec = p => new T.Vector3(...p);
const material = (color, opacity = 0.5) => new T.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0, vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: T.FrontSide });
const sphere = new T.SphereGeometry(1, 24, 16);
const bell = (v, center, width) => Math.exp(-(((v - center) / width) ** 2));
const cubic = (a, b, c, d, t) => b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));

function ellipsoid(parent, position, scale, mat, warp, resolution = 40) {
  let geometry = sphere;
  if (warp) {
    geometry = new T.SphereGeometry(1, resolution, Math.round(resolution * .65));
    const a = geometry.attributes.position;
    const colors = [];
    for (let i = 0; i < a.count; i++) {
      const p = warp(a.getX(i), a.getY(i), a.getZ(i));
      a.setXYZ(i, ...p);
      const shade = p[3] ?? 1; colors.push(shade, shade, shade);
    }
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
  }
  const mesh = new T.Mesh(geometry, mat);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}

function tube(parent, points, radius, mat, segments = 28, sides = 6) {
  const path = new T.CatmullRomCurve3(points.map(vec), false, 'centripetal');
  const mesh = new T.Mesh(new T.TubeGeometry(path, segments, radius, sides, false), mat);
  parent.add(mesh); return mesh;
}

// 平滑椭圆截面：躯干/四肢由连续表面组成，而非平面挤压。
export function sectionGeometry(sections, segments = 32) {
  const positions = [], indices = [];
  for (const [cx, y, cz, width, depth] of sections) {
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      positions.push(cx + Math.cos(a) * width, y, cz + Math.sin(a) * depth);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (const row of [0, sections.length - 1]) {
    const [x, y, z] = sections[row], center = positions.length / 3;
    positions.push(x, y, z);
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      indices.push(...(row === 0 ? [center, a, a + 1] : [center, a + 1, a]));
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

// 三次插值截面和局部雕刻塑造器官轮廓；细节只在构建时计算。
function organicSurface(parent, sections, mat, warp, segments = 48, subdivisions = 6) {
  const rows = [];
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < subdivisions; j++) {
    const t = j / subdivisions;
    rows.push(sections[i].map((v, c) => c === 1 ? v + (sections[i + 1][c] - v) * t : cubic(sections[Math.max(0, i - 1)][c], v, sections[i + 1][c], sections[Math.min(sections.length - 1, i + 2)][c], t)));
  }
  rows.push(sections.at(-1));
  const geometry = sectionGeometry(rows, segments), p = geometry.attributes.position;
  if (warp) {
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...warp(p.getX(i), p.getY(i), p.getZ(i)));
    geometry.computeVertexNormals();
  }
  const mesh = new T.Mesh(geometry, mat); parent.add(mesh); return mesh;
}

function sweptOrgan(parent, points, radii, mat, segments = 72, sides = 24, relief = () => 1) {
  const path = new T.CatmullRomCurve3(points.map(vec), false, 'centripetal');
  const frames = path.computeFrenetFrames(segments, false), vertices = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = path.getPoint(t), u = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(u));
    const radius = [0, 1].map(c => cubic(radii[Math.max(0, k - 1)][c], radii[k][c], radii[k + 1][c], radii[Math.min(radii.length - 1, k + 2)][c], u - k));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, r = relief(t, a);
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius[0] * r).addScaledVector(frames.binormals[i], Math.sin(a) * radius[1] * r);
      vertices.push(v.x, v.y, v.z);
      if (i < segments && j < sides) {
        const b = i * (sides + 1) + j, n = b + sides + 1;
        indices.push(b, b + 1, n, b + 1, n + 1, n);
      }
    }
  }
  for (const end of [0, segments]) {
    const center = vertices.length / 3; vertices.push(...path.getPoint(end / segments).toArray());
    for (let j = 0; j < sides; j++) {
      const a = end * (sides + 1) + j;
      indices.push(...(end === 0 ? [center, a + 1, a] : [center, a, a + 1]));
    }
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, mat); parent.add(mesh); return mesh;
}

export function buildAnatomy() {
  const root = new T.Group(), body = new T.Group(), vessels = new T.Group(), skeleton = new T.Group();
  const faceDetails = new T.Group(); body.add(faceDetails);
  root.add(skeleton, vessels, body);
  const skin = material('#d8c7b4', 0.65), contour = material('#acbdb0', 0.25);
  const faceSkin = material('#d8c7b4', 0.54), bone = material('#e4ddc7', 0.19);
  const arterial = material('#b15c55', 0.43), venous = material('#5b93a2', 0.4);
  const skinMaterials = [skin, faceSkin];
  const organs = new Map(), pickable = [];
  const tissue = (id, color) => {
    const group = new T.Group(); group.position.set(...ORGAN_CENTERS[id]); root.add(group);
    const mat = material(color, 0.56), detail = material(new T.Color(color).lerp(new T.Color('#ffe1c6'), 0.32), 0.64);
    organs.set(id, { group, material: mat, detail, baseColor: color });
    return [group, mat, detail];
  };

  // 肩颈、腋窝、躯干、四肢和头部为一个连续表面，避免透明球体接缝。
  const shell = new T.BufferGeometry();
  shell.setAttribute('position', new T.BufferAttribute(bodyPositions, 3));
  shell.setIndex(new T.BufferAttribute(bodyIndices, 1)); shell.computeVertexNormals();
  const skinColors = [];
  for (let i = 0; i < bodyPositions.length; i += 3) {
    const [x, y, z] = bodyPositions.slice(i, i + 3);
    // 躯干仍为 40% 透明层；面部前侧略实一些，避免后方小脑和脑干像悬浮的五官。
    const face = bell(y, 1.656, .052) * bell(x, 0, .068) * Math.max(0, Math.min(1, (z - .025) / .045));
    skinColors.push(1, 1, 1, .4 / .65 + (1 - .4 / .65) * face);
  }
  shell.setAttribute('color', new T.Float32BufferAttribute(skinColors, 4));
  const bodyMesh = new T.Mesh(shell, skin); bodyMesh.name = 'continuous-body'; body.add(bodyMesh);
  for (const side of [-1, 1]) {
    tube(body, [[side * .012, 1.524, .036], [side * .075, 1.515, .051], [side * .148, 1.499, .055], [side * .201, 1.479, .035]], .0018, contour, 28);
    // 耳轮与耳甲的薄层轮廓，而非额外的球形耳朵。
    tube(body, [[side * .082, 1.671, .001], [side * .088, 1.686, .007], [side * .087, 1.71, -.003], [side * .08, 1.705, -.013]], .0021, faceSkin, 24);
  }
  const eyes = material('#f1ede1', .64), lips = material('#ba7977', .7), iris = material('#67776b', .8);
  for (const side of [-1, 1]) {
    ellipsoid(faceDetails, [side * .03, 1.699, .072], [.012, .004, .003], eyes);
    ellipsoid(faceDetails, [side * .03, 1.699, .075], [.003, .0033, .001], iris);
  }
  // 鼻梁已融合入外壳，鼻翼只补充小尺度轮廓。
  for (const side of [-1, 1]) ellipsoid(faceDetails, [side * .008, 1.666, .091], [.006, .004, .005], faceSkin);
  ellipsoid(faceDetails, [0, 1.644, .075], [.018, .0028, .003], lips);
  ellipsoid(faceDetails, [0, 1.638, .076], [.016, .003, .003], lips);

  // 后方脊柱、胸廓与骨盆，半透明且不过度遮挡器官。
  tube(skeleton, [[0, .867, -.064], [0, 1.09, -.087], [0, 1.34, -.095], [0, 1.53, -.03]], .009, bone, 36);
  for (let i = 0; i < 17; i++) ellipsoid(skeleton, [0, .94 + i * .03, -.085], [.015, .008, .014], bone);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const y = 1.427 - i * .026, w = .105 + Math.sin(i / 8 * Math.PI) * .065;
      tube(skeleton, [[side * .018, y, -.08], [side * w, y - .02, -.04], [side * w, y - .028, .043], [side * .035, y - .045, .091]], .0032, bone, 18, 5);
    }
    tube(skeleton, [[side * .028, .894, -.044], [side * .12, .947, -.025], [side * .12, .89, .034], [side * .058, .853, .047]], .013, bone, 20);
  }
  tube(vessels, [[.01, 1.38, .015], [-.012, 1.405, -.019], [-.032, 1.37, -.045], [-.027, 1.15, -.045], [-.02, .96, -.035]], .006, arterial, 36);
  tube(vessels, [[.02, .96, -.048], [.027, 1.18, -.04], [.02, 1.37, .007], [.01, 1.5, .005]], .0055, venous);
  for (const side of [-1, 1]) {
    tube(vessels, [[0, 1.4, 0], [side * .203, 1.474, -.005], [side * .317, 1.225, 0], [side * .44, .957, .024]], .0033, arterial);
    tube(vessels, [[-.02, .97, -.035], [side * .08, .84, 0], [side * .12, .505, .012], [side * .138, .15, .015]], .004, arterial);
    tube(vessels, [[0, 1.1, -.035], [side * .085, 1.1, -.052]], .004, arterial, 10);
  }

  {
    const [g, m, d] = tissue('brain', '#c09499');
    const cerebrum = new T.Mesh(createCerebrumGeometry(), m);
    cerebrum.name = 'continuous-cerebrum'; g.add(cerebrum);
    ellipsoid(g, [0, -.044, -.04], [.037, .02, .029], d, (x, y, z) => {
      const fold = 1 + .035 * Math.sin(y * 43 + z * 4);
      return [x * fold, y, z * fold];
    }, 48);
    sweptOrgan(g, [[0, -.04, -.026], [0, -.061, -.034], [0, -.081, -.036]], [[.012, .011], [.009, .01], [.005, .006]], m, 20, 12);
  }
  {
    const [g, m] = tissue('thyroid', '#ca985d');
    for (const side of [-1, 1]) ellipsoid(g, [side * .018, 0, 0], [.012, .022, .01], m).rotation.z = -side * .32;
    ellipsoid(g, [0, -.005, .001], [.012, .006, .009], m);
  }
  {
    const [g, m, d] = tissue('lungs', '#c38c91');
    for (const side of [-1, 1]) {
      const rows = [
        [.102, -.105, -.008, .045, .036], [.107, -.098, -.009, .062, .058],
        [.105, -.071, -.01, .066, .063], [.1, -.027, -.009, .064, .061],
        [.096, .018, -.011, .058, .054], [.087, .06, -.014, .044, .04],
        [.076, .095, -.016, .027, .026], [.071, .111, -.018, .01, .012],
        [.07, .115, -.018, .001, .001],
      ].map(([x, ...rest]) => [x * side, ...rest]);
      organicSurface(g, rows, m, (x, y, z) => {
        const medial = bell(x * side, .04, .033);
        // 左肺心切迹较深；肺底凹面和斜裂也改变轮廓。
        const notch = side === 1 ? .022 * medial * bell(y, -.035, .038) * Math.max(0, (z + .025) / .08) : 0;
        const fissure = .0019 * bell(y, -.28 * (x * side - .09) - .012, .004) * Math.max(0, z / .05);
        return [x + side * notch, y + .009 * bell(y, -.105, .012) * bell(x * side, .1, .038), z - fissure];
      });
      tube(g, [[side * .053, .024, .026], [side * .088, -.005, .046], [side * .131, -.033, .043], [side * .163, -.06, .009]], .0009, d, 32);
      if (side === -1) tube(g, [[-.052, -.029, .025], [-.106, -.027, .05], [-.159, -.024, .027]], .0009, d, 26);
      for (const branch of [-1, 0, 1]) tube(g, [[0, .08, -.012], [side * .054, .034, -.01], [side * (.093 + branch * .017), -.027 + branch * .038, -.004]], .0027, d, 20, 8);
    }
  }
  const airway = material('#d3b49a', .42);
  tube(root, [[0, 1.565, .022], [0, 1.475, .02], [0, 1.42, -.012]], .008, airway, 18);
  for (let i = 0; i < 9; i++) {
    const ring = new T.Mesh(new T.TorusGeometry(.0083, .0012, 4, 16), airway);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.45 + i * .011, .02); root.add(ring);
  }
  {
    const [g, m, d] = tissue('heart', '#a94d57');
    organicSurface(g, [
      [.024, -.075, .01, .001, .002], [.018, -.065, .009, .013, .014],
      [.008, -.042, .005, .029, .028], [-.003, -.012, .003, .041, .036],
      [-.005, .014, 0, .044, .034], [-.005, .033, -.006, .035, .027],
      [-.006, .046, -.009, .021, .019], [-.007, .051, -.01, .004, .005],
    ], m, (x, y, z) => [x, y, z - .003 * bell(x, .006 - y * .2, .005) * Math.max(0, z / .035)]);
    for (const side of [-1, 1]) ellipsoid(g, [side * .026, .032, .003], [.018, .02, .021], m, (x, y, z) => [x * (1 + .12 * y), y, z * (1 + .08 * Math.sin(y * 9))]);
    sweptOrgan(g, [[-.013, .032, -.008], [-.017, .063, -.012], [-.004, .079, -.017], [.014, .068, -.025], [.017, .043, -.03]], [[.008, .008], [.009, .009], [.008, .008], [.007, .007]], m, 36, 12);
    tube(g, [[.012, .028, .019], [.005, .054, .022], [-.023, .059, .015]], .006, d, 24, 10);
    tube(g, [[-.029, .024, -.015], [-.031, .064, -.022]], .006, d, 16, 10);
    // 冠脉顺着室间沟和房室沟分支，不用刻线拼出心形符号。
    tube(g, [[-.03, .023, .022], [-.006, .026, .031], [.021, .017, .028], [.034, .004, .018]], .0015, d, 28, 6);
    tube(g, [[.003, .025, .032], [.004, -.002, .037], [.013, -.034, .031], [.024, -.062, .016]], .0015, d, 30, 6);
    for (let i = 0; i < 3; i++) tube(g, [[.007 + i * .004, -.007 - i * .015, .035 - i * .005], [-.014 + i * .008, -.025 - i * .013, .027 - i * .004]], .0008, d, 16, 5);
  }
  {
    const [g, m, d] = tissue('liver', '#94554b');
    ellipsoid(g, [.025, .005, -.003], [.106, .057, .063], m, (x, y, z) => {
      const left = Math.max(0, x), taper = 1 - .63 * left;
      const lower = y < 0 ? -Math.pow(-y, .65) * .68 : y;
      const notch = .08 * bell(x, .28, .07) * Math.max(0, z);
      return [x, lower * taper + .08 * x, z * (.95 - .38 * left) - notch];
    }, 64);
    tube(g, [[.036, .039, .028], [.025, .008, .057], [.013, -.023, .042]], .0011, d, 24);
    ellipsoid(g, [-.014, -.032, .018], [.011, .024, .013], material('#79894c', .6), (x, y, z) => [x * (1 - .32 * y), y, z * (1 - .32 * y)]);
  }
  {
    const [g, m, d] = tissue('stomach', '#c68d76');
    // 连续 J 形胃体：贲门细、胃底宽、胃窦回弯并收束到幽门。
    sweptOrgan(g, [[-.028, .092, -.021], [-.023, .051, -.01], [.004, .035, .004], [.022, -.005, .008], [.009, -.047, .01], [-.025, -.052, .007], [-.051, -.034, 0]],
      [[.009, .009], [.013, .014], [.035, .032], [.039, .037], [.028, .03], [.015, .018], [.007, .009]], m, 96, 32);
    tube(g, [[-.044, -.034, .009], [-.052, -.06, -.002], [-.039, -.079, -.019], [-.022, -.062, -.029]], .008, d, 32, 10);
    for (let i = 0; i < 3; i++) tube(g, [[.014 + i * .008, .018, .032], [.023 + i * .006, -.013, .043], [.007 + i * .008, -.041, .033]], .0008, d, 24, 5);
  }
  {
    const [g, m] = tissue('spleen', '#9e6882');
    ellipsoid(g, [0, 0, 0], [.023, .05, .026], m, (x, y, z) => [x * (1 + .15 * y), y, z * (x < 0 ? .75 : 1) + .13 * x * x]).rotation.z = -.25;
  }
  {
    const [g, m, d] = tissue('pancreas', '#d3af68');
    sweptOrgan(g, [[-.065, -.016, .005], [-.055, .004, 0], [-.024, .009, -.003], [.015, .006, -.003], [.055, .014, -.006], [.074, .023, -.01]], [[.011, .014], [.018, .021], [.013, .015], [.01, .012], [.008, .009], [.002, .003]], m, 80, 24, (t, a) => 1 + .065 * Math.sin(t * 91 + Math.sin(a * 3)) * Math.cos(a * 5));
    tube(g, [[-.059, -.009, .019], [-.024, .007, .012], [.023, .007, .009], [.06, .016, .002]], .0009, d, 30, 5);
  }
  {
    const [g, m, d] = tissue('kidneys', '#a66761');
    for (const side of [-1, 1]) {
      ellipsoid(g, [side * .084, side === -1 ? -.009 : .005, 0], [.027, .048, .026], m, (x, y, z) => [x + side * .37 * bell(y, 0, .4) * bell(x * side, -.7, .6), y, z * (1 - .13 * bell(y, 0, .35) * bell(x * side, -.65, .5))]);
      ellipsoid(g, [side * .066, 0, .002], [.008, .016, .01], d);
      tube(g, [[side * .067, -.012, .01], [side * .062, -.118, .01], [side * .015, -.217, .077]], .0025, d, 24, 5);
    }
  }
  {
    const [g, m, d] = tissue('intestines', '#cd9d83');
    // 结肠位于腹腔外围，小肠盘曲填充内部；两者都是真正管状几何。
    const colonPoints = [[-.104, -.052, -.004], [-.112, .018, -.003], [-.096, .073, -.008], [-.049, .065, .012], [.011, .048, .025], [.077, .079, -.008], [.106, .062, -.014], [.105, -.014, -.004], [.084, -.064, .015], [.038, -.049, .032], [.013, -.08, .022], [0, -.112, -.004]];
    sweptOrgan(g, colonPoints, [[.014, .013], [.014, .014], [.013, .014], [.014, .013], [.012, .012], [.009, .01]], m, 180, 14,
      (t, a) => 1 + .1 * Math.cos(t * Math.PI * 54) * (.75 + .25 * Math.cos(a * 3)));
    tube(g, [[-.104, -.051, -.004], [-.104, -.077, -.004], [-.082, -.081, -.009]], .003, m, 18, 6);
    // 非等距回袢、不同深度和弯曲方向，避免旧版平行排管的几何感。
    const bowel = [
      [-.066, .044, .022], [-.034, .047, .041], [-.012, .02, .045], [-.045, .005, .038], [-.071, .023, .023],
      [-.073, -.012, .026], [-.046, -.022, .049], [-.024, -.005, .052], [-.006, .027, .036], [.023, .033, .025],
      [.055, .015, .034], [.033, -.007, .048], [.005, .002, .05], [-.012, -.025, .056], [-.045, -.045, .042],
      [-.068, -.036, .024], [-.054, -.063, .027], [-.021, -.057, .038], [.009, -.039, .045], [.032, -.019, .043],
      [.071, -.006, .022], [.077, -.033, .02], [.054, -.046, .037], [.03, -.035, .046], [.014, -.056, .032],
      [-.007, -.073, .012], [-.038, -.071, .009], [-.067, -.048, .008], [-.091, -.041, 0],
    ];
    tube(g, bowel, .0075, d, 320, 10);
  }
  {
    const [g, m] = tissue('bladder', '#cfb474');
    ellipsoid(g, [0, 0, 0], [.033, .037, .029], m, (x, y, z) => [x * (.9 + y * .24), y, z * (.92 + y * .19)]);
    tube(g, [[0, -.02, 0], [0, -.051, 0]], .005, m, 8);
  }

  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.renderOrder = 1;
    // 每个几何都提供颜色缓冲，避免不同网格切换时缺失属性造成暗色。
    if (!mesh.geometry.attributes.color) mesh.geometry.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3).fill(1), 3));
  });
  body.traverse(mesh => { if (mesh.isMesh) mesh.renderOrder = 3; });
  for (const [id, organ] of organs) organ.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.userData.organ = id; mesh.renderOrder = 2; pickable.push(mesh);
  });
  return { root, body, skeleton, vessels, organs, pickable, skinMaterials, lips, eyes, faceDetails };
}

export function meshStatistics(root) {
  let triangles = 0, meshes = 0;
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    geometries.add(object.geometry); materials.add(object.material);
  });
  return { meshes, triangles, geometries: geometries.size, materials: materials.size };
}

export function disposeAnatomy(model) {
  const geometries = new Set(), materials = new Set();
  model.root.traverse(mesh => { if (mesh.isMesh) { geometries.add(mesh.geometry); materials.add(mesh.material); } });
  // dispose 释放 GPU 缓冲，不删除 CPU 顶点；共享球体可在下次初始化时重新上传。
  for (const geometry of geometries) geometry.dispose();
  for (const mat of materials) mat.dispose();
}
