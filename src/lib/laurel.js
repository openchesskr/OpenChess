// (v0.6.3) 월계수 가지 — 순수 기하(scripts/check-masters.mjs가 검사). 챔피언 블록 양옆 장식용.
//  · side > 0: 줄기가 아래-왼쪽에서 위-오른쪽으로 휘어 잎 끝이 오른쪽(안쪽)을 향한다. side < 0은 거울상.
//  · 잎은 줄기를 따라 엇갈려 좌우 두 장씩 붙는다. 잎이 줄기 밖으로 삐져나오는 폭(pad)을 viewBox에 포함해, SVG 영역에 잘리지 않게 한다.
export function laurelBranch({ side = 1, len = 36, leaves = 7, leaf = 7.5 } = {}) {
  const pad = Math.ceil(leaf * 1.5) + 2;               // 잎 길이(1.35배) + 선 두께 여유
  const w = len * 0.62, h = len * 1.5;
  const W = w + pad * 2, H = h + pad * 2;
  const x0 = side > 0 ? w * 0.2 : w * 0.8, x1 = side > 0 ? w * 0.78 : w * 0.22, cx = side > 0 ? w * 0.05 : w * 0.95;
  const P = (t) => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * x0 + b * cx + c * x1 + pad, a * (h - 2) + b * (h * 0.5) + c * 4 + pad]; };
  const stem = "M" + (x0 + pad) + " " + (h - 2 + pad) + " Q" + (cx + pad) + " " + (h * 0.5 + pad) + " " + (x1 + pad) + " " + (4 + pad);
  const out = [];
  for (let i = 0; i < leaves; i++) {
    const t = 0.08 + i * (0.88 / (leaves - 1));
    const [x, y] = P(t), [xn, yn] = P(Math.min(1, t + 0.02));
    const ang = (Math.atan2(yn - y, xn - x) * 180) / Math.PI, sz = leaf * (1 - 0.35 * t);
    for (const d of [-1, 1]) { if (i === leaves - 1 && d === 1) continue; out.push({ x, y, rot: ang + d * 52, sz }); }
  }
  return { width: W, height: H, pad, stem, leaves: out };
}
/* 잎 한 장의 path(원점에서 +x 방향으로 뻗는 잎). */
export function leafPath(sz) {
  return "M0 0 C" + sz * 0.35 + " " + -sz * 0.5 + " " + sz * 1.05 + " " + -sz * 0.42 + " " + sz * 1.35 + " 0 C" + sz * 1.05 + " " + sz * 0.42 + " " + sz * 0.35 + " " + sz * 0.5 + " 0 0Z";
}
/* 가지가 차지하는 실제 범위(잎 포함)가 viewBox 안에 들어오는지 — 잘림 검사용. 각 잎의 끝점(길이 1.35·sz, 폭 ±0.5·sz)을 회전해 경계를 잰다. */
export function laurelExtent(b) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const l of b.leaves) {
    const r = (l.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const [px, py] of [[0, 0], [l.sz * 1.35, 0], [l.sz * 0.7, -l.sz * 0.5], [l.sz * 0.7, l.sz * 0.5]]) {
      const X = l.x + px * c - py * s, Y = l.y + px * s + py * c;
      minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
    }
  }
  return { minX, maxX, minY, maxY };
}
