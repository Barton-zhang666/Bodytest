import * as T from '../vendor/three/three.module.js';

// 脑沟控制线定义在半球曲面上：[前后经度、上下纬度]。
// 不用等距正弦条带；长沟、短支沟和不同曲率共同形成脑回。
const SULCI = [
  [[-.31, 1.39], [-.23, 1.17], [-.08, .96], [-.18, .72], [.03, .5], [.09, .24], [.22, .03]],
  [[.14, 1.34], [.23, 1.12], [.17, .88], [.38, .68], [.29, .46], [.45, .23]],
  [[-.76, 1.19], [-.64, .95], [-.74, .76], [-.55, .55], [-.65, .29], [-.45, .08]],
  [[-1.38, .76], [-1.13, .71], [-.98, .49], [-1.04, .27], [-.83, .08]],
  [[-.38, 1.48], [-.73, 1.4], [-1.01, 1.17], [-1.31, 1.04]],
  [[.55, 1.22], [.72, 1.05], [.65, .84], [.87, .65], [.82, .41], [1.03, .23], [1.32, .21]],
  [[1.12, 1.13], [1.29, .94], [1.21, .75], [1.44, .55]],
  [[-1.36, -.13], [-1.12, -.03], [-.86, -.16], [-.59, -.1], [-.33, -.22], [-.06, -.17], [.19, -.29], [.45, -.22], [.7, -.32], [1.06, -.23], [1.4, -.31]],
  [[-1.23, -.43], [-.96, -.39], [-.73, -.49], [-.41, -.42], [-.17, -.52], [.1, -.48]],
  [[.24, -.62], [.49, -.48], [.72, -.57], [.99, -.49], [1.31, -.57]],
  [[-.95, -.77], [-.71, -.69], [-.48, -.81], [-.19, -.73], [.09, -.87], [.39, -.82], [.63, -.95]],
  [[-.59, .55], [-.37, .6], [-.26, .43]],
  [[-.16, .72], [.01, .66], [.13, .74]],
  [[.4, .62], [.56, .5], [.6, .32], [.72, .27]],
  [[-.96, .49], [-.82, .57], [-.69, .52]],
  [[1.04, .74], [1.11, .56], [.98, .46]],
  [[-.31, .05], [-.13, .11], [.01, -.01]],
  [[.57, .06], [.79, -.02], [.96, .08], [1.2, .01]],
  [[1.49, .96], [1.38, .82], [1.47, .68], [1.35, .54]],
  [[1.48, .38], [1.28, .42], [1.16, .34], [1.22, .2]],
  [[.91, 1.36], [1.04, 1.23], [.93, 1.1]],
  [[-.48, .99], [-.34, .92], [-.41, .77]],
  [[.4, -.42], [.32, -.29], [.45, -.12]],
];

function grooveSegments() {
  const segments = [];
  for (const side of [-1, 1]) for (let k = 0; k < SULCI.length; k++) {
    // 轻微确定性不对称：两侧的分支并非机械镜像。
    const curve = new T.CatmullRomCurve3(SULCI[k].map(([u, v]) => new T.Vector3(u, v + (side === 1 ? .035 * Math.sin(u * 3 + k) : 0), 0)));
    let previous;
    for (let i = 0; i <= 32; i++) {
      const { x: u, y: v } = curve.getPoint(i / 32);
      const p = [side * Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)];
      if (previous) {
        const delta = p.map((value, j) => value - previous[j]);
        segments.push([...previous, ...delta, delta.reduce((sum, value) => sum + value * value, 0)]);
      }
      previous = p;
    }
  }
  return segments;
}

export function createCerebrumGeometry() {
  // 一个连续脑体，纵裂为窄凹槽，不把脑分成两颗相互分离的椭球。
  const geometry = new T.SphereGeometry(1, 128, 88);
  const positions = geometry.attributes.position, colors = [], segments = grooveSegments();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    let distance = Infinity;
    for (const [ax, ay, az, dx, dy, dz, length] of segments) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / length));
      const qx = x - ax - t * dx, qy = y - ay - t * dy, qz = z - az - t * dz;
      distance = Math.min(distance, qx * qx + qy * qy + qz * qz);
    }
    const sulcus = Math.exp(-distance / .0011);
    const fissure = Math.exp(-x * x / .001) * Math.max(0, (y + .35) / 1.35);
    const gyrus = .016 * Math.exp(-((Math.sqrt(distance) - .07) ** 2) / .002);
    const r = 1 + gyrus - .05 * sulcus - .055 * fissure;
    const temporal = 1 + .075 * Math.exp(-((y + .35) ** 2) / .12) * (1 - z * z);
    const base = y < -.2 ? -.2 + (y + .2) * .78 : y;
    positions.setXYZ(i, x * .073 * r * temporal, base * .057 * r, z * .079 * r * (1 - .06 * y));
    const shade = 1 - .19 * sulcus - .14 * fissure;
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}
