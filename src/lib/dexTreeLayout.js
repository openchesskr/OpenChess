// (v0.5.6 개편, 사용자 요청 "기존 규칙은 지키면서 더 빠르게, 겹침 없이, 더 효율적으로") 도감 오프닝 트리(나침반형 방사 트리) 배치 계산.
//
// 입력은 "구조"뿐이다 — 팔(arm) 두 개(N=1.e4 위쪽 절반, S=1.d4 아래쪽 절반)의 뿌리 노드와, 노드마다 순서가 정해진 children,
// 그리고 라벨 이름(label). 좌표는 이 구조만의 결정적 함수라, 채택률·이름 같은 부가 데이터가 늦게 도착해도 블록이 움직이지 않는다
// (예전엔 흔들림을 막으려고 좌표 캐시·순서 캐시·보간을 겹겹이 썼다 — 이제 그럴 필요 자체가 없다).
//
// 지키는 기존 규칙(OpeningSchematic 주석에 기록된 사용자 요청들):
//  · 1수(e4/d4)는 중심 칩에서 정확히 위/아래 ROOT_GAP 거리. 팔 하나는 반원(180° × 0.94)만 쓴다.
//  · 같은 깊이(ply)의 노드는 한 링(같은 반지름) 위에 놓이고, 부모의 형제 순서(DFS 순서)를 그대로 지켜 연결선이 서로 교차하지 않는다.
//  · (v0.5.6 사용자 요청으로 뒤집음) 형제끼리는 최소 간격, 사촌끼리(부모가 다른 이웃)는 그보다 넓은 간격(COUSIN_FACTOR) — 갈래가 한눈에 묶여 보이게.
//  · 이웃 블록 중심 거리 ≥ SAFE_GAP(화면 70px), 이름이 많은 앞쪽(깊이 ≤ EARLY_NAME_DEPTH)은 EARLY_SAFE_GAP(화면 120px).
//  · 링 간격(부모·자녀 거리)은 깊어질수록 같거나 커진다(줄어들지 않는다).
//  · 깊이 ≥ 3에서 라벨 붙은 노드가 같은 링에서 이웃하면 반지름을 번갈아 살짝 어긋나게(지터, 화면 최대 ±100px).
//  · 라벨은 블록 위, 블록과 겹치면 아래, 다른 라벨과도 겹치지 않게.
// 달라진 점:
//  · 예전엔 한 링의 모든 노드를 반원 전체에 "균등하게" 흩어 자식이 부모에게서 수천 px 떨어지기 일쑤였다(평균 연결선 3,000px대,
//    다른 블록을 관통하는 선 190여 개). 이제 각 노드는 자기 부모 각도 바로 밑에 모이고, 붐빌 때만 필요한 만큼 옆으로 밀린다 —
//    "순서 유지 + 최소 간격" 조건에서 부모 각도와의 차이 제곱합을 최소로 하는 1차원 배치(등위 회귀, PAV)를 정확히 푼다.
//  · 최소 간격을 블록 모양(가로 98 × 세로 44)에 맞춰 방향별로 계산한다 — 링이 가로로 흐르는 팔 가운데선 블록 폭만큼, 세로로
//    흐르는 팔 끝에선 높이만큼만 띄우면 된다. 예전 고정 간격(93)은 팔 가운데서 블록 폭(98)보다 좁아 실제로 겹쳤다.
//  · 링 반지름을 팔마다 따로 정한다(한쪽 팔이 붐빈다고 다른 팔까지 커지지 않는다).
//  · 계산 뒤 공간 격자로 모든 블록 쌍을 검사해 겹침이 남으면(지터 등) 없앨 때까지 고친다 — "겹침 0"을 검사로 보장한다.
//  · 라벨 자리 찾기도 공간 격자로(예전엔 라벨마다 블록 전체를 훑어 O(라벨 × 블록)).

export const DEX_LAYOUT = {
  ROOT_GAP: 260,
  SECTOR_HALF: (Math.PI / 2) * 0.94,
  DIR_ANGLE: { N: -Math.PI / 2, S: Math.PI / 2 },
  COUSIN_FACTOR: 1.5,
  CLEAR: 14,                 // 블록 가장자리 사이 최소 여백(논리 px)
  EARLY_NAME_DEPTH: 3,
  JITTER_MIN_DEPTH: 3,
  LABEL_H: 20,
  LABEL_GAP: 4,
  CHIP_BELOW: 8,             // 블록 아래 가장자리에 걸쳐 그리는 전적 칩이 블록 밖으로 나오는 높이 — 라벨은 이만큼 더 비켜 둔다
};

