#!/usr/bin/env node
/** (v0.5.6 재발 방지) 도감 오프닝 트리 배치 검사.
 *
 *  src/App.jsx에 들어 있는 오프닝 스냅샷(SNAP)으로 도감 트리 구조(이론 수만, e4=위쪽 팔·d4=아래쪽 팔, 스냅샷 순서를 가운데부터 좌우로)를
 *  만들고 src/lib/dexTreeLayout.js로 실제와 같은 설정으로 배치한 뒤, 다음을 검사한다. 하나라도 어기면 빌드를 멈춘다.
 *   · 블록끼리 겹침 0 (블록 아래 전적 칩 자리 포함)
 *   · 라벨–블록, 라벨–라벨 겹침 0
 *   · 연결선(회로 배선형)이 다른 블록을 지나감 0
 *   · 링 간격(부모·자녀 거리)이 깊어질수록 줄어들지 않음(사용자 규칙)
 *   · 계산 시간 예산(1.5초) 이내
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-dex-tree-layout.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { layoutDexTree, placeDexLabels, dexEdgeGeometry, DEX_LAYOUT } from "../src/lib/dexTreeLayout.js";
import { ROOT_ORDER, DIR_OF_ROOT, SCHEMATIC_BOX_W, SCHEMATIC_BOX_H, SCHEMATIC_ZOOM_LABEL_BASE } from "../src/lib/schematicGeometry.js";

const root = new URL("..", import.meta.url).pathname;
const src = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const m = src.match(/const SNAP = \/\*__DATA__\*\/ (\{.*\});\s*$/m);
if (!m) { console.error("✗ dex layout check: App.jsx에서 SNAP 데이터를 찾지 못했어요."); process.exit(1); }
const SNAP = JSON.parse(m[1]);
const stripSuffix = (s) => String(s).replace(/[+#?!]+$/g, "");
const boxW = SCHEMATIC_BOX_W, boxH = SCHEMATIC_BOX_H;

// 앱의 centerOrderByAdopt와 같은 규칙: 가장 흔한 수(스냅샷 첫 수)가 가운데, 나머지가 오른쪽·왼쪽 번갈아.
function centerOrder(list) {
  const left = [], right = [];
  list.forEach((k, i) => { if (i === 0) return; (i % 2 === 1 ? right : left).push(k); });
  left.reverse();
  return list.length ? [...left, list[0], ...right] : [];
}
let nodeCount = 0;
function build(san, pathArr, depth, dir, parentEff) {
  const key = pathArr.join(" ");
  const node = { san, path: pathArr, key, depth, dir, children: [], label: null };
  nodeCount++;
  const snap = SNAP.tree[key];
  let moves = snap && snap.moves ? snap.moves.filter((mv) => mv.book) : [];
  if (depth === 0) moves = ROOT_ORDER.map((s) => moves.find((mv) => stripSuffix(mv.san) === s)).filter(Boolean);
  else moves = centerOrder(moves);
  for (const mv of moves) {
    const eff = mv.name || parentEff;
    const child = build(mv.san, [...pathArr, mv.san], depth + 1, depth === 0 ? DIR_OF_ROOT[stripSuffix(mv.san)] : dir, eff);
    if (eff && eff !== parentEff) child.label = eff;
    node.children.push(child);
  }
  return node;
}
const tree = build(null, [], 0, null, null);
const arms = {};
for (const c of tree.children) arms[c.dir] = c;

const L = SCHEMATIC_ZOOM_LABEL_BASE;
const t0 = performance.now();
const res = layoutDexTree(arms, { boxW, boxH, safeGap: 70 / L, earlySafeGap: 120 / L, jitterMax: 100 / L, maxRadialStep: (70 / L) * 80 });
const nodes = res.nodes;
const labels = placeDexLabels(nodes.filter((n) => n.label).map((n) => ({ key: n.key, name: n.label, x: n.x, y: n.y })), nodes, { boxW, boxH });
for (const n of nodes) if (n.depth >= 2 && n.parent) n.edge = dexEdgeGeometry(n.parent, n, 0, 0, boxW, boxH);
const ms = performance.now() - t0;

const problems = [];
// 공간 격자
const G = 240, grid = new Map();
const add = (o) => { for (let gx = Math.floor(o.l / G); gx <= Math.floor((o.l + o.w) / G); gx++) for (let gy = Math.floor(o.t / G); gy <= Math.floor((o.t + o.h) / G); gy++) { const k = gx + "," + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); } };
nodes.forEach((n) => add({ kind: "block", n, l: n.x, t: n.y, w: boxW, h: boxH + DEX_LAYOUT.CHIP_BELOW })); // 전적 칩 자리 포함
labels.forEach((g) => add({ kind: "label", g, l: g.left, t: g.top, w: g.w, h: 20 }));
const seen = new Set();
let bb = 0, lb = 0, ll = 0;
for (const cell of grid.values()) for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
  const A = cell[i], B = cell[j];
  const id = (A.n ? A.n.key : "L:" + A.g.key) + "|" + (B.n ? B.n.key : "L:" + B.g.key);
  if (seen.has(id)) continue; seen.add(id);
  if (A.kind === "label" && B.kind === "block" && B.n.key === A.g.key) continue;
  if (B.kind === "label" && A.kind === "block" && A.n.key === B.g.key) continue;
  if (!(A.l < B.l + B.w && B.l < A.l + A.w && A.t < B.t + B.h && B.t < A.t + A.h)) continue;
  if (A.kind === "block" && B.kind === "block") bb++; else if (A.kind === "label" && B.kind === "label") ll++; else lb++;
}
if (bb) problems.push("블록끼리 겹침 " + bb + "곳");
if (lb) problems.push("라벨–블록 겹침 " + lb + "곳");
if (ll) problems.push("라벨끼리 겹침 " + ll + "곳");
// 연결선이 다른 블록을 지나가는지(Liang–Barsky)
const segHits = (x1, y1, x2, y2, b) => {
  let a0 = 0, a1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const P = [-dx, dx, -dy, dy], Q = [x1 - b.x, b.x + boxW - x1, y1 - b.y, b.y + boxH - y1];
  for (let i = 0; i < 4; i++) { if (P[i] === 0) { if (Q[i] < 0) return false; } else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > a1) return false; if (t > a0) a0 = t; } else { if (t < a0) return false; if (t < a1) a1 = t; } } }
  return a0 < a1;
};
let eb = 0;
for (const n of nodes) {
  if (!n.edge) continue;
  const pts = n.edge.pts;
  let hit = false;
  for (let k = 1; k < pts.length && !hit; k++) {
    const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
    for (let gx = Math.floor(Math.min(x1, x2) / G); gx <= Math.floor(Math.max(x1, x2) / G) && !hit; gx++) for (let gy = Math.floor(Math.min(y1, y2) / G); gy <= Math.floor(Math.max(y1, y2) / G) && !hit; gy++) {
      for (const o of grid.get(gx + "," + gy) || []) { if (o.kind === "block" && o.n !== n && o.n !== n.parent && segHits(x1, y1, x2, y2, o.n)) { hit = true; break; } }
    }
  }
  if (hit) eb++;
}
if (eb) problems.push("다른 블록을 지나가는 연결선 " + eb + "개");
// 링 간격이 깊어질수록 줄어들지 않는지
for (const dir of Object.keys(arms)) {
  const rByDepth = new Map();
  for (const n of nodes) if (n.dir === dir) rByDepth.set(n.depth, n.r);
  const depths = [...rByDepth.keys()].sort((a, b) => a - b);
  let prevStep = 0;
  for (let i = 1; i < depths.length; i++) {
    const step = rByDepth.get(depths[i]) - rByDepth.get(depths[i - 1]);
    if (i > 1 && step < prevStep - 0.5) problems.push(dir + "팔 " + depths[i] + "수째 링 간격이 앞보다 줄어듦(" + Math.round(prevStep) + " → " + Math.round(step) + ")");
    prevStep = step;
  }
}
if (ms > 1500) problems.push("배치 계산이 너무 느림(" + Math.round(ms) + "ms > 1500ms)");

if (problems.length) {
  console.error("✗ 도감 오프닝 트리 배치 검사 실패(src/lib/dexTreeLayout.js):");
  problems.forEach((p) => console.error("  · " + p));
  process.exit(1);
}
console.log("✓ dex tree layout check: 블록 " + nodeCount + "개·라벨 " + labels.length + "개 겹침 0, 블록 관통 선 0, 계산 " + Math.round(ms) + "ms");
