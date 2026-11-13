// (v0.7.5, 사용자 요청) OpenChess 전용 UI 아이콘 세트 — 예전 lucide 아이콘을 전부 대체한다.
//  "클로드 아이콘 같다(범용 선 아이콘)"는 지적에 따라, 마스터 대국 승자 왕관(app/analysis.jsx CrownIcon)과 같은 파셋(면 분할) 디자인으로 다시 그렸다.
//  규칙: CLAUDE.md "아이콘·디자인 요소 규칙" — 윤곽선 없이 채운 면, 빛은 왼쪽 위, 톤 단계, 가장 밝은 점 하나.
//
//  · 사용법은 lucide와 같다: <Crown size={14} color={...} fill={...} style={...} />. strokeWidth 등 선 굵기 속성은 무시한다.
//  · 색: 아이콘 전체를 color(기본 currentColor)로 칠한 뒤, 면마다 흰색/검정 반투명을 겹쳐 명암을 만든다. 그래서 어떤 글자색·배경에서도 같은 빛 방향으로 읽힌다.
//  · fill: 색을 주면 그 색이 바탕색이 된다(lucide에서 '채운 아이콘'이던 자리). "none"/"transparent"면 '빈 상태'(좋아요 안 누름·별 미획득)로 흐리게 그린다.
//  · 면의 명암은 모서리 바깥 방향(법선)과 빛(왼쪽 위)의 각도로 자동 계산한다(gem·plate·bar 도우미). 직접 톤을 지정할 수도 있다.
//  · 브랜드 로고(YouTube·Instagram)는 원형을 써야 해서 여기서 다루지 않는다(lucide 그대로).
import React from "react";

// ── 기하 ──
const r2 = (v) => Math.round(v * 100) / 100;
const pd = (pts) => "M" + pts.map((p) => r2(p[0]) + " " + r2(p[1])).join("L") + "Z";
const D2R = Math.PI / 180;
const cen = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;   // 빛이 오는 방향(왼쪽 위)
function toneOf(nx, ny) {
  const l = Math.hypot(nx, ny) || 1, d = (nx * LX + ny * LY) / l;
  return d > 0.6 ? "a" : d > 0.15 ? "a2" : d > -0.3 ? "b" : d > -0.7 ? "c" : "d";
}
function outN(p, q, c) {
  let nx = q[1] - p[1], ny = -(q[0] - p[0]);
  const mx = (p[0] + q[0]) / 2 - c[0], my = (p[1] + q[1]) / 2 - c[1];
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
/** 원(다각형 근사). a0: 시작 각(도, 화면 좌표: 0=오른쪽, 90=아래). */
const circ = (cx, cy, r, n = 16, a0 = -90) => Array.from({ length: n }, (_, i) => { const a = (a0 + (360 / n) * i) * D2R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const ell = (cx, cy, rx, ry, n = 16, a0 = -90) => Array.from({ length: n }, (_, i) => { const a = (a0 + (360 / n) * i) * D2R; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + ((a1 - a0) * i) / n) * D2R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
/** 둥근 사각형(시계 방향). */
function rr(x, y, w, h, r = 2, seg = 3) {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0.01) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const out = [], corner = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = (a0 + (90 * i) / seg) * D2R; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  corner(x + w - r, y + r, -90); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, 90); corner(x + r, y + r, 180);
  return out;
}
const star = (cx, cy, R, r, n = 5, a0 = -90) => Array.from({ length: n * 2 }, (_, i) => { const a = (a0 + (180 / n) * i) * D2R, rad = i % 2 ? r : R; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; });
function lineX(a, b) {
  const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  if (Math.abs(den) < 1e-9) return [b.p[0], b.p[1]];
  const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
  return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
}
/** 볼록 다각형을 거리 s만큼 안쪽으로. */
function inset(pts, s) {
  const c = cen(pts), n = pts.length;
  const lines = pts.map((p, i) => { const q = pts[(i + 1) % n]; let [nx, ny] = outN(p, q, c); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; return { p: [p[0] - nx * s, p[1] - ny * s], d: [q[0] - p[0], q[1] - p[1]] }; });
  return pts.map((_, i) => lineX(lines[(i - 1 + n) % n], lines[i]));
}

// ── 면 만들기 도우미(모두 {d, t}[]를 돌려준다. t: h 하이라이트 · a 밝음 · a2 조금 밝음 · b 바탕 · c 조금 어두움 · d 어두움 · e 가장 어두움/파인 자리) ──
/** 보석: 각 변과 중심을 잇는 삼각형 면. 변의 바깥 방향으로 명암. */
function gem(pts, c = cen(pts)) {
  return pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; const [nx, ny] = outN(p, q, c); return { d: pd([p, q, c]), t: toneOf(nx, ny) }; });
}
/** 판: 가장자리 경사면(변마다 명암) + 윗면(face 톤). 볼록 다각형용. */
function plate(pts, s = 1.5, face = "b") {
  const inn = inset(pts, s), c = cen(pts), n = pts.length, out = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; const [nx, ny] = outN(pts[i], pts[j], c); out.push({ d: pd([pts[i], pts[j], inn[j], inn[i]]), t: toneOf(nx, ny) }); }
  out.push({ d: pd(inn), t: face });
  return out;
}
/** 막대: 꺾은선을 따라 굵기 w. 축을 기준으로 두 면(각각 바깥 방향으로 명암). tip: 끝을 뾰족하게 늘이는 길이. closed: 고리. */
function bar(pts, w = 2.6, { closed = false, tipEnd = 0, tipStart = 0, tone } = {}) {
  const n = pts.length, hw = w / 2, segN = [], L = [], R = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const p = pts[i], q = pts[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; segN.push([-dy / l, dx / l]); }
  for (let i = 0; i < n; i++) {
    const a = closed ? segN[(i - 1 + segs) % segs] : segN[Math.max(0, i - 1)], b = closed ? segN[i % segs] : segN[Math.min(segs - 1, i)];
    let mx = a[0] + b[0], my = a[1] + b[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const k = Math.min(2.2, 1 / Math.max(0.35, mx * b[0] + my * b[1]));
    L.push([pts[i][0] + mx * hw * k, pts[i][1] + my * hw * k]); R.push([pts[i][0] - mx * hw * k, pts[i][1] - my * hw * k]);
  }
  const out = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n, [nx, ny] = segN[i];
    out.push({ d: pd([L[i], L[j], pts[j], pts[i]]), t: tone || toneOf(nx, ny) });
    out.push({ d: pd([pts[i], pts[j], R[j], R[i]]), t: tone || toneOf(-nx, -ny) });
  }
  const tip = (i, dirSign, len) => {
    const sN = segN[dirSign > 0 ? segs - 1 : 0], dx = sN[1] * dirSign, dy = -sN[0] * dirSign, T = [pts[i][0] + dx * len, pts[i][1] + dy * len];
    out.push({ d: pd([L[i], T, pts[i]]), t: tone || toneOf(sN[0] + dx, sN[1] + dy) }, { d: pd([pts[i], T, R[i]]), t: tone || toneOf(-sN[0] + dx, -sN[1] + dy) });
  };
  if (!closed && tipEnd) tip(n - 1, 1, tipEnd);
  if (!closed && tipStart) tip(0, -1, tipStart);
  return out;
}
const ring = (cx, cy, r, w = 2.4, n = 22) => bar(circ(cx, cy, r, n), w, { closed: true });
const arc = (cx, cy, r, a0, a1, w = 2.4, n = 12, o = {}) => bar(arcPts(cx, cy, r, a0, a1, n), w, o);
const disc = (cx, cy, r, n = 10) => gem(circ(cx, cy, r, n));
const tint = (fs, t) => fs.map((f) => ({ ...f, t }));
const SHADE = { h: "a", a: "a2", a2: "b", b: "c", c: "d", d: "e", e: "e" };
const shade = (fs) => fs.map((f) => ({ ...f, t: SHADE[f.t] || f.t }));
const hl = (x, y, s = 1) => ({ d: pd([[x - s, y], [x, y - s], [x + s * 0.6, y], [x, y + s * 0.6]]), t: "h" });
/** 화살촉: tip을 향한 삼각형(방향 dx,dy 단위 아님 허용). */
function head(tip, dx, dy, len = 6, half = 4.2) {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, bx = tip[0] - ux * len, by = tip[1] - uy * len;
  return gem([tip, [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]]);
}
/** 호 화살표: 호 끝(end) 또는 시작(start)에 접선 방향 화살촉. 각도는 a0→a1 진행. */
function arcArrow(cx, cy, r, a0, a1, w = 2.4, at = "end") {
  const pts = arcPts(cx, cy, r, a0, a1, 14), out = bar(at === "end" ? pts.slice(0, -2) : pts.slice(2), w);
  const sgn = a1 > a0 ? 1 : -1;
  if (at === "end") { const a = a1 * D2R; out.push(...head([cx + r * Math.cos(a), cy + r * Math.sin(a)], -Math.sin(a) * sgn, Math.cos(a) * sgn, 5.6, 4)); }
  else { const a = a0 * D2R; out.push(...head([cx + r * Math.cos(a), cy + r * Math.sin(a)], Math.sin(a) * sgn, -Math.cos(a) * sgn, 5.6, 4)); }
  return out;
}
function person(cx, top, s = 1) {
  const headR = 4 * s, hy = top + headR;
  const body = [...arcPts(cx, hy + headR + 9.2 * s, 7.6 * s, 180, 360, 10)].map(([x, y]) => [x, Math.max(y, hy + headR + 1.6 * s)]);
  return [...disc(cx, hy, headR, 12), ...gem([...body.filter((_, i) => i > 0 && i < body.length - 1), [cx + 7.6 * s, hy + headR + 9.2 * s], [cx - 7.6 * s, hy + headR + 9.2 * s]])];
}
function crescent(cx, cy, r, bx, by, br, n = 14) {
  // 큰 원(cx,cy,r)에서 원(bx,by,br)을 베어 낸 초승달 — 두 원의 교점 사이를 바깥 호·안쪽 호로 나눠 띠 면을 만든다
  const d = Math.hypot(bx - cx, by - cy), a = (r * r - br * br + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a));
  const ex = cx + (a * (bx - cx)) / d, ey = cy + (a * (by - cy)) / d;
  const P1 = [ex + (h * (by - cy)) / d, ey - (h * (bx - cx)) / d], P2 = [ex - (h * (by - cy)) / d, ey + (h * (bx - cx)) / d];
  const ang = (p, ox, oy) => Math.atan2(p[1] - oy, p[0] - ox);
  let o0 = ang(P1, cx, cy), o1 = ang(P2, cx, cy); const dirOut = ang([bx, by], cx, cy);
  // 바깥 호는 베인 원의 반대편을 지난다
  const norm = (x) => { while (x < 0) x += 2 * Math.PI; return x % (2 * Math.PI); };
  let span = norm(o1 - o0); const mid = o0 + span / 2;
  if (Math.cos(mid - dirOut) > 0) { span = span - 2 * Math.PI; }
  let i0 = ang(P1, bx, by), i1 = ang(P2, bx, by), ispan = norm(i1 - i0); const imid = i0 + ispan / 2;
  if (Math.cos(imid - Math.atan2(cy - by, cx - bx)) < 0) ispan = ispan - 2 * Math.PI;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const O0 = [cx + r * Math.cos(o0 + span * t0), cy + r * Math.sin(o0 + span * t0)], O1 = [cx + r * Math.cos(o0 + span * t1), cy + r * Math.sin(o0 + span * t1)];
    const I0 = [bx + br * Math.cos(i0 + ispan * t0), by + br * Math.sin(i0 + ispan * t0)], I1 = [bx + br * Math.cos(i0 + ispan * t1), by + br * Math.sin(i0 + ispan * t1)];
    const M = [(O0[0] + O1[0]) / 2 - cx, (O0[1] + O1[1]) / 2 - cy];
    out.push({ d: pd([O0, O1, I1, I0]), t: toneOf(M[0], M[1]) });
  }
  return out;
}
function gearPts(cx, cy, R, r, teeth = 8) {
  const out = [], step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = -90 + i * step;
    for (const [da, rad] of [[-step * 0.32, r], [-step * 0.18, R], [step * 0.18, R], [step * 0.32, r]]) out.push([cx + rad * Math.cos((a + da) * D2R), cy + rad * Math.sin((a + da) * D2R)]);
  }
  return out;
}

