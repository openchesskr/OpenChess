// (v0.7.9, 사용자 요청) 소셜 탭 게시물 배경 — 퍼즐 테마별 효과(puzzleThemeBackdrop.jsx)를 없애고, 게시물 종류(퍼즐·유산·대국)마다 하나씩.
//  · 퍼즐: 호두나무 바탕 + 은은한 체크 무늬 + 천천히 지나가는 금빛 광택. (v0.8.0, 사용자 요청) 금색 마름모(모서리 보석)는 없앴다.
//  · 유산: 유산 재생 화면처럼 — 남색 밤하늘에 별이 반짝이고 별자리 선이 이어진다. (v0.8.0, 사용자 요청) 보드 네 꼭짓점의 코너 브래킷 대신
//          별자리 선을 따라 유산 색의 전류가 지직거리며 흐른다(ElectricArc — 지그재그 채운 띠가 깜빡이고, 불꽃 한 점이 선을 따라 달린다).
//  · 대국: (v0.8.0, 사용자 요청 재디자인) "대국장" — 백(왼쪽 아래)·흑(오른쪽 위)으로 대각선으로 나뉜 와인색 바탕, 그 경계를 따라 금빛 이음매에
//          빛이 지나가고, 위에서 두 갈래 조명이 보드를 비추며 천천히 흔들린다.
// CLAUDE.md 장식 규칙: 별자리 선·브래킷도 선(stroke)이 아니라 끝이 가는 채운 면, 별은 4면 파셋, 빛은 왼쪽 위. 움직임은 transform·opacity만,
// 저사양 기기 모드(isLite)에서는 멈춘 그림만 그린다(기기의 '애니메이션 줄이기'는 쓰지 않는다 — 설정 탭 시각 효과 토글이 다룸, BUG-010). 보드는 PostMedia가 가운데에 두고, 배경은 칸 전체(viewBox 100×112)를 채운다.
import { isLite } from "../lib/perfMode.js";
import { GOLD, facetRamp } from "./facetIcons.jsx";

export const POST_BG = {
  puzzle: "radial-gradient(120% 90% at 30% 20%, #5A3A22 0%, #3A2414 55%, #24160C 100%)",
  legacy: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)",
  game: "radial-gradient(120% 95% at 50% 40%, #5A2430 0%, #3A141C 55%, #1E090E 100%)",   // (v0.8.0) 대국장 와인색
};
const CSS = "@keyframes pbTwinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}"
  + "@keyframes pbSweep{0%{transform:translateX(-120%) skewX(-18deg)}55%,100%{transform:translateX(220%) skewX(-18deg)}}"
  + "@keyframes pbBreath{0%,100%{opacity:.55}50%{opacity:1}}"
  + "@keyframes pbDraw{0%{opacity:0;transform:scaleX(0)}30%,80%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}"
  + "@keyframes pbFlickA{0%,100%{opacity:0}8%{opacity:.95}14%{opacity:.2}20%{opacity:.85}30%,62%{opacity:0}}"
  + "@keyframes pbFlickB{0%,38%{opacity:0}44%{opacity:.9}50%{opacity:.25}56%{opacity:.8}66%,100%{opacity:0}}"
  + "@keyframes pbSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}"
  + "@keyframes pbSeam{0%{transform:translate(-60%,60%)}60%,100%{transform:translate(60%,-60%)}}";
const layer = { position: "absolute", inset: 0, pointerEvents: "none" };
const anim = (lite, v) => (lite ? undefined : v);

