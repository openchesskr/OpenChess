// (v0.7.5, 사용자 요청) OpenChess 파셋(면 분할) 아이콘 — 사이트에서 직접 그리는 모든 아이콘·장식 요소의 공통 부품과 규칙.
//  기준 작품: 마스터 대국 승자 왕관(app/analysis.jsx CrownIcon).
//  규칙(CLAUDE.md "아이콘·디자인 요소 규칙"과 같은 내용):
//   1. 윤곽선(stroke)으로 모양을 그리지 않는다. 모양은 채운 면(fill)으로만 만든다.
//   2. 모양을 2~5개의 면으로 나누고, 빛은 항상 왼쪽 위에서 온다. 왼쪽·위 면이 밝고 오른쪽·아래 면이 어둡다(톤 단계는 ramp 하나로 맞춘다).
//   3. 받침·밑단·그림자 쪽은 가장 어두운 톤, 그리고 가장 밝은 하이라이트(보석·점·짧은 면) 하나로 시선을 모은다.
//   4. 색은 ramp(밝음 → 어두움 6단계)에서만 고른다. 금색은 GOLD, 그 밖의 색은 facetRamp(기준색)로 만든다.
//   5. 작은 크기(12~16px)에서도 면이 뭉개지지 않게 면 수를 줄이고, 면 사이에 틈을 두지 않는다(맞닿게 그린다).
//   6. 라이브러리 아이콘(lucide)·국기·브랜드 로고·사용자 제공 이미지는 이 규칙의 대상이 아니다(원형 그대로 쓴다).
import React from "react";

const rgb = (h) => { const x = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const hex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mixHex = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };

/** 승자 왕관과 같은 금색 6단계 + 보석색. */
export const GOLD = { hi: "#FFF7DC", l1: "#F8E2A0", l2: "#EBC663", l3: "#D8A941", l4: "#B58632", base: "#8A6322", gem: "#FFF1B8" };
/** 기준색 하나로 같은 구조의 6단계 ramp를 만든다(l2가 기준색). */
export function facetRamp(c) {
  return { hi: mixHex(c, "#FFFFFF", 0.7), l1: mixHex(c, "#FFFFFF", 0.32), l2: c, l3: mixHex(c, "#000000", 0.16), l4: mixHex(c, "#000000", 0.32), base: mixHex(c, "#000000", 0.5), gem: mixHex(c, "#FFFFFF", 0.82) };
}
/** 그림자 패스용: 모든 단계가 같은 색. */
export const flatRamp = (c) => ({ hi: c, l1: c, l2: c, l3: c, l4: c, base: c, gem: c });

// ── 기하 도우미 ──
const P = (pts) => "M" + pts.map((p) => p[0].toFixed(3) + " " + p[1].toFixed(3)).join("L") + "Z";
const arc = (cx, cy, r, a0, a1) => { const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1); return [x0, y0, x1, y1]; };

/** 네 면 마름모(보석): 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래 순으로 어두워지고 가운데 작은 하이라이트. */
export function FacetDiamond({ cx, cy, r, R = GOLD, gem = true }) {
  const T = [cx, cy - r], Rt = [cx + r, cy], B = [cx, cy + r], L = [cx - r, cy], C = [cx, cy];
  return (
    <g>
      <path d={P([L, T, C])} fill={R.l1} /><path d={P([T, Rt, C])} fill={R.l3} />
      <path d={P([Rt, B, C])} fill={R.base} /><path d={P([B, L, C])} fill={R.l4} />
      {gem && <path d={P([[cx - r * 0.42, cy - r * 0.08], [cx - r * 0.08, cy - r * 0.42], [cx + r * 0.06, cy - r * 0.06]])} fill={R.hi} />}
    </g>
  );
}