export function estLabelW(name) { return (name.length + 4) * 7.3 + 34; } // "✦ 이름 ✦" + 화살표 아이콘·여백

// 두 블록 중심을 잇는 방향이 phi일 때, 가로 W × 세로 H 블록 두 개가 여백 C를 두고 안 겹치려면 필요한 중심 거리.
function boxNeed(phi, W, H, C) {
  const c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
  const a = c > 1e-6 ? (W + C) / c : Infinity, b = s > 1e-6 ? (H + C) / s : Infinity;
  return Math.min(a, b);
}

// 가중치 1의 등위 회귀(PAV): t에 가장 가까운(제곱 오차) 단조 비감소 수열.
function pav(t) {
  const sums = [], cnts = [];
  for (const v of t) {
    sums.push(v); cnts.push(1);
    while (sums.length > 1 && sums[sums.length - 2] / cnts[cnts.length - 2] > sums[sums.length - 1] / cnts[cnts.length - 1]) {
      const s = sums.pop(), c = cnts.pop();
      sums[sums.length - 1] += s; cnts[cnts.length - 1] += c;
    }
  }
  const out = [];
  for (let i = 0; i < sums.length; i++) { const m = sums[i] / cnts[i]; for (let k = 0; k < cnts[i]; k++) out.push(m); }
  return out;
}

// 링 하나 배치: list는 DFS 순서의 노드, targets는 각 노드가 가고 싶은 각도(부모 각도), needPx(i, theta)는 i-1과 i 사이 필요한 중심 거리.
// 반환: 각도 배열(순서·간격·부채꼴 경계를 모두 지키는, 목표에 가장 가까운 배치). 간격의 합이 부채꼴을 넘으면 null.
function solveRing(r, targets, gapsPx, lo, hi) {
  const n = targets.length;
  const off = new Array(n); off[0] = 0;
  for (let i = 1; i < n; i++) off[i] = off[i - 1] + 2 * Math.asin(Math.min(1, gapsPx[i] / (2 * r)));
  if (off[n - 1] > hi - lo + 1e-9) return null;
  const y = pav(targets.map((t, i) => t - off[i]));
  const yHi = hi - off[n - 1];
  return y.map((v, i) => Math.min(yHi, Math.max(lo, v)) + off[i]);
}