// 4면 파셋 별(빛은 왼쪽 위) — 크기 r
function FacetStar({ x, y, r, delay = 0, dur = 3.2, lite }) {
  const R = { l1: "#FFF8E1", l3: "#E9D7A4", base: "#B99A5C", l4: "#D9C08A", hi: "#FFFFFF" };
  const k = r * 0.28;
  return (
    <g style={{ transformOrigin: x + "px " + y + "px", transformBox: "view-box", animation: anim(lite, "pbTwinkle " + dur + "s ease-in-out " + delay + "s infinite") }}>
      <path d={`M${x} ${y - r} L${x + k} ${y - k} L${x} ${y}Z`} fill={R.l1} />
      <path d={`M${x} ${y - r} L${x - k} ${y - k} L${x} ${y}Z`} fill={R.l1} />
      <path d={`M${x + r} ${y} L${x + k} ${y - k} L${x} ${y}Z`} fill={R.l3} />
      <path d={`M${x + r} ${y} L${x + k} ${y + k} L${x} ${y}Z`} fill={R.base} />
      <path d={`M${x} ${y + r} L${x + k} ${y + k} L${x} ${y}Z`} fill={R.base} />
      <path d={`M${x} ${y + r} L${x - k} ${y + k} L${x} ${y}Z`} fill={R.l4} />
      <path d={`M${x - r} ${y} L${x - k} ${y + k} L${x} ${y}Z`} fill={R.l4} />
      <path d={`M${x - r} ${y} L${x - k} ${y - k} L${x} ${y}Z`} fill={R.l1} />
    </g>
  );
}
// 두 점을 잇는 끝이 가는 채운 띠(별자리 선) — 가운데가 가장 두껍다
function Taper({ a, b, w = 0.35, color = "#E9D7A4", delay = 0, lite }) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = (-dy / len) * w, ny = (dx / len) * w;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return <path d={`M${a[0]} ${a[1]} L${m[0] + nx} ${m[1] + ny} L${b[0]} ${b[1]} L${m[0] - nx} ${m[1] - ny}Z`} fill={color} opacity={0.55}
    style={{ transformOrigin: a[0] + "px " + a[1] + "px", transformBox: "view-box", animation: anim(lite, "pbDraw 7s ease-in-out " + delay + "s infinite") }} />;
}
// 별자리 — 점 목록과 잇는 순서
// (v0.8.0) 보드가 칸 폭의 90%(x 5~95, y 11~101)로 커져, 별자리는 위·아래 여백 띠와 양옆에 둔다
const CONSTELLATIONS = [
  { pts: [[4, 6], [12, 2.6], [20, 6.5], [27, 3.4], [33, 7.6]], links: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { pts: [[64, 106.5], [72, 109.4], [80, 105.6], [88, 108.8], [96, 105]], links: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { pts: [[70, 4.4], [80, 7.4], [90, 3.2], [97, 7.8]], links: [[0, 1], [1, 2], [2, 3]] },
  { pts: [[2.4, 40], [1.6, 52], [3, 64]], links: [[0, 1], [1, 2]] },
];
const FIELD_STARS = [[42, 3.2, 0.8], [52, 6.8, 0.6], [60, 2.6, 0.9], [98, 30, 0.8], [98.4, 58, 0.7], [97.6, 84, 0.9], [2.2, 22, 0.7], [2.6, 88, 0.8], [8, 108, 0.9], [22, 105.4, 0.7], [36, 109, 0.8], [50, 106.4, 0.6]];
// (v0.8.0, 사용자 요청) 별자리 선을 따라 흐르는 전류 — 선 대신 끝이 가는 지그재그 채운 띠 두 벌(모양이 다름)이 번갈아 깜빡이고,
//  밝은 불꽃 한 점(가운데 흰 하이라이트 + 유산 색 면)이 선을 따라 달린다. 색은 유산 색(accent) ramp, 빛은 왼쪽 위.
function zigzag(a, b, seed, amp = 0.9, n = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const pts = [a];
  for (let k = 1; k < n; k++) { const f = k / n, o = (((k * 7 + seed * 3) % 5) / 4 - 0.5) * 2 * amp * (k % 2 ? 1 : -1); pts.push([a[0] + dx * f + nx * o, a[1] + dy * f + ny * o]); }
  pts.push(b);
  return pts;
}
function boltPath(pts, w) {
  // 지그재그 중심선을 따라 가운데가 두껍고 양끝이 뾰족한 채운 띠
  const up = [], down = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    const dx = q[0] - r[0], dy = q[1] - r[1], l = Math.hypot(dx, dy) || 1, ww = w * Math.sin((Math.PI * i) / (pts.length - 1));
    up.push([p[0] - (dy / l) * ww, p[1] + (dx / l) * ww]); down.push([p[0] + (dy / l) * ww, p[1] - (dx / l) * ww]);
  });
  return "M" + up.concat(down.reverse()).map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + "Z";
}
function ElectricArc({ a, b, R, seed, lite, delay = 0 }) {
  const d1 = boltPath(zigzag(a, b, seed, 1.15), 0.5), d2 = boltPath(zigzag(a, b, seed + 2, 0.95, 7), 0.4);
  const dur = 2.2 + (seed % 3) * 0.4;
  return (
    <g>
      <path d={d1} fill={R.l1} style={{ opacity: lite ? 0.6 : 0, animation: anim(lite, "pbFlickA " + dur + "s steps(1,end) " + delay + "s infinite") }} />
      <path d={d2} fill={R.l3} style={{ opacity: 0, animation: anim(lite, "pbFlickB " + dur + "s steps(1,end) " + delay + "s infinite") }} />
      {!lite && (
        <g>
          <circle r={1} fill={R.base}><animateMotion dur={dur * 1.2 + "s"} begin={delay + "s"} repeatCount="indefinite" path={"M" + a[0] + " " + a[1] + "L" + b[0] + " " + b[1]} /></circle>
          <circle r={0.5} fill={R.hi}><animateMotion dur={dur * 1.2 + "s"} begin={delay + "s"} repeatCount="indefinite" path={"M" + a[0] + " " + a[1] + "L" + b[0] + " " + b[1]} /></circle>
        </g>
      )}
    </g>
  );
}