/** 잎 한 장(원점에서 +x로 뻗음): 가운데 잎맥을 기준으로 위 반쪽은 밝게, 아래 반쪽은 어둡게. */
export function leafHalves(sz) {
  const top = "M0 0 C" + sz * 0.35 + " " + -sz * 0.5 + " " + sz * 1.05 + " " + -sz * 0.42 + " " + sz * 1.35 + " 0Z";
  const bot = "M0 0 L" + sz * 1.35 + " 0 C" + sz * 1.05 + " " + sz * 0.42 + " " + sz * 0.35 + " " + sz * 0.5 + " 0 0Z";
  return { top, bot };
}
export function FacetLeaf({ x, y, rot, sz, R = GOLD, mirror = false }) {
  const h = leafHalves(sz);
  // 빛은 왼쪽 위 — 잎의 위쪽 반(로컬 -y 쪽)의 바깥 법선이 왼쪽 위를 향하면 그 반을 밝게. mirror: 부모가 좌우 반전(scaleX -1)일 때
  const r = (rot * Math.PI) / 180, nx = Math.sin(r) * (mirror ? -1 : 1), ny = -Math.cos(r);
  const topLit = -nx - ny > 0;
  return (
    <g transform={"translate(" + x + " " + y + ") rotate(" + rot + ")"}>
      <path d={h.top} fill={topLit ? R.l1 : R.l3} /><path d={h.bot} fill={topLit ? R.l3 : R.l1} />
      <path d={"M" + sz * 0.18 + " " + (topLit ? -1 : 1) * sz * 0.05 + " L" + sz * 0.9 + " " + (topLit ? -1 : 1) * sz * 0.07 + " L" + sz * 0.5 + " " + (topLit ? -1 : 1) * sz * 0.17 + "Z"} fill={R.hi} opacity=".7" />
    </g>
  );
}
/** 굵기가 줄어드는 줄기(윤곽선 대신 채운 면). 이차 베지어(x0,y0)→(cx,cy)→(x1,y1)을 따라 두께 w0→w1. */
export function taperedStem(x0, y0, cx, cy, x1, y1, w0, w1, n = 14) {
  const L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = a * x0 + b * cx + c * x1, y = a * y0 + b * cy + c * y1;
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy), d = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2, nx = -dy / d, ny = dx / d;
    L.push([x + nx * w, y + ny * w]); Rr.push([x - nx * w, y - ny * w]);
  }
  return P([...L, ...Rr.reverse()]);
}