// arms: { N: root, S: root }. node = { key, depth, dir, children: [...], label }. 결과 좌표(it.x, it.y는 블록 좌상단, 중심 칩 기준 상대 좌표),
// it.r, it.angle, it.slotWidth, it.rJitter를 노드에 직접 채운다.
export function layoutDexTree(arms, { boxW, boxH, safeGap, earlySafeGap, jitterMax, maxRadialStep, lookaheadFrom = 3 }) {
  const P = DEX_LAYOUT;
  const all = [];
  const byArm = {};
  for (const dir of ["N", "S"]) {
    const root = arms[dir];
    if (!root) continue;
    // 깊이별 링(DFS 순서 = 부모 순서대로 자식 이어 붙이기)
    const rings = [[root]];
    for (;;) {
      const prev = rings[rings.length - 1];
      const next = [];
      for (const p of prev) for (const c of (p.children || [])) { c.parent = p; next.push(c); }
      if (!next.length) break;
      rings.push(next);
    }
    root.r = P.ROOT_GAP; root.angle = P.DIR_ANGLE[dir]; root.slotWidth = 2 * P.SECTOR_HALF; root.rJitter = 0; root.parent = null;
    byArm[dir] = { rings, stepBoost: new Map(), plan: null };
    for (const ring of rings) for (const it of ring) all.push(it);
  }
  const minCenterOf = (depth) => (depth <= P.EARLY_NAME_DEPTH ? earlySafeGap : safeGap);
  // 링 하나를 반지름 r 이상에서 배치할 수 있게 하는 가장 작은 반지름(fitR)과 그 배치를 구한다.
  const fitRing = (list, targets, minC, rMin, lo, hi) => {
    let theta = targets.slice(), r = rMin, angles = null;
    // 간격이 각도에 따라 달라지므로(블록 모양) 각도 추정 → 배치를 몇 번 반복해 수렴시킨다.
    for (let iter = 0; iter < 3; iter++) {
      const gaps = list.map((it, i) => {
        if (i === 0) return 0;
        const mid = (theta[i - 1] + theta[i]) / 2;
        const need = Math.max(minC, boxNeed(mid + Math.PI / 2, boxW, boxH, P.CLEAR));
        return it.parent === list[i - 1].parent ? need : need * P.COUSIN_FACTOR;
      });
      let rr = rMin, sol = solveRing(rr, targets, gaps, lo, hi);
      if (!sol) {
        let a = rr, b = rr * 1.5;
        while (!solveRing(b, targets, gaps, lo, hi)) { a = b; b *= 1.5; }
        for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (solveRing(m, targets, gaps, lo, hi)) b = m; else a = m; }
        rr = b; sol = solveRing(rr, targets, gaps, lo, hi);
      }
      r = rr; angles = sol; theta = sol;
    }
    return { r, angles };
  };
  // 한 팔 배치. 링 간격(step)은 깊어질수록 같거나 커져야 한다(규칙). 예전처럼 링마다 "지금 필요한 만큼만" 정하면(탐욕), 붐비는 링에서
  // 한 번 크게 뛴 간격이 그 뒤 모든 링에 그대로 물려져 트리가 불필요하게 커졌다. 그래서 두 번 계산한다 — 1차로 링마다 "혼자라면 필요한
  // 최소 반지름"(fitR)을 구하고, 2차에서 lookaheadFrom 이후 링은 "앞으로 올 모든 링의 요구를 같은 간격으로 나눠 맞출 때의 간격"을
  // 미리 써서 뒤늦은 급등을 없앤다(앞쪽 링은 탐욕 그대로 촘촘하게).
  const placeArm = (dir, fromDepthIdx) => {
    const arm = byArm[dir];
    const { rings, stepBoost } = arm;
    const lo = P.DIR_ANGLE[dir] - P.SECTOR_HALF, hi = P.DIR_ANGLE[dir] + P.SECTOR_HALF;
    const pass = (plan) => {
      let prevR = rings[0][0].r, prevStep = safeGap;
      for (let d = 1; d < fromDepthIdx; d++) { prevStep = Math.max(prevStep, rings[d][0].r - rings[d - 1][0].r); prevR = rings[d][0].r; }
      const fits = [];
      for (let d = Math.max(1, fromDepthIdx); d < rings.length; d++) {
        const list = rings[d];
        const depth = list[0].depth;
        const minC = minCenterOf(depth);
        const targets = list.map((it) => it.parent.angle);
        // 부모·자녀(링 사이) 방향으로 필요한 간격 — 이 링 노드들이 놓일 각도(부모 각도로 어림) 중 가장 까다로운 값
        let radialMin = safeGap;
        for (const t of targets) radialMin = Math.max(radialMin, boxNeed(t, boxW, boxH, P.CLEAR));
        radialMin *= stepBoost.get(d) || 1;
        // 이 링 "혼자"라면 필요한 최소 반지름(안쪽 링 위치와 무관) — 2차 간격 계획에 쓴다.
        if (!plan) fits[d] = { fitR: fitRing(list, targets, minC, rings[0][0].r + radialMin, lo, hi).r, radialMin };
        let rWant = prevR + Math.max(prevStep, radialMin);
        if (plan && plan[d]) rWant = Math.max(rWant, plan[d]);
        const placed = fitRing(list, targets, minC, rWant, lo, hi);
        const r = placed.r;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          it.r = r; it.angle = placed.angles[i]; it.rJitter = 0;
          const a = i > 0 ? (placed.angles[i] - placed.angles[i - 1]) : Infinity, b = i < list.length - 1 ? (placed.angles[i + 1] - placed.angles[i]) : Infinity;
          it.slotWidth = Math.min(a, b, 2 * P.SECTOR_HALF);
        }
        prevStep = Math.max(prevStep, r - prevR);
        prevR = r;
      }
      return fits;
    };
    const fits = pass(arm.plan && fromDepthIdx > 1 ? arm.plan : null);
    if (fromDepthIdx > 1) return;
    // 2차: 간격 계획 — r[d] = r[d-1] + max(직전 간격, 링 사이 최소 간격, 이 링의 fitR까지, (lookaheadFrom 이후) 앞으로의 fitR을 고르게 나눈 간격)
    const plan = [];
    let prevR = rings[0][0].r, prevStep = safeGap;
    for (let d = 1; d < rings.length; d++) {
      let step = Math.max(prevStep, fits[d].radialMin, fits[d].fitR - prevR);
      if (rings[d][0].depth >= lookaheadFrom) for (let j = d; j < rings.length; j++) step = Math.max(step, (fits[j].fitR - prevR) / (j - d + 1));
      step = Math.min(step, Math.max(maxRadialStep, fits[d].fitR - prevR, fits[d].radialMin));
      plan[d] = prevR + step;
      prevStep = step; prevR = plan[d];
    }
    arm.plan = plan;
    pass(plan);
  };
  const applyJitter = (dir) => {
    // 라벨 붙은 노드가 같은 링에서 이웃하면 번갈아 반지름을 어긋나게 — 단, 안쪽·바깥쪽 링과 겹치지 않는 여유 안에서만.
    const { rings } = byArm[dir];
    for (let d = 1; d < rings.length; d++) {
      const list = rings[d];
      if (list[0].depth < P.JITTER_MIN_DEPTH) continue;
      const inner = list[0].r - rings[d - 1][0].r;
      const outer = d + 1 < rings.length ? rings[d + 1][0].r - list[0].r : Infinity;
      let seq = 0;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.label) continue;
        const prevL = i > 0 && list[i - 1].label, nextL = i < list.length - 1 && list[i + 1].label;
        if (!prevL && !nextL) continue;
        seq++;
        const need = boxNeed(it.angle, boxW, boxH, P.CLEAR);
        const room = Math.max(0, Math.min(inner, outer) - need);
        const mag = Math.min(jitterMax, (jitterMax / 2) * seq, room);
        it.rJitter = (seq % 2 === 1 ? 1 : -1) * mag;
      }
    }
  };
  const setXY = () => { for (const it of all) { const r = it.r + (it.rJitter || 0); it.x = r * Math.cos(it.angle) - boxW / 2; it.y = r * Math.sin(it.angle) - boxH / 2; } };
  // 겹치는 블록 쌍(여백 CLEAR/2 포함)을 공간 격자로 찾는다.
  const findOverlaps = () => {
    const G = Math.max(boxW, boxH) * 2, grid = new Map(), hits = [];
    const m = P.CLEAR / 2;
    for (const it of all) {
      const gx0 = Math.floor(it.x / G), gx1 = Math.floor((it.x + boxW) / G), gy0 = Math.floor(it.y / G), gy1 = Math.floor((it.y + boxH) / G);
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const k = gx + "," + gy;
        let cell = grid.get(k);
        if (!cell) { cell = []; grid.set(k, cell); }
        for (const o of cell) {
          if (it.x < o.x + boxW + m && o.x < it.x + boxW + m && it.y < o.y + boxH + m && o.y < it.y + boxH + m) hits.push([it, o]);
        }
        cell.push(it);
      }
    }
    return hits;
  };
  for (const dir of Object.keys(byArm)) { placeArm(dir, 1); applyJitter(dir); }
  setXY();
  // 검사 → 수정 반복: 지터가 원인이면 지터를 없애고, 그래도 남으면 더 깊은 쪽 링의 간격을 넓혀 그 링부터 다시 배치한다.
  for (let guard = 0; guard < 24; guard++) {
    const hits = findOverlaps();
    if (!hits.length) break;
    let fixedJitter = false;
    for (const [a, b] of hits) { for (const it of [a, b]) if (it.rJitter) { it.rJitter = 0; fixedJitter = true; } }
    if (!fixedJitter) {
      const redo = new Map(); // dir -> 가장 얕은 재배치 링 index
      for (const [a, b] of hits) {
        const deeper = a.depth >= b.depth ? a : b;
        const { rings, stepBoost } = byArm[deeper.dir];
        const idx = rings.findIndex((ring) => ring[0].depth === deeper.depth);
        stepBoost.set(idx, (stepBoost.get(idx) || 1) * 1.2);
        redo.set(deeper.dir, Math.min(redo.has(deeper.dir) ? redo.get(deeper.dir) : Infinity, idx));
      }
      for (const [dir, idx] of redo) { placeArm(dir, idx); applyJitter(dir); }
    }
    setXY();
  }
  return { nodes: all, overlaps: findOverlaps().length };
}