// ── 그리기 ──
const OVER = { h: ["#FFFFFF", 0.72], a: ["#FFFFFF", 0.34], a2: ["#FFFFFF", 0.16], c: ["#000000", 0.16], d: ["#000000", 0.3], e: ["#000000", 0.46] };
const SEAM = 0.32;   // 맞닿은 면 사이의 실틈(안티앨리어싱)을 바탕색으로 메우는 폭 — 윤곽선이 아니라 이음매 메움
function makeIcon(name, build) {
  let facets = null;
  const Icon = React.forwardRef(function OcIcon({ size = 24, color = "currentColor", fill, style, className, strokeWidth, absoluteStrokeWidth, ...rest }, ref) {
    if (!facets) facets = build();
    const empty = fill === "none" || fill === "transparent";
    const base = fill && !empty ? fill : color;
    const labelled = rest["aria-label"] || rest["aria-labelledby"];
    return (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden={labelled ? undefined : true} role={labelled ? "img" : undefined}
        style={empty ? { ...style, opacity: (style && style.opacity != null ? style.opacity : 1) * 0.38 } : style} {...rest}>
        <g fill={base} stroke={base} strokeWidth={SEAM} strokeLinejoin="round">{facets.map((f, i) => <path key={i} d={f.d} />)}</g>
        {facets.map((f, i) => { const o = OVER[f.t]; return o ? <path key={"o" + i} d={f.d} fill={o[0]} fillOpacity={o[1]} /> : null; })}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

// ── 아이콘 정의 ──
const DEF = {
  // 기본 기호
  X: () => [...bar([[6, 6], [18, 18]], 2.9), ...bar([[18, 6], [13.3, 10.7]], 2.9), ...bar([[10.7, 13.3], [6, 18]], 2.9)],
  Check: () => bar([[4.5, 12.5], [9.5, 17.5], [19.5, 6.5]], 3.1),
  ChevronRight: () => bar([[9, 5], [16, 12], [9, 19]], 3),
  ChevronLeft: () => bar([[15, 5], [8, 12], [15, 19]], 3),
  ChevronUp: () => bar([[5, 15.5], [12, 8.5], [19, 15.5]], 3),
  ChevronDown: () => bar([[5, 8.5], [12, 15.5], [19, 8.5]], 3),
  ChevronsRight: () => [...bar([[5, 6], [11, 12], [5, 18]], 2.7), ...bar([[12.5, 6], [18.5, 12], [12.5, 18]], 2.7)],
  ChevronsLeft: () => [...bar([[19, 6], [13, 12], [19, 18]], 2.7), ...bar([[11.5, 6], [5.5, 12], [11.5, 18]], 2.7)],
  ChevronsUp: () => [...bar([[6, 12], [12, 6], [18, 12]], 2.7), ...bar([[6, 19], [12, 13], [18, 19]], 2.7)],
  Plus: () => [...bar([[12, 4.5], [12, 19.5]], 3.1), ...bar([[4.5, 12], [10.4, 12]], 3.1), ...bar([[13.6, 12], [19.5, 12]], 3.1)],
  Minus: () => bar([[4.5, 12], [19.5, 12]], 3.1),
  ArrowLeft: () => [...bar([[20, 12], [10, 12]], 3), ...head([3.5, 12], -1, 0, 7.5, 6)],
  ArrowRight: () => [...bar([[4, 12], [14, 12]], 3), ...head([20.5, 12], 1, 0, 7.5, 6)],
  ArrowUpDown: () => [...bar([[8, 20.5], [8, 9]], 2.6), ...head([8, 3], 0, -1, 6.5, 4.6), ...bar([[16, 3.5], [16, 15]], 2.6), ...head([16, 21], 0, 1, 6.5, 4.6)],
  ArrowRightLeft: () => [...bar([[3.5, 8], [15, 8]], 2.6), ...head([21, 8], 1, 0, 6.5, 4.4), ...bar([[20.5, 16], [9, 16]], 2.6), ...head([3, 16], -1, 0, 6.5, 4.4)],
  MoveDiagonal: () => [...bar([[8.2, 15.8], [15.8, 8.2]], 2.8), ...head([20, 4], 1, -1, 7, 4.6), ...head([4, 20], -1, 1, 7, 4.6)],
  Maximize2: () => [...bar([[16.4, 7.6], [13, 11]], 2.5), ...head([21, 3], 1, -1, 7.5, 4.8), ...bar([[7.6, 16.4], [11, 13]], 2.5), ...head([3, 21], -1, 1, 7.5, 4.8)],
  Minimize2: () => [...bar([[21, 3], [17.6, 6.4]], 2.5), ...head([13.5, 10.5], -1, 1, 7, 4.6), ...bar([[3, 21], [6.4, 17.6]], 2.5), ...head([10.5, 13.5], 1, -1, 7, 4.6)],
  ExternalLink: () => [...bar([[11, 5], [5, 5], [5, 19], [19, 19], [19, 13]], 2.4), ...bar([[11, 13], [16.5, 7.5]], 2.4), ...head([21, 3], 1, -1, 7.2, 4.6)],
  MoreVertical: () => [...disc(12, 5, 2.3, 8), ...disc(12, 12, 2.3, 8), ...disc(12, 19, 2.3, 8)],
  Search: () => [...ring(10.5, 10.5, 6.2, 2.9), ...bar([[15.3, 15.3], [20.6, 20.6]], 3.4), hl(7.8, 7, 1)],
  Filter: () => gem([[3, 4], [21, 4], [14, 12.5], [14, 19], [10, 21], [10, 12.5]], [12, 9]),
  Circle: () => plate(circ(12, 12, 9, 20), 1.7),
  Square: () => plate(rr(4, 4, 16, 16, 2.6), 1.7),
  Ban: () => [...ring(12, 12, 8.4, 2.7), ...bar([[6.2, 6.2], [17.8, 17.8]], 2.7)],
  Info: () => [...plate(circ(12, 12, 9.6, 20), 1.7), ...bar([[12, 11], [12, 17]], 2.2, { tone: "e" }), ...tint(disc(12, 7.7, 1.35, 8), "e")],
  HelpCircle: () => [...plate(circ(12, 12, 9.6, 20), 1.7), ...bar([[9.3, 9.6], [9.9, 7.8], [12, 7], [14.1, 7.8], [14.7, 9.6], [13.9, 11.2], [12, 12.4], [12, 14.2]], 2, { tone: "e" }), ...tint(disc(12, 17, 1.3, 8), "e")],
  // 회전·반복
  RotateCcw: () => arcArrow(12, 12, 7.6, 160, -140, 2.6, "start"),
  RotateCw: () => arcArrow(12, 12, 7.6, 20, 320, 2.6, "end"),
  RefreshCw: () => [...arcArrow(12, 12, 7.8, 200, 330, 2.5, "end"), ...arcArrow(12, 12, 7.8, 20, 150, 2.5, "end")],
  Repeat2: () => [...bar([[4, 12], [4, 8], [16, 8]], 2.5), ...head([21, 8], 1, 0, 6, 4), ...bar([[20, 12], [20, 16], [8, 16]], 2.5), ...head([3, 16], -1, 0, 6, 4)],
  Undo2: () => [...head([2.8, 9], -1, 0, 6.5, 4.6), ...bar([[9, 9], [14.5, 9], ...arcPts(14.5, 14.5, 5.5, -90, 90, 8).slice(1), [11, 20]], 2.5)],
  Reply: () => [...head([2.8, 10], -1, 0, 6.5, 4.8), ...bar([[9, 10], [14, 10], [17.6, 11.6], [19.6, 15], [20, 19.5]], 2.5)],
  Shuffle: () => [...bar([[3, 7], [7, 7], [15, 17], [16, 17]], 2.4), ...head([21.5, 17], 1, 0, 6, 4), ...bar([[3, 17], [7, 17], [9.6, 13.8]], 2.4), ...bar([[12.4, 10.2], [15, 7], [16, 7]], 2.4), ...head([21.5, 7], 1, 0, 6, 4)],
  Route: () => [...bar([[8.5, 18], [13.5, 18], [16, 15.5], [13.5, 12.5], [10.5, 12.5], [8, 9.5], [10.5, 6], [15.5, 6]], 2.2), ...disc(6, 18, 2.7, 10), ...disc(18, 6, 2.7, 10)],
  // 사람
  User: () => [...person(12, 3, 1), hl(10.6, 5.6, 0.9)],
  Users: () => [...shade(person(16.6, 4, 0.82)), ...person(9.5, 3, 0.95)],
  UserPlus: () => [...person(9, 3, 0.95), ...bar([[19, 7.5], [19, 14.5]], 2.4), ...bar([[15.5, 11], [17.8, 11]], 2.4), ...bar([[20.2, 11], [22.5, 11]], 2.4)],
  UserCheck: () => [...person(9, 3, 0.95), ...bar([[15.5, 11], [17.8, 13.4], [22.3, 8.6]], 2.4)],
  // 잠금·보안
  Lock: () => [...arc(12, 10.6, 4.4, 180, 360, 2.6, 10), ...plate(rr(4.5, 10.5, 15, 11, 2.2), 1.6), ...tint(disc(12, 14.8, 1.6, 8), "e"), ...bar([[12, 15.4], [12, 18.2]], 1.5, { tone: "e" })],
  Shield: () => [...gem([[12, 2.5], [19.5, 5.5], [19.5, 11.5], [17.5, 16.5], [12, 21.5], [6.5, 16.5], [4.5, 11.5], [4.5, 5.5]], [12, 10.5]), hl(8.5, 7.5, 1.2)],
  ShieldAlert: () => [...gem([[12, 2.5], [19.5, 5.5], [19.5, 11.5], [17.5, 16.5], [12, 21.5], [6.5, 16.5], [4.5, 11.5], [4.5, 5.5]], [12, 10.5]), ...bar([[12, 7.2], [12, 12.6]], 2.2, { tone: "e" }), ...tint(disc(12, 15.8, 1.3, 8), "e")],
  // 왕관·상·보석
  Crown: () => [
    { d: "M3.4 7.6 8.5 12 7.2 18.2H4.5Z", t: "a2" }, { d: "M8.5 12 12 4.6V18.2H7.2Z", t: "a" }, { d: "M12 4.6 15.5 12 16.8 18.2H12Z", t: "c" }, { d: "M15.5 12 20.6 7.6 19.5 18.2H16.8Z", t: "d" },
    { d: "M4.6 19.1H19.4L18.7 21.6H5.3Z", t: "e" }, { d: "M12 12.1 13.5 14.3 12 16.5 10.5 14.3Z", t: "h" },
    ...tint(disc(3.4, 7.2, 1.35, 6), "a"), ...tint(disc(12, 4.1, 1.45, 6), "a"), ...tint(disc(20.6, 7.2, 1.35, 6), "a"),
  ],
  Trophy: () => [
    ...arc(6.8, 7.4, 3, 90, 270, 2, 8), ...arc(17.2, 7.4, 3, -90, 90, 2, 8),
    ...gem([[6.5, 3.5], [17.5, 3.5], [17, 9.5], [15, 12.8], [12, 14], [9, 12.8], [7, 9.5]], [12, 8]),
    ...bar([[12, 13.8], [12, 17.6]], 2.6), ...plate(rr(6.8, 17.4, 10.4, 4, 1.1), 1.1), hl(9.4, 6.4, 1.3),
  ],
  Medal: () => [...shade(gem([[6.5, 2.5], [10.8, 2.5], [13, 9.5], [9.4, 10.5]])), ...gem([[17.5, 2.5], [13.2, 2.5], [11, 9.5], [14.6, 10.5]]), ...plate(circ(12, 15.4, 6.3, 16), 1.5), ...tint(gem(star(12, 15.6, 3.2, 1.4)), "a")],
  Gem: () => [
    { d: pd([[7, 4], [12, 4], [9.5, 9]]), t: "a" }, { d: pd([[12, 4], [17, 4], [14.5, 9]]), t: "a2" }, { d: pd([[3, 9], [7, 4], [9.5, 9]]), t: "a" }, { d: pd([[17, 4], [21, 9], [14.5, 9]]), t: "c" },
    { d: pd([[9.5, 9], [12, 4], [14.5, 9]]), t: "h" }, { d: pd([[3, 9], [9.5, 9], [12, 21]]), t: "a2" }, { d: pd([[9.5, 9], [14.5, 9], [12, 21]]), t: "b" }, { d: pd([[14.5, 9], [21, 9], [12, 21]]), t: "d" },
  ],
  Star: () => [...gem(star(12, 12.8, 10.2, 4.3)), hl(10.3, 9.4, 0.9)],
  Sparkles: () => [...gem(star(9.5, 13.5, 8, 2.2, 4)), ...gem(star(18.5, 5.5, 3.8, 1.1, 4)), ...gem(star(19, 18.2, 2.8, 0.85, 4))],
  Heart: () => {
    const pts = Array.from({ length: 22 }, (_, i) => { const t = (i / 22) * Math.PI * 2; return [12 + 0.62 * 16 * Math.pow(Math.sin(t), 3), 11.4 - 0.62 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
    return [...gem(pts, [12, 12]), hl(7.6, 8.2, 1.2)];
  },
  Flame: () => [...gem([[12, 2], [15.8, 7], [18.6, 12.8], [17.4, 18.2], [12, 21.6], [6.6, 18.2], [5.4, 13.4], [7.8, 9], [9.6, 12], [10.4, 6.4]], [12, 15]), ...tint(gem([[12, 10.8], [14.8, 15], [14.2, 18.6], [12, 19.9], [9.8, 18.6], [9.3, 15.6]], [12, 16.5]), "a")],
  Zap: () => [{ d: pd([[13.5, 2], [4, 14], [11, 14], [12.6, 9.6]]), t: "a" }, { d: pd([[12.6, 9.6], [20, 9.6], [10, 22], [11, 14]]), t: "c" }, { d: pd([[13.5, 2], [12.6, 9.6], [20, 9.6]]), t: "a2" }, hl(9.2, 11.8, 0.9)],
  Coins: () => [...plate(ell(9, 16.5, 6.5, 3.2, 14), 1.1), ...plate(ell(9, 12.6, 6.5, 3.2, 14), 1.1), ...plate(ell(9, 8.7, 6.5, 3.2, 14), 1.1, "a2"), ...plate(circ(17, 14.5, 5, 14), 1.4)],
  HandCoins: () => [...bar([[2, 19], [8, 19], [13, 17.2], [19.5, 13.5]], 3.2), ...bar([[2, 14.6], [6.5, 14.6], [10.5, 15.6]], 2.6), ...plate(circ(16, 6.5, 3.8, 12), 1.2), ...plate(circ(9.3, 9, 2.9, 10), 1)],
  // 대국·체스
  Sword: () => [...bar([[7.5, 16.5], [18.6, 5.4]], 3, { tipEnd: 2.8 }), ...bar([[4.3, 13], [11, 19.7]], 2.4), ...bar([[6, 18], [3.3, 20.7]], 2.2), ...disc(2.9, 21.1, 1.4, 6)],
  Swords: () => [
    ...bar([[7, 16], [18.5, 4.5]], 2.6, { tipEnd: 2.6 }), ...bar([[4.2, 12.8], [10.2, 18.8]], 2.2), ...bar([[5.6, 17.4], [3.2, 19.8]], 2), ...disc(2.8, 20.2, 1.3, 6),
    ...bar([[17, 16], [5.5, 4.5]], 2.6, { tipEnd: 2.6 }), ...bar([[19.8, 12.8], [13.8, 18.8]], 2.2), ...bar([[18.4, 17.4], [20.8, 19.8]], 2), ...disc(21.2, 20.2, 1.3, 6),
  ],
  Castle: () => [
    ...plate(rr(3, 9, 6, 12.5, 0.4), 1.2), ...plate(rr(15, 9, 6, 12.5, 0.4), 1.2), ...plate(rr(8.6, 12, 6.8, 9.5, 0.3), 1.1, "c"),
    ...[3, 5.4, 7.2].map((x) => plate(rr(x, 6.6, 1.8, 2.6, 0.2), 0.5)).flat(), ...[15, 17.4, 19.2].map((x) => plate(rr(x, 6.6, 1.8, 2.6, 0.2), 0.5)).flat(),
    { d: "M10.4 21.5V18.3A1.6 1.6 0 0 1 13.6 18.3V21.5Z", t: "e" },
  ],
  Target: () => [...ring(12, 12, 9, 2.4), ...ring(12, 12, 5, 2.4), ...disc(12, 12, 2, 8)],
  Crosshair: () => [...ring(12, 12, 7.2, 2.4), ...bar([[12, 1.8], [12, 6.4]], 2.2), ...bar([[12, 17.6], [12, 22.2]], 2.2), ...bar([[1.8, 12], [6.4, 12]], 2.2), ...bar([[17.6, 12], [22.2, 12]], 2.2), ...disc(12, 12, 1.7, 6)],
  Dices: () => [
    ...plate(rr(2.5, 8.5, 11.5, 11.5, 2), 1.3), ...tint(disc(5.7, 11.8, 1.15, 6), "e"), ...tint(disc(10.8, 16.8, 1.15, 6), "e"), ...tint(disc(8.25, 14.3, 1.15, 6), "e"),
    ...shade(plate([[11.2, 4.4], [19.6, 2.6], [21.4, 11], [13, 12.8]], 1.2)), ...tint(disc(16.3, 7.7, 1.15, 6), "e"),
  ],
  Puzzle: () => [...plate(rr(4, 7.4, 13, 13, 1.6), 1.5), ...disc(10.5, 6, 3.3, 10), ...disc(18.4, 13.9, 3.3, 10), hl(6.6, 10, 1)],
  Scale: () => [
    ...bar([[12, 3.5], [12, 19.6]], 2.2), ...plate(rr(7, 19.4, 10, 2.6, 1), 0.8), ...bar([[3.6, 7], [20.4, 7]], 1.9),
    ...bar([[5, 7.6], [3, 13.6]], 1), ...bar([[5, 7.6], [7, 13.6]], 1), ...bar([[19, 7.6], [17, 13.6]], 1), ...bar([[19, 7.6], [21, 13.6]], 1),
    ...gem([[1.6, 13.6], [8.4, 13.6], [7.2, 16.2], [5, 17], [2.8, 16.2]]), ...gem([[15.6, 13.6], [22.4, 13.6], [21.2, 16.2], [19, 17], [16.8, 16.2]]), ...disc(12, 3.4, 1.4, 6),
  ],
  GitFork: () => [...bar([[6, 7.4], [6, 9.6], [12, 13], [12, 16.6]], 2.2), ...bar([[18, 7.4], [18, 9.6], [12, 13]], 2.2), ...disc(6, 5, 2.6, 10), ...disc(18, 5, 2.6, 10), ...disc(12, 19, 2.6, 10)],
  Pin: () => [...bar([[12, 12.5], [12, 21.5]], 1.7, { tipEnd: 1 }), ...gem([[8.8, 2.8], [15.2, 2.8], [14.2, 7.6], [17.4, 12.6], [6.6, 12.6], [9.8, 7.6]], [12, 8.4])],
  PinOff: () => [...bar([[12, 12.5], [12, 21.5]], 1.7, { tipEnd: 1 }), ...gem([[8.8, 2.8], [15.2, 2.8], [14.2, 7.6], [17.4, 12.6], [6.6, 12.6], [9.8, 7.6]], [12, 8.4]), ...bar([[3.5, 3.5], [20.5, 20.5]], 2.4)],
  Flag: () => [...bar([[5, 3], [5, 21.5]], 2.1), ...gem([[6, 4], [11.5, 3], [15, 5], [20, 4], [20, 13], [15, 14], [11.5, 12], [6, 13]], [13, 8.5])],
  Shell: () => {
    const pts = Array.from({ length: 26 }, (_, i) => { const t = i / 25, a = (-90 + t * 600) * D2R, r = 9 - t * 7; return [12.5 + r * Math.cos(a), 12 + r * Math.sin(a)]; });
    return bar(pts, 2.6);
  },
  // 책·문서
  BookOpen: () => [...plate([[2, 5], [11.2, 6.4], [11.2, 20], [2, 18.6]], 1.3, "a2"), ...plate([[12.8, 6.4], [22, 5], [22, 18.6], [12.8, 20]], 1.3, "c")],
  Book: () => [...plate(rr(5, 3, 14, 16.4, 1.6), 1.4), ...bar([[6.6, 20.4], [18.6, 20.4]], 2, { tone: "a" }), ...bar([[7.6, 4.4], [7.6, 18]], 1.4, { tone: "d" })],
  BookMarked: () => [...plate(rr(5, 3, 14, 16.4, 1.6), 1.4), ...bar([[6.6, 20.4], [18.6, 20.4]], 2, { tone: "a" }), ...tint(gem([[12.4, 3], [16.2, 3], [16.2, 10.6], [14.3, 9], [12.4, 10.6]]), "h")],
  Bookmark: () => [{ d: pd([[6, 3], [12, 3], [12, 16.2], [6, 21]]), t: "a2" }, { d: pd([[12, 3], [18, 3], [18, 21], [12, 16.2]]), t: "c" }, hl(8.4, 5.6, 1)],
  Library: () => [...plate(rr(3, 4, 3.8, 17, 0.8), 0.9), ...plate(rr(8.4, 6.2, 3.8, 14.8, 0.8), 0.9, "c"), ...plate([[13.6, 7.4], [17, 6.4], [21.2, 20], [17.8, 21]], 0.9)],
  FileText: () => [...plate([[5, 2.5], [14, 2.5], [19, 7.5], [19, 21.5], [5, 21.5]], 1.3), ...tint(gem([[14, 2.5], [19, 7.5], [14, 7.5]]), "a"), ...bar([[8, 12], [16, 12]], 1.4, { tone: "e" }), ...bar([[8, 15.5], [16, 15.5]], 1.4, { tone: "e" }), ...bar([[8, 9], [11, 9]], 1.4, { tone: "e" })],
  FolderOpen: () => [...shade(plate([[2.5, 4.5], [9, 4.5], [11, 6.8], [19, 6.8], [19, 10.2], [2.5, 10.2]], 1)), ...plate([[2.5, 20], [5.6, 10], [22, 10], [19, 20]], 1.3)],
  ClipboardPaste: () => [...plate(rr(4, 4, 13, 17.5, 2), 1.4), ...tint(plate(rr(7.5, 2, 6, 3.8, 1), 0.8), "a"), ...bar([[21.5, 14], [15, 14]], 2.2), ...head([10.5, 14], -1, 0, 5.4, 3.8)],
  Copy: () => [...shade(plate(rr(3, 3, 12, 12, 2), 1.4)), ...plate(rr(9, 9, 12, 12, 2), 1.4)],
  Save: () => [...plate(rr(3, 3, 18, 18, 2.2), 1.5), ...tint(plate(rr(7, 13, 10, 6.6, 0.8), 0.8), "a"), ...tint(plate(rr(8, 3.8, 7.5, 4.6, 0.6), 0.6), "d")],
  Pencil: () => [...bar([[6.6, 17.4], [16.8, 7.2]], 4.2), ...gem([[3.2, 20.8], [4.1, 15.9], [8.1, 19.9]]), ...tint(bar([[17.2, 6.8], [19.6, 4.4]], 4.2), "d")],
  Trash2: () => [...plate(rr(9, 2.6, 6, 2.8, 1), 0.7), ...bar([[3.5, 6.4], [20.5, 6.4]], 2.4), ...plate([[5.4, 8.4], [18.6, 8.4], [17.3, 21.2], [6.7, 21.2]], 1.4), ...bar([[10, 11.5], [10, 18.2]], 1.3, { tone: "e" }), ...bar([[14, 11.5], [14, 18.2]], 1.3, { tone: "e" })],
  Image: () => [...plate(rr(3, 4, 18, 16, 2), 1.4, "c"), ...gem([[5.2, 18], [10.8, 10.2], [16, 18]]), ...gem([[12.2, 18], [16, 13.4], [18.8, 18]]), ...tint(disc(16.4, 8.6, 1.8, 8), "h")],
  Camera: () => [...gem([[8, 7.5], [9.6, 4], [14.4, 4], [16, 7.5]]), ...plate(rr(2.5, 7, 19, 13.5, 2.2), 1.5), ...ring(12, 13.6, 3.8, 2.2), ...tint(disc(12, 13.6, 1.6, 8), "e")],
  ListChecks: () => [...bar([[3, 6], [5, 8], [8.6, 4.4]], 1.9), ...bar([[3, 12.4], [5, 14.4], [8.6, 10.8]], 1.9), ...bar([[11.5, 6], [21, 6]], 2.2), ...bar([[11.5, 12.4], [21, 12.4]], 2.2), ...bar([[3, 18.8], [21, 18.8]], 2.2)],
  List: () => [...disc(4.5, 6, 1.6, 6), ...disc(4.5, 12, 1.6, 6), ...disc(4.5, 18, 1.6, 6), ...bar([[8.6, 6], [20.6, 6]], 2.3), ...bar([[8.6, 12], [20.6, 12]], 2.3), ...bar([[8.6, 18], [20.6, 18]], 2.3)],
  Rows3: () => [...plate(rr(3, 3, 18, 18, 2), 1.4), ...bar([[5, 9], [19, 9]], 1.4, { tone: "e" }), ...bar([[5, 15], [19, 15]], 1.4, { tone: "e" })],
  PanelBottom: () => [...plate(rr(3, 3, 18, 18, 2), 1.4), ...bar([[4.6, 15.4], [19.4, 15.4]], 1.5, { tone: "e" }), ...tint(gem([[5.4, 16.4], [18.6, 16.4], [18.6, 19.6], [5.4, 19.6]]), "a")],
  Grid3x3: () => [3, 9.5, 16].flatMap((x) => [3, 9.5, 16].flatMap((y) => plate(rr(x, y, 5, 5, 0.9), 0.9))),
  ScanLine: () => [...bar([[3, 8], [3, 3], [8, 3]], 2.4), ...bar([[16, 3], [21, 3], [21, 8]], 2.4), ...bar([[21, 16], [21, 21], [16, 21]], 2.4), ...bar([[8, 21], [3, 21], [3, 16]], 2.4), ...bar([[6.5, 12], [17.5, 12]], 2.2, { tone: "a" })],
  SlidersHorizontal: () => [...bar([[3, 6], [21, 6]], 1.7, { tone: "d" }), ...bar([[3, 12], [21, 12]], 1.7, { tone: "d" }), ...bar([[3, 18], [21, 18]], 1.7, { tone: "d" }), ...plate(rr(12.6, 3.4, 3.6, 5.2, 1), 0.8), ...plate(rr(6.4, 9.4, 3.6, 5.2, 1), 0.8), ...plate(rr(15.2, 15.4, 3.6, 5.2, 1), 0.8)],
  Languages: () => [...plate(rr(2.5, 3, 11, 11, 2), 1.3), ...bar([[5.4, 11.4], [8, 5.8], [10.6, 11.4]], 1.5, { tone: "e" }), ...shade(plate(rr(10.5, 10, 11, 11, 2), 1.3)), ...bar([[13, 13.4], [19, 13.4]], 1.4, { tone: "e" }), ...bar([[16, 12.2], [16, 13.4], [13.8, 18.6]], 1.3, { tone: "e" }), ...bar([[16, 15], [18.8, 18.6]], 1.3, { tone: "e" })],
  // 소통
  MessageCircle: () => [...gem([[5.6, 15.6], [3, 21], [9.4, 18.6]]), ...plate(circ(12, 11.2, 8.6, 18), 1.6), hl(8.2, 7.4, 1.1)],
  MessageSquare: () => [...gem([[6, 16], [6, 21.4], [11.4, 16]]), ...plate(rr(3, 4, 18, 13, 2.5), 1.6), hl(6.6, 7.2, 1.1)],
  Send: () => [{ d: pd([[2.5, 11], [21.5, 2.5], [11, 13.2]]), t: "a" }, { d: pd([[11, 13.2], [21.5, 2.5], [14.2, 21.5]]), t: "c" }, { d: pd([[11, 13.2], [14.2, 21.5], [11.4, 17.6]]), t: "e" }],
  Mail: () => [...plate(rr(2.5, 5, 19, 14, 2), 1.4), ...tint(gem([[3.6, 6.2], [20.4, 6.2], [12, 13.2]]), "a")],
  Share2: () => [...bar([[8.4, 10.8], [15.6, 6.2]], 2), ...bar([[8.4, 13.2], [15.6, 17.8]], 2), ...disc(18, 5, 3, 10), ...disc(6, 12, 3, 10), ...disc(18, 19, 3, 10)],
  ThumbsUp: () => [...plate(rr(2.4, 10.4, 4.2, 10.8, 1), 0.9, "c"), ...gem([[8.2, 10.4], [11.2, 3], [13.8, 3.6], [13.8, 10.4]]), ...plate(rr(7.6, 9.6, 13.6, 11.6, 2.2), 1.4), ...bar([[14, 13.4], [20.4, 13.4]], 1, { tone: "c" }), ...bar([[14, 16.8], [20.4, 16.8]], 1, { tone: "c" })],
  ThumbsDown: () => [...plate(rr(2.4, 2.8, 4.2, 10.8, 1), 0.9, "c"), ...gem([[8.2, 13.6], [11.2, 21], [13.8, 20.4], [13.8, 13.6]]), ...plate(rr(7.6, 2.8, 13.6, 11.6, 2.2), 1.4), ...bar([[14, 7.2], [20.4, 7.2]], 1, { tone: "c" }), ...bar([[14, 10.6], [20.4, 10.6]], 1, { tone: "c" })],
  Handshake: () => [...bar([[1.4, 15.4], [6.6, 10.6]], 4), ...bar([[22.6, 15.4], [17.4, 10.6]], 4), ...gem([[5.6, 9.4], [12, 7.4], [18.4, 9.4], [19.4, 12.8], [14.6, 17.4], [9.4, 17.4], [4.6, 12.8]], [12, 12.4]), ...bar([[9.6, 11.4], [12.6, 14.4]], 1.1, { tone: "e" }), ...bar([[11.8, 10.4], [14.8, 13.4]], 1.1, { tone: "e" }), hl(8.4, 10.4, 1)],
  Smile: () => [...plate(circ(12, 12, 9.6, 20), 1.7), ...tint(disc(8.8, 9.6, 1.3, 6), "e"), ...tint(disc(15.2, 9.6, 1.3, 6), "e"), ...arc(12, 12.4, 4.4, 30, 150, 1.6, 8, { tone: "e" })],
  Bell: () => [...gem([[12, 3], [16.4, 5.4], [17.5, 11], [19.5, 17], [4.5, 17], [6.5, 11], [7.6, 5.4]], [12, 12]), ...bar([[3.4, 17.6], [20.6, 17.6]], 1.9, { tone: "d" }), ...disc(12, 20.3, 1.9, 8), ...disc(12, 2.6, 1.2, 6)],
  BellOff: () => [...gem([[12, 3], [16.4, 5.4], [17.5, 11], [19.5, 17], [4.5, 17], [6.5, 11], [7.6, 5.4]], [12, 12]), ...bar([[3.4, 17.6], [20.6, 17.6]], 1.9, { tone: "d" }), ...disc(12, 20.3, 1.9, 8), ...bar([[3.4, 3.4], [20.6, 20.6]], 2.4)],
  Globe: () => [...plate(circ(12, 12, 9.6, 20), 1.5), ...bar(ell(12, 12, 4.2, 9.2, 18), 1.3, { closed: true, tone: "c" }), ...bar([[3.2, 12], [20.8, 12]], 1.3, { tone: "c" })],
  Wifi: () => [...arc(12, 19, 13.4, -132, -48, 2.4, 12), ...arc(12, 19, 8.8, -132, -48, 2.4, 10), ...arc(12, 19, 4.4, -132, -48, 2.4, 8), ...disc(12, 19.6, 1.7, 8)],
  WifiOff: () => [...arc(12, 19, 13.4, -132, -48, 2.4, 12), ...arc(12, 19, 8.8, -132, -48, 2.4, 10), ...disc(12, 19.6, 1.7, 8), ...bar([[3, 3], [21, 21]], 2.4)],
  Volume2: () => [...gem([[3, 9], [7, 9], [12, 4.4], [12, 19.6], [7, 15], [3, 15]], [7.4, 12]), ...arc(12, 12, 4.4, -48, 48, 2.2, 8), ...arc(12, 12, 8.6, -50, 50, 2.2, 10)],
  VolumeX: () => [...gem([[3, 9], [7, 9], [12, 4.4], [12, 19.6], [7, 15], [3, 15]], [7.4, 12]), ...bar([[15.6, 9], [21.4, 15]], 2.4), ...bar([[21.4, 9], [19.2, 11.2]], 2.4), ...bar([[17.8, 12.8], [15.6, 15]], 2.4)],
  Youtube: null, Instagram: null,
  // 도구·설정
  Settings: () => [...gem(gearPts(12, 12, 10.2, 7.6, 8), [12, 12]), ...tint(disc(12, 12, 3.2, 12), "e"), hl(8.2, 6.8, 1)],
  Wrench: () => [...bar([[4.6, 19.4], [13.4, 10.6]], 3.4), ...arc(16.4, 7.6, 3.9, 0, 270, 2.8, 10)],
  Cpu: () => [
    ...[8.5, 12, 15.5].flatMap((v) => [...bar([[v, 2.4], [v, 5.6]], 1.5), ...bar([[v, 18.4], [v, 21.6]], 1.5), ...bar([[2.4, v], [5.6, v]], 1.5), ...bar([[18.4, v], [21.6, v]], 1.5)]),
    ...plate(rr(5.2, 5.2, 13.6, 13.6, 1.8), 1.4), ...tint(plate(rr(9, 9, 6, 6, 0.8), 0.8), "d"),
  ],
  Lightbulb: () => [...plate(circ(12, 9.4, 6.9, 16), 1.5), ...gem([[9, 14.8], [15, 14.8], [14.3, 17.2], [9.7, 17.2]]), ...bar([[9.4, 19], [14.6, 19]], 1.8, { tone: "d" }), ...bar([[10.4, 21.3], [13.6, 21.3]], 1.6, { tone: "e" }), hl(9.2, 6.8, 1.4)],
  Rocket: () => [
    ...gem([[8.4, 14.6], [3.6, 14.6], [7.2, 10.6]]), ...gem([[9.4, 15.6], [9.4, 20.4], [13.4, 16.8]]),
    ...gem([[20.6, 3.4], [19.2, 10.4], [11.6, 18], [6, 12.4], [13.6, 4.8]], [13, 11]), ...tint(disc(14.8, 9.2, 2.1, 8), "e"), ...tint(gem([[7.2, 16.8], [3, 21], [5, 15.8]]), "h"),
  ],
  Compass: () => [...ring(12, 12, 9, 2.3), { d: pd([[16, 8], [13.1, 13.1], [10.9, 10.9]]), t: "h" }, { d: pd([[13.1, 13.1], [8, 16], [10.9, 10.9]]), t: "d" }],
  Cloud: () => [...plate(circ(8, 14, 4.6, 12), 1.1), ...plate(circ(13.2, 10, 5.8, 14), 1.3, "a2"), ...plate(circ(17.4, 14.6, 4.2, 12), 1.1), ...plate(rr(4.2, 14, 17, 5.6, 2.8), 1)],
  Palette: () => [...plate(circ(12, 12, 9.6, 20), 1.6), ...tint(disc(14.6, 16.2, 2.2, 10), "e"), ...tint(disc(7.4, 10.6, 1.6, 8), "h"), ...tint(disc(10.4, 6.8, 1.6, 8), "d"), ...tint(disc(15, 7, 1.6, 8), "a"), ...tint(disc(17.4, 11, 1.6, 8), "e")],
  // 시간
  Clock: () => [...plate(circ(12, 12, 9.6, 20), 1.6), ...bar([[12, 12.6], [12, 6.6]], 1.9, { tone: "e" }), ...bar([[11.6, 12], [16, 14.4]], 1.9, { tone: "e" })],
  Timer: () => [...bar([[9.8, 2.6], [14.2, 2.6]], 2.1), ...plate(circ(12, 13.6, 8, 18), 1.5), ...bar([[12, 14], [12, 8.8]], 1.9, { tone: "e" })],
  Hourglass: () => [...gem([[6.6, 5], [17.4, 5], [12, 12]]), ...gem([[12, 12], [17.4, 19], [6.6, 19]]), ...tint(gem([[9, 18.6], [15, 18.6], [12, 15.4]]), "a"), ...plate(rr(5, 2.4, 14, 2.6, 1), 0.7), ...plate(rr(5, 19, 14, 2.6, 1), 0.7)],
  CalendarDays: () => [...plate(rr(3, 4.5, 18, 16.5, 2), 1.4), ...tint(gem([[4.4, 5.9], [19.6, 5.9], [19.6, 9.4], [4.4, 9.4]]), "a"), ...bar([[8, 2.2], [8, 6.6]], 2), ...bar([[16, 2.2], [16, 6.6]], 2), ...[8, 12, 16].flatMap((x) => [13, 17].flatMap((y) => tint(disc(x, y, 1.2, 6), "e")))],
  CalendarCheck: () => [...plate(rr(3, 4.5, 18, 16.5, 2), 1.4), ...tint(gem([[4.4, 5.9], [19.6, 5.9], [19.6, 9.4], [4.4, 9.4]]), "a"), ...bar([[8, 2.2], [8, 6.6]], 2), ...bar([[16, 2.2], [16, 6.6]], 2), ...bar([[8.4, 15], [11, 17.6], [15.8, 12.6]], 2, { tone: "e" })],
  // 미디어
  Play: () => [...gem([[6.5, 4], [20, 12], [6.5, 20]], [10.6, 12])],
  Pause: () => [...plate(rr(5.5, 4.5, 4.6, 15, 1.2), 1.1), ...plate(rr(13.9, 4.5, 4.6, 15, 1.2), 1.1)],
  SkipForward: () => [...gem([[4, 5], [15, 12], [4, 19]], [7.8, 12]), ...plate(rr(16.4, 5, 3.2, 14, 1), 0.9)],
  SkipBack: () => [...gem([[20, 5], [9, 12], [20, 19]], [16.2, 12]), ...plate(rr(4.4, 5, 3.2, 14, 1), 0.9)],
  Eye: () => {
    const up = Array.from({ length: 9 }, (_, i) => { const x = 2 + (20 * i) / 8; return [x, 12 - 7 * Math.sin((Math.PI * i) / 8)]; });
    const dn = Array.from({ length: 7 }, (_, i) => { const k = 7 - i; const x = 2 + (20 * k) / 8; return [x, 12 + 7 * Math.sin((Math.PI * k) / 8)]; });
    return [...gem([...up, ...dn], [12, 12]), ...tint(plate(circ(12, 12, 4, 12), 1), "d"), hl(10.6, 10.6, 1.1)];
  },
  EyeOff: () => {
    const up = Array.from({ length: 9 }, (_, i) => { const x = 2 + (20 * i) / 8; return [x, 12 - 7 * Math.sin((Math.PI * i) / 8)]; });
    const dn = Array.from({ length: 7 }, (_, i) => { const k = 7 - i; const x = 2 + (20 * k) / 8; return [x, 12 + 7 * Math.sin((Math.PI * k) / 8)]; });
    return [...shade(gem([...up, ...dn], [12, 12])), ...tint(plate(circ(12, 12, 4, 12), 1), "e"), ...bar([[3.4, 3.4], [20.6, 20.6]], 2.5)];
  },
  // 흐름·통계
  TrendingUp: () => [...bar([[2.6, 17.4], [8.8, 11.2], [12.8, 15.2], [17.2, 10.8]], 2.6), ...head([21.6, 6.4], 1, -1, 7, 4.6)],
  TrendingDown: () => [...bar([[2.6, 6.6], [8.8, 12.8], [12.8, 8.8], [17.2, 13.2]], 2.6), ...head([21.6, 17.6], 1, 1, 7, 4.6)],
  BarChart3: () => [...plate(rr(3.4, 13, 4.4, 8.4, 0.9), 1), ...plate(rr(9.8, 8, 4.4, 13.4, 0.9), 1), ...plate(rr(16.2, 3, 4.4, 18.4, 0.9), 1), hl(17.6, 5, 0.8)],
  Brain: () => [...gem(circ(8.6, 12, 6.4, 12)), ...shade(gem(circ(15.4, 12, 6.4, 12))), ...bar([[12, 6.2], [12, 18.6]], 1.2, { tone: "e" }), hl(6.4, 8.4, 1)],
  // 날씨·밤낮
  Sun: () => [...Array.from({ length: 8 }, (_, k) => { const a = (k * 45 - 90) * D2R, c = Math.cos(a), s = Math.sin(a); return gem([[12 + c * 11, 12 + s * 11], [12 + c * 7.2 - s * 1.7, 12 + s * 7.2 + c * 1.7], [12 + c * 7.2 + s * 1.7, 12 + s * 7.2 - c * 1.7]]); }).flat(), ...plate(circ(12, 12, 4.8, 14), 1.1), hl(10.4, 10.2, 0.9)],
  Moon: () => [...crescent(11.4, 12.6, 9, 16.8, 7.4, 7.2)],
  MoonStar: () => [...crescent(10.4, 13.6, 8.4, 15.6, 8.6, 6.8), ...gem(star(19, 5, 3.2, 1, 4))],
  // 소개 페이지 등
  GraduationCap: () => [...shade(gem([[6, 11.5], [18, 11.5], [18, 16.6], [12, 19.6], [6, 16.6]], [12, 15])), ...gem([[12, 3.5], [23, 9], [12, 14.5], [1, 9]], [12, 9]), ...bar([[20.6, 10], [20.6, 15.8]], 1.2), ...disc(20.6, 16.8, 1.3, 6)],
  MousePointer: () => [{ d: pd([[5, 3], [5, 19.5], [10, 15], [12, 15.4]]), t: "a" }, { d: pd([[5, 3], [12, 15.4], [18.5, 15]]), t: "c" }, ...bar([[11.6, 15.2], [15.4, 21]], 2.6)],
  Server: () => [...plate(rr(3, 3, 18, 8, 1.8), 1.3), ...plate(rr(3, 13, 18, 8, 1.8), 1.3), ...tint(disc(7, 7, 1.2, 6), "h"), ...tint(disc(7, 17, 1.2, 6), "h"), ...bar([[11, 7], [17.5, 7]], 1.3, { tone: "e" }), ...bar([[11, 17], [17.5, 17]], 1.3, { tone: "e" })],
  ShieldCheck: () => [...gem([[12, 2.5], [19.5, 5.5], [19.5, 11.5], [17.5, 16.5], [12, 21.5], [6.5, 16.5], [4.5, 11.5], [4.5, 5.5]], [12, 10.5]), ...bar([[8.4, 11.6], [11, 14.2], [15.8, 9.2]], 2.1, { tone: "e" })],
  History: () => [...plate(circ(12.6, 12.4, 8.8, 18), 1.5), ...bar([[12.6, 12.8], [12.6, 7.6]], 1.8, { tone: "e" }), ...bar([[12.2, 12.4], [16, 14.6]], 1.8, { tone: "e" }), ...head([2.6, 8.6], -0.4, 1, 5.4, 3.6)],
  ClipboardList: () => [...plate(rr(4, 4, 16, 18, 2), 1.5), ...tint(plate(rr(8.5, 2, 7, 4, 1), 0.8), "a"), ...tint(disc(8.4, 11, 1, 6), "e"), ...tint(disc(8.4, 15, 1, 6), "e"), ...bar([[11, 11], [16.4, 11]], 1.5, { tone: "e" }), ...bar([[11, 15], [16.4, 15]], 1.5, { tone: "e" })],
};

// 머티리얼(탭바 등에서 쓰던) 아이콘 대응: analytics·extension·assignment(·_late·_turned_in)·school
const CLIP = () => [...plate(rr(4, 4, 16, 18, 2), 1.5), ...tint(plate(rr(8.5, 2, 7, 4, 1), 0.8), "a")];
const MATERIAL = {
  analytics: () => [...plate(rr(3, 3, 18, 18, 2.4), 1.5), ...tint(gem(rr(6.6, 12, 2.6, 5.8, 0.4)), "a"), ...tint(gem(rr(10.7, 7, 2.6, 10.8, 0.4)), "a"), ...tint(gem(rr(14.8, 9.6, 2.6, 8.2, 0.4)), "a")],
  extension: DEF.Puzzle,
  assignment: () => [...CLIP(), ...bar([[8, 11], [16, 11]], 1.6, { tone: "e" }), ...bar([[8, 14.5], [16, 14.5]], 1.6, { tone: "e" }), ...bar([[8, 18], [13, 18]], 1.6, { tone: "e" })],
  assignment_late: () => [...CLIP(), ...bar([[12, 9.6], [12, 15]], 2.2, { tone: "e" }), ...tint(disc(12, 18.2, 1.3, 6), "e")],
  assignment_turned_in: () => [...CLIP(), ...bar([[8.2, 14], [11, 16.8], [16, 11.2]], 2.1, { tone: "e" })],
  school: () => DEF.GraduationCap(),
  groups: () => DEF.Users(),   // (v0.7.6) 소셜 탭
};

const made = {};
for (const [k, b] of Object.entries(DEF)) if (b) made[k] = makeIcon(k, b);
const mat = {};
for (const [k, b] of Object.entries(MATERIAL)) mat[k] = makeIcon("Material_" + k, b);
/** 머티리얼 이름으로 아이콘 찾기(app/common.jsx MaterialIcon). */
export const materialIcon = (name) => mat[name] || mat.assignment;
/** 아이콘 이름 목록(검사 스크립트·갤러리용). */
export const OC_ICON_NAMES = Object.keys(made);

export const { X, Check, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ChevronsRight, ChevronsLeft, ChevronsUp, Plus, Minus, ArrowLeft, ArrowRight, ArrowUpDown, ArrowRightLeft,
  MoveDiagonal, Maximize2, Minimize2, ExternalLink, MoreVertical, Search, Filter, Circle, Square, Ban, Info, HelpCircle, RotateCcw, RotateCw, RefreshCw, Repeat2, Undo2, Reply, Shuffle, Route,
  User, Users, UserPlus, UserCheck, Lock, Shield, ShieldAlert, Crown, Trophy, Medal, Gem, Star, Sparkles, Heart, Flame, Zap, Coins, HandCoins, Sword, Swords, Castle, Target, Crosshair, Dices,
  Puzzle, Scale, GitFork, Pin, PinOff, Flag, Shell, BookOpen, Book, BookMarked, Bookmark, Library, FileText, FolderOpen, ClipboardPaste, Copy, Save, Pencil, Trash2, Image, Camera, ListChecks,
  List, Rows3, PanelBottom, Grid3x3, ScanLine, SlidersHorizontal, Languages, MessageCircle, MessageSquare, Send, Mail, Share2, ThumbsUp, ThumbsDown, Handshake, Smile, Bell, BellOff, Globe,
  Wifi, WifiOff, Volume2, VolumeX, Settings, Wrench, Cpu, Lightbulb, Rocket, Compass, Cloud, Palette, Clock, Timer, Hourglass, CalendarDays, CalendarCheck, Play, Pause, SkipForward, SkipBack,
  Eye, EyeOff, TrendingUp, TrendingDown, BarChart3, Brain, Sun, Moon, MoonStar, GraduationCap, MousePointer, Server, ShieldCheck, History, ClipboardList } = made;