// ── 기물 부품(단위 좌표: 대략 -0.5~0.6, translate·scale로 놓는다). 모두 세로 가운데선(x=0)에서 왼쪽 면이 밝고 오른쪽 면이 어둡다. ──
export function FacetPawn({ x, y, s, R = GOLD, rot = 0 }) {
  const [hx0, hy0, hx1, hy1] = arc(0, -0.56, 0.2, Math.PI / 2, (3 * Math.PI) / 2);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {/* 머리: 왼쪽 반원 밝게, 오른쪽 반원 어둡게, 왼쪽 위 하이라이트 */}
      <path d={`M${hx0} ${hy0} A.2 .2 0 0 1 ${hx1} ${hy1}Z`} fill={R.l1} />
      <path d={`M${hx1} ${hy1} A.2 .2 0 0 1 ${hx0} ${hy0}Z`} fill={R.l3} />
      <path d="M-.13 -.62 L-.06 -.71 L-.02 -.6Z" fill={R.hi} />
      {/* 몸통 */}
      <path d="M-.15 -.33 L0 -.33 L0 .42 L-.33 .42 Q-.3 .12 -.11 -.1Z" fill={R.l2} />
      <path d="M0 -.33 L.15 -.33 L.11 -.1 Q.3 .12 .33 .42 L0 .42Z" fill={R.l4} />
      <path d="M-.15 -.33 L.15 -.33 L.12 -.26 L-.12 -.26Z" fill={R.l1} />
      {/* 받침 */}
      <path d="M-.4 .42 H.4 L.38 .56 H-.38Z" fill={R.base} /><path d="M-.4 .42 H.4 L.395 .46 H-.395Z" fill={R.l3} />
    </g>
  );
}
export function FacetRook({ x, y, s, R = GOLD }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* 총안(위 세 개): 왼쪽부터 밝기 단계 */}
      <path d="M-.34 -.52 H-.2 V-.4 H-.34Z" fill={R.l1} /><path d="M-.07 -.52 H.07 V-.4 H-.07Z" fill={R.l2} /><path d="M.2 -.52 H.34 V-.4 H.2Z" fill={R.l3} />
      {/* 머리 띠 */}
      <path d="M-.34 -.4 H0 V-.22 H-.24 L-.34 -.22Z" fill={R.l1} /><path d="M0 -.4 H.34 V-.22 H0Z" fill={R.l3} />
      <path d="M-.34 -.22 H0 V-.12 H-.24Z" fill={R.l3} /><path d="M0 -.22 H.34 L.24 -.12 H0Z" fill={R.base} />
      {/* 몸통 */}
      <path d="M-.24 -.12 H0 V.2 H-.24Z" fill={R.l2} /><path d="M0 -.12 H.24 V.2 H0Z" fill={R.l4} />
      <path d="M-.2 .0 H.2 V.03 H-.2Z" fill={R.base} opacity=".55" /><path d="M-.2 .12 H.2 V.15 H-.2Z" fill={R.base} opacity=".55" />
      {/* 받침 */}
      <path d="M-.24 .2 H0 V.34 H-.36Z" fill={R.l3} /><path d="M0 .2 H.24 L.36 .34 H0Z" fill={R.base} />
      <path d="M-.36 .34 H.36 V.54 H-.36Z" fill={R.base} /><path d="M-.36 .34 H.36 V.38 H-.36Z" fill={R.l4} />
      <path d="M-.3 -.5 H-.24 V-.44Z" fill={R.hi} />
    </g>
  );
}
export function FacetBishop({ x, y, s, R = GOLD }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <FacetDiamond cx={0} cy={-0.6} r={0.09} R={R} gem={false} />
      {/* 주교관: 가운데선 왼쪽 밝게, 오른쪽 어둡게 + 비스듬한 홈(밝은 면이 파인 자리) */}
      <path d="M0 -.5 C-.26 -.28 -.34 -.05 -.2 .14 L0 .14Z" fill={R.l1} />
      <path d="M0 -.5 C.26 -.28 .34 -.05 .2 .14 L0 .14Z" fill={R.l3} />
      <path d="M-.09 -.22 L.12 -.03 L.16 -.09 L-.03 -.27Z" fill={R.base} />
      <path d="M-.12 -.3 L-.05 -.4 L-.03 -.3Z" fill={R.hi} />
      {/* 목·받침 */}
      <path d="M-.2 .14 H0 V.3 H-.32Z" fill={R.l2} /><path d="M0 .14 H.2 L.32 .3 H0Z" fill={R.l4} />
      <path d="M-.4 .34 H.4 V.48 H-.4Z" fill={R.base} /><path d="M-.4 .34 H.4 V.38 H-.4Z" fill={R.l3} />
    </g>
  );
}
/** 승자 왕관과 같은 짜임(네 면 + 가운데 보석 + 밑단 + 꼭대기 구슬). 단위 좌표, 폭 약 1. */
export function FacetCrown({ x, y, s, R = GOLD }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-.5 -.3 L-.24 -.08 L-.3 .26 H-.44Z" fill={R.l2} />
      <path d="M-.24 -.08 L0 -.46 V.26 H-.3Z" fill={R.l1} />
      <path d="M0 -.46 L.24 -.08 L.3 .26 H0Z" fill={R.l3} />
      <path d="M.24 -.08 L.5 -.3 L.44 .26 H.3Z" fill={R.l4} />
      <path d="M-.44 .31 H.44 L.41 .45 H-.41Z" fill={R.base} />
      <path d="M0 -.04 L.07 .06 L0 .16 L-.07 .06Z" fill={R.hi} />
      {[[-0.5, -0.33, 0.065], [0, -0.5, 0.075], [0.5, -0.33, 0.065]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={R.gem} />)}
    </g>
  );
}
/** 방패: 위아래·좌우 네 면 + 가운데 능선. 100 좌표계에서 쓰는 크기(중심 cx,cy, 반폭 w, 높이 h). */
export function FacetShield({ cx, cy, w, h, R = GOLD }) {
  const top = cy - h * 0.5, sh = cy - h * 0.38, mid = cy + h * 0.05, bot = cy + h * 0.5;
  return (
    <g>
      <path d={`M${cx} ${top} L${cx - w} ${sh} V${mid} H${cx}Z`} fill={R.l1} />
      <path d={`M${cx} ${top} L${cx + w} ${sh} V${mid} H${cx}Z`} fill={R.l3} />
      <path d={`M${cx - w} ${mid} C${cx - w} ${cy + h * 0.3} ${cx - w * 0.52} ${cy + h * 0.42} ${cx} ${bot} V${mid}Z`} fill={R.l2} />
      <path d={`M${cx + w} ${mid} C${cx + w} ${cy + h * 0.3} ${cx + w * 0.52} ${cy + h * 0.42} ${cx} ${bot} V${mid}Z`} fill={R.base} />
      <path d={`M${cx - w * 0.8} ${sh + 1.2} L${cx - w * 0.2} ${top + 2.4} L${cx - w * 0.68} ${sh + 4}Z`} fill={R.hi} />
    </g>
  );
}
/** 꺾인 화살표: 점 목록을 따라 굵기 w의 띠 + 끝의 삼각 화살촉. 띠는 진행 방향 왼쪽 반이 밝고 오른쪽 반이 어둡다. 촉도 축을 기준으로 두 면. */
export function FacetArrow({ pts, w = 5, head = 11, R = GOLD }) {
  const segs = [];
  const n = pts.length;
  const [ex, ey] = pts[n - 1], [px, py] = pts[n - 2];
  const L = Math.hypot(ex - px, ey - py) || 1, ux = (ex - px) / L, uy = (ey - py) / L;
  const tip = [ex, ey], bx = ex - ux * head, by = ey - uy * head;
  const body = pts.slice(0, -1).concat([[bx, by]]);
  for (let i = 0; i < body.length - 1; i++) {
    const [ax, ay] = body[i], [cx, cy] = body[i + 1], l = Math.hypot(cx - ax, cy - ay) || 1, nx = -(cy - ay) / l, ny = (cx - ax) / l, hw = w / 2;
    // 이음매가 벌어지지 않게 양끝을 반 굵기만큼 늘린다
    const ex0 = ax - ((cx - ax) / l) * (i ? hw : 0), ey0 = ay - ((cy - ay) / l) * (i ? hw : 0);
    const plusLit = -nx - ny > 0;   // +n 쪽 면이 왼쪽 위(빛)를 향하면 그 면을 밝게
    segs.push(<path key={"a" + i} d={P([[ex0 + nx * hw, ey0 + ny * hw], [cx + nx * hw, cy + ny * hw], [cx, cy], [ex0, ey0]])} fill={plusLit ? R.l1 : R.l3} />);
    segs.push(<path key={"b" + i} d={P([[ex0, ey0], [cx, cy], [cx - nx * hw, cy - ny * hw], [ex0 - nx * hw, ey0 - ny * hw]])} fill={plusLit ? R.l3 : R.l1} />);
  }
  const hn = [-uy, ux], hw2 = head * 0.62;
  const h1 = [bx + hn[0] * hw2, by + hn[1] * hw2], h2 = [bx - hn[0] * hw2, by - hn[1] * hw2];
  return (
    <g>
      {segs}
      {(() => { const lit = -hn[0] - hn[1] > 0; return <><path d={P([tip, h1, [bx, by]])} fill={lit ? R.l1 : R.l4} /><path d={P([tip, [bx, by], h2])} fill={lit ? R.l4 : R.l1} /></>; })()}
    </g>
  );
}