export function LegacyPostBackdrop({ accent = GOLD.l2 }) {
  const lite = isLite();
  const R = facetRamp(accent);   // 유산 색 ramp — 전류·불꽃
  return (
    <div aria-hidden="true" className="pb-anim" style={layer}>
      <style>{CSS}</style>
      <div style={{ ...layer, background: "radial-gradient(60% 45% at 18% 10%, rgba(120,150,220,.22), transparent 70%), radial-gradient(55% 40% at 88% 100%, rgba(212,175,95,.16), transparent 70%)" }} />
      <svg viewBox="0 0 100 112" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {CONSTELLATIONS.map((c, ci) => (
          <g key={ci}>
            {c.links.map(([i, j], li) => <Taper key={li} a={c.pts[i]} b={c.pts[j]} lite={lite} delay={ci * 1.3 + li * 0.35} />)}
            <g style={{ filter: lite ? undefined : "drop-shadow(0 0 1.6px " + accent + ") drop-shadow(0 0 0.5px " + accent + ")" }}>
              {c.links.map(([i, j], li) => <ElectricArc key={"e" + li} a={c.pts[i]} b={c.pts[j]} R={R} seed={ci * 5 + li} lite={lite} delay={ci * 0.9 + li * 0.45} />)}
            </g>
            {c.pts.map((p, pi) => <FacetStar key={pi} x={p[0]} y={p[1]} r={1.5} lite={lite} delay={ci * 0.7 + pi * 0.4} />)}
          </g>
        ))}
        {FIELD_STARS.map(([x, y, r], i) => <FacetStar key={"f" + i} x={x} y={y} r={r} lite={lite} delay={(i * 0.37) % 3} dur={2.4 + (i % 4) * 0.5} />)}
      </svg>
    </div>
  );
}

export function PuzzlePostBackdrop() {
  const lite = isLite();
  return (
    <div aria-hidden="true" className="pb-anim" style={{ ...layer, overflow: "hidden" }}>
      <style>{CSS}</style>
      {/* 은은한 체크 무늬 — 가운데(보드 쪽)로 갈수록 사라진다 */}
      <div style={{ ...layer, opacity: 0.1, backgroundImage: "conic-gradient(#F4E3C1 25%, transparent 0 50%, #F4E3C1 0 75%, transparent 0)", backgroundSize: "28px 28px",
        WebkitMaskImage: "radial-gradient(75% 70% at 50% 50%, transparent 55%, #000 100%)", maskImage: "radial-gradient(75% 70% at 50% 50%, transparent 55%, #000 100%)" }} />
      {/* 금빛 광택이 왼쪽 위에서 오른쪽으로 천천히 지나간다 */}
      {!lite && <div style={{ position: "absolute", top: "-10%", bottom: "-10%", left: 0, width: "38%", background: "linear-gradient(90deg, transparent, rgba(255,226,160,.16), transparent)", animation: "pbSweep 7s ease-in-out infinite" }} />}
    </div>
  );
}

// (v0.8.0, 사용자 요청 재디자인) 대국장 — 백·흑이 대각선으로 마주 보는 와인색 바탕, 금빛 이음매, 위에서 흔들리는 두 갈래 조명
export function GamePostBackdrop() {
  const lite = isLite();
  return (
    <div aria-hidden="true" className="pb-anim" style={{ ...layer, overflow: "hidden" }}>
      <style>{CSS}</style>
      {/* 백 진영(왼쪽 아래) — 따뜻한 상아빛이 살짝 도는 면 */}
      <div style={{ ...layer, background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,.34) 50%)" }} />
      <div style={{ ...layer, background: "linear-gradient(135deg, rgba(255,236,200,.10) 0%, rgba(255,236,200,.02) 50%, transparent 50%)" }} />
      {/* 경계 이음매 — 금빛 띠 + 그 위를 지나가는 빛 */}
      <div style={{ ...layer, background: "linear-gradient(135deg, transparent calc(50% - 1.2px), rgba(232,196,106,.55) 50%, transparent calc(50% + 1.2px))" }} />
      {!lite && <div style={{ ...layer, background: "linear-gradient(135deg, transparent 44%, rgba(255,240,200,.0) 47%, rgba(255,240,200,.45) 50%, rgba(255,240,200,0) 53%, transparent 56%)",
        WebkitMaskImage: "radial-gradient(18% 18% at 50% 50%, #000, transparent)", maskImage: "radial-gradient(18% 18% at 50% 50%, #000, transparent)", animation: "pbSeam 6s ease-in-out infinite" }} />}
      {/* 위에서 내려오는 두 갈래 조명(천천히 흔들림) */}
      {[["22%", 0], ["78%", 1.6]].map(([x, d], i) => (
        <div key={i} style={{ position: "absolute", top: "-12%", left: x, width: "46%", height: "125%", marginLeft: "-23%", transformOrigin: "50% 0", pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(255,240,205,.20), rgba(255,240,205,.05) 60%, transparent)", clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
          animation: anim(lite, "pbSway 7s ease-in-out " + d + "s infinite") }} />
      ))}
      <div style={{ ...layer, boxShadow: "inset 0 0 50px rgba(0,0,0,.6)" }} />
    </div>
  );
}