// 라벨 자리 — 블록 위(기본) → 블록 아래 → 오른쪽 끝 맞춤 위/아래 → 한 줄씩 더 위/아래로. 블록·다른 라벨과 안 겹치는 첫 자리.
// labeled: [{ key, name, x, y }](x,y는 블록 좌상단). 결과: [{ key, name, left, top, w }].
export function placeDexLabels(labeled, blocks, { boxW, boxH }) {
  const P = DEX_LAYOUT;
  const G = 240, grid = new Map();
  const cellsOf = (l, t, w, h) => { const out = []; for (let gx = Math.floor(l / G); gx <= Math.floor((l + w) / G); gx++) for (let gy = Math.floor(t / G); gy <= Math.floor((t + h) / G); gy++) out.push(gx + "," + gy); return out; };
  const put = (o) => { for (const k of cellsOf(o.l, o.t, o.w, o.h)) { let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(o); } };
  for (const b of blocks) put({ l: b.x, t: b.y, w: boxW, h: boxH + P.CHIP_BELOW, block: b.key });
  const free = (l, t, w, h, selfKey) => {
    for (const k of cellsOf(l, t, w, h)) for (const o of (grid.get(k) || [])) {
      if (o.block === selfKey) continue;
      if (l < o.l + o.w + 2 && o.l < l + w + 2 && t < o.t + o.h + 2 && o.t < t + h + 2) return false;
    }
    return true;
  };
  const out = [];
  for (const g of labeled) {
    const w = estLabelW(g.name), h = P.LABEL_H;
    const upT = g.y - 30, dnT = g.y + boxH + P.CHIP_BELOW + 6;
    const leftA = g.x - 6, leftB = g.x + boxW + 6 - w;
    const cands = [[leftA, upT], [leftA, dnT], [leftB, upT], [leftB, dnT]];
    for (let k = 1; k <= 6; k++) { cands.push([leftA, upT - k * (h + P.LABEL_GAP)]); cands.push([leftA, dnT + k * (h + P.LABEL_GAP)]); }
    let pick = cands.find(([l, t]) => free(l, t, w, h, g.key));
    if (!pick) { // 그래도 없으면 예전 방식: 기본 자리에서 라벨끼리만 피해 한 줄씩 내린다
      let t = upT, guard = 0;
      while (guard++ < 60 && !free(leftA, t, w, h, g.key)) t += h + P.LABEL_GAP;
      pick = [leftA, t];
    }
    const o = { l: pick[0], t: pick[1], w, h };
    put(o);
    out.push({ key: g.key, name: g.name, left: pick[0], top: pick[1], w });
  }
  return out;
}