/** 조준경(좌표 인지 게임): 고리를 네 면(사분원)으로 나눠 왼쪽 위가 가장 밝고, 십자 눈금은 끝이 뾰족한 두 면, 가운데 보석.
 *  color만 주면(currentColor 포함) 같은 색의 불투명도 단계로 면을 나눈다 — 글자색을 따르는 목록 아이콘 자리에서도 쓴다. */
export function FacetCrosshair({ size = 24, color = "#FFFFFF", style }) {
  const op = [1, 0.74, 0.5, 0.82];                   // 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래
  const ring = [];
  for (let q = 0; q < 4; q++) {
    const a0 = Math.PI + q * (Math.PI / 2) + 0.06, a1 = a0 + Math.PI / 2 - 0.12;
    const [ox0, oy0, ox1, oy1] = arc(12, 12, 8.2, a0, a1), [ix0, iy0, ix1, iy1] = arc(12, 12, 5.6, a0, a1);
    ring.push(<path key={q} d={`M${ox0} ${oy0} A8.2 8.2 0 0 1 ${ox1} ${oy1} L${ix1} ${iy1} A5.6 5.6 0 0 0 ${ix0} ${iy0}Z`} fill={color} fillOpacity={op[q]} />);
  }
  // 눈금: 바깥 끝이 넓고 안쪽 끝이 뾰족한 쐐기, 축을 기준으로 두 면
  const tick = (ang, k) => {
    const c = Math.cos(ang), s = Math.sin(ang), at = (r, w) => [12 + c * r - s * w, 12 + s * r + c * w];
    return <g key={"t" + k}>
      <path d={P([at(11.6, -1.5), at(11.6, 0), at(6.6, 0)])} fill={color} fillOpacity={k === 0 || k === 3 ? 1 : 0.7} />
      <path d={P([at(11.6, 0), at(11.6, 1.5), at(6.6, 0)])} fill={color} fillOpacity={k === 0 || k === 3 ? 0.72 : 0.46} />
    </g>;
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", ...style }}>
      {ring}
      {[-Math.PI / 2, 0, Math.PI / 2, Math.PI].map(tick)}
      <path d={P([[12, 9.6], [14.4, 12], [12, 14.4], [9.6, 12]])} fill={color} fillOpacity=".55" />
      <path d={P([[12, 9.6], [12, 12], [9.6, 12]])} fill={color} />
      <path d={P([[12, 9.6], [14.4, 12], [12, 12]])} fill={color} fillOpacity=".8" />
    </svg>
  );
}

/** 네 갈래 별(✦ 글자 장식 대신): 갈래마다 축을 기준으로 두 면, 왼쪽 위를 향한 면이 밝다. 글자 줄 안에 쓰는 인라인 svg. */
export function FacetSpark({ size = 12, R = GOLD, style }) {
  const c = 12, L = 11, w = 3.2;
  const arms = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}>
      {arms.map(([dx, dy], i) => {
        const tip = [c + dx * L, c + dy * L], nx = -dy, ny = dx, a = [c + nx * w, c + ny * w], b = [c - nx * w, c - ny * w];
        const litA = -nx - ny > 0;   // a 쪽 면이 왼쪽 위를 향하면 밝게
        return <g key={i}><path d={P([[c, c], a, tip])} fill={litA ? R.l1 : R.l4} /><path d={P([[c, c], tip, b])} fill={litA ? R.l4 : R.l1} /></g>;
      })}
      <path d={P([[c - 1.6, c], [c, c - 1.6], [c + 1.6, c], [c, c + 1.6]])} fill={R.hi} />
    </svg>
  );
}