// (v0.5.6) 부모→자식 연결선 — 곧은 직선은 자식이 부모 각도에서 비껴 있을 때 같은 링의 이웃 블록을 가로질렀다(선 190여 개가 다른
// 블록을 관통). 회로 배선처럼 부모에서 바깥(반지름 방향)으로 나가 두 링 "사이의 빈 띠"에서 호를 따라 돈 뒤 자식으로 들어간다 —
// 링 사이 띠에는 블록이 없으므로 선이 블록을 지나갈 수 없다. 같은 부모의 형제 선은 그 호를 공유해 버스(bus)처럼 묶여 보인다.
// 반환: d(SVG path), pts(비행 애니메이션용 꺾은선 표본점). p·c는 블록 좌상단 좌표(x,y), (cx,cy)는 트리 중심.
export function dexEdgeGeometry(p, c, cx, cy, boxW, boxH) {
  const px = p.x + boxW / 2 - cx, py = p.y + boxH / 2 - cy, qx = c.x + boxW / 2 - cx, qy = c.y + boxH / 2 - cy;
  const pr = Math.hypot(px, py), qr = Math.hypot(qx, qy);
  const pa = Math.atan2(py, px), qa = Math.atan2(qy, qx);
  const rm = pr + (qr - pr) * 0.5;
  const f = (v) => v.toFixed(1);
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [ax, ay] = P(rm, pa), [bx, by] = P(rm, qa);
  let da = qa - pa;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const s0 = [px + cx, py + cy], s3 = [qx + cx, qy + cy];
  if (Math.abs(da) * rm < 1) {
    return { d: "M" + f(s0[0]) + " " + f(s0[1]) + "L" + f(s3[0]) + " " + f(s3[1]), pts: [s0, s3] };
  }
  const d = "M" + f(s0[0]) + " " + f(s0[1]) + "L" + f(ax) + " " + f(ay) + "A" + f(rm) + " " + f(rm) + " 0 0 " + (da > 0 ? 1 : 0) + " " + f(bx) + " " + f(by) + "L" + f(s3[0]) + " " + f(s3[1]);
  const pts = [s0];
  const n = Math.max(2, Math.min(24, Math.ceil(Math.abs(da) * rm / 120)));
  for (let i = 0; i <= n; i++) pts.push(P(rm, pa + (da * i) / n));
  pts.push(s3);
  return { d, pts };
}
