// (v0.7.9, 사용자 요청) 소셜 탭 게시물 배경 — 퍼즐 테마별 효과(puzzleThemeBackdrop.jsx)를 없애고, 게시물 종류(퍼즐·유산·대국)마다 하나씩.
//  · 퍼즐: 호두나무 바탕 + 은은한 체크 무늬 + 천천히 지나가는 금빛 광택 + 모서리 보석(파셋 다이아몬드)이 번갈아 반짝인다.
//  · 유산: 유산 재생 화면처럼 — 남색 밤하늘에 별이 반짝이고 별자리 선이 이어지며, 보드 둘레의 코너 브래킷(윤곽선 효과)이 맥동한다.
//  · 대국: 대회 테이블의 녹색 펠트 + 숨 쉬듯 밝아졌다 어두워지는 조명 + 아래 모서리의 백·흑 폰.
// CLAUDE.md 장식 규칙: 별자리 선·브래킷도 선(stroke)이 아니라 끝이 가는 채운 면, 별은 4면 파셋, 빛은 왼쪽 위. 움직임은 transform·opacity만,
// 저사양 기기 모드(isLite)에서는 멈춘 그림만 그린다(기기의 '애니메이션 줄이기'는 쓰지 않는다 — 설정 탭 시각 효과 토글이 다룸, BUG-010). 보드는 PostMedia가 가운데에 두고, 배경은 칸 전체(viewBox 100×112)를 채운다.
import { isLite } from "../lib/perfMode.js";
import { FacetDiamond, FacetPawn, GOLD, facetRamp } from "./facetIcons.jsx";

export const POST_BG = {
  puzzle: "radial-gradient(120% 90% at 30% 20%, #5A3A22 0%, #3A2414 55%, #24160C 100%)",
  legacy: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)",
  game: "radial-gradient(120% 95% at 50% 38%, #24654B 0%, #154532 55%, #0B271C 100%)",
};
const CSS = "@keyframes pbTwinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}"
  + "@keyframes pbSweep{0%{transform:translateX(-120%) skewX(-18deg)}55%,100%{transform:translateX(220%) skewX(-18deg)}}"
  + "@keyframes pbBreath{0%,100%{opacity:.55}50%{opacity:1}}"
  + "@keyframes pbDraw{0%{opacity:0;transform:scaleX(0)}30%,80%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}"
  + "@keyframes pbBracket{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}";
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
const CONSTELLATIONS = [
  { pts: [[6, 8], [13, 5], [19, 9], [16, 15], [24, 13]], links: [[0, 1], [1, 2], [2, 3], [2, 4]] },
  { pts: [[78, 98], [85, 103], [93, 99], [90, 107], [96, 106]], links: [[0, 1], [1, 2], [1, 3], [3, 4]] },
  { pts: [[84, 6], [91, 10], [95, 4]], links: [[0, 1], [1, 2]] },
];
const FIELD_STARS = [[30, 4, 0.9], [44, 7, 0.7], [58, 3, 1.1], [70, 8, 0.8], [4, 30, 0.8], [5, 60, 1], [3, 84, 0.7], [96, 34, 0.9], [95, 66, 0.8], [97, 82, 1], [12, 104, 0.9], [30, 108, 0.7], [50, 105, 1], [64, 108, 0.8]];
// 채운 L자 코너 브래킷(윤곽선 효과) — 보드 둘레 네 모서리
function Bracket({ x, y, s, flipX, flipY, color, lite, delay }) {
  const sx = flipX ? -1 : 1, sy = flipY ? -1 : 1, t = s * 0.22;
  const d = `M${x} ${y} L${x + sx * s} ${y} L${x + sx * (s - t * 0.6)} ${y + sy * t} L${x + sx * t} ${y + sy * t} L${x + sx * t} ${y + sy * (s - t * 0.6)} L${x} ${y + sy * s}Z`;
  return <path d={d} fill={color} style={{ transformOrigin: x + "px " + y + "px", transformBox: "view-box", animation: anim(lite, "pbBracket 2.6s ease-in-out " + delay + "s infinite") }} />;
}

export function LegacyPostBackdrop({ accent = GOLD.l2 }) {
  const lite = isLite();
  // 보드(폭 80%, 가운데) 바깥쪽 모서리에 브래킷 — 보드 영역: x 10~90, y 16~96
  return (
    <div aria-hidden="true" className="pb-anim" style={layer}>
      <style>{CSS}</style>
      <div style={{ ...layer, background: "radial-gradient(60% 45% at 18% 10%, rgba(120,150,220,.22), transparent 70%), radial-gradient(55% 40% at 88% 100%, rgba(212,175,95,.16), transparent 70%)" }} />
      <svg viewBox="0 0 100 112" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {CONSTELLATIONS.map((c, ci) => (
          <g key={ci}>
            {c.links.map(([i, j], li) => <Taper key={li} a={c.pts[i]} b={c.pts[j]} lite={lite} delay={ci * 1.3 + li * 0.35} />)}
            {c.pts.map((p, pi) => <FacetStar key={pi} x={p[0]} y={p[1]} r={1.5} lite={lite} delay={ci * 0.7 + pi * 0.4} />)}
          </g>
        ))}
        {FIELD_STARS.map(([x, y, r], i) => <FacetStar key={"f" + i} x={x} y={y} r={r} lite={lite} delay={(i * 0.37) % 3} dur={2.4 + (i % 4) * 0.5} />)}
        <Bracket x={7.5} y={13.5} s={7} color={accent} lite={lite} delay={0} />
        <Bracket x={92.5} y={13.5} s={7} flipX color={accent} lite={lite} delay={0.3} />
        <Bracket x={7.5} y={98.5} s={7} flipY color={accent} lite={lite} delay={0.6} />
        <Bracket x={92.5} y={98.5} s={7} flipX flipY color={accent} lite={lite} delay={0.9} />
      </svg>
    </div>
  );
}

const BRASS = facetRamp("#C49A50");
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
      <svg viewBox="0 0 100 112" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {[[6, 7, 3.2, GOLD], [94, 7, 2.4, BRASS], [5, 105, 2.4, BRASS], [94, 105, 3.2, GOLD], [50, 4.5, 1.8, GOLD], [50, 107.5, 1.8, BRASS]].map(([x, y, r, R], i) => (
          <g key={i} style={{ transformOrigin: x + "px " + y + "px", transformBox: "view-box", animation: anim(lite, "pbTwinkle " + (3 + i * 0.4) + "s ease-in-out " + i * 0.55 + "s infinite") }}>
            <FacetDiamond cx={x} cy={y} r={r} R={R} />
          </g>
        ))}
      </svg>
    </div>
  );
}

const PAWN_W = { l1: "#FFFDF6", l2: "#F2E8D5", l3: "#DCCBA8", l4: "#C9B58C", base: "#A8946A", hi: "#FFFFFF", gem: "#FFFFFF" };
const PAWN_B = facetRamp("#3A2A18");
export function GamePostBackdrop() {
  const lite = isLite();
  return (
    <div aria-hidden="true" className="pb-anim" style={{ ...layer, overflow: "hidden" }}>
      <style>{CSS}</style>
      {/* 펠트 결 — 아주 가는 사선 무늬 */}
      <div style={{ ...layer, opacity: 0.12, backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,.35) 0 1px, transparent 1px 4px)" }} />
      {/* 대회장 조명 — 보드 위를 비추며 숨 쉬듯 밝아졌다 어두워진다 */}
      <div style={{ ...layer, background: "radial-gradient(52% 44% at 50% 48%, rgba(255,244,210,.22), transparent 72%)", animation: anim(lite, "pbBreath 5s ease-in-out infinite") }} />
      <div style={{ ...layer, boxShadow: "inset 0 0 60px rgba(0,0,0,.55)" }} />
      <svg viewBox="0 0 100 112" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <FacetPawn x={6.5} y={104} s={9} R={PAWN_W} />
        <FacetPawn x={93.5} y={104} s={9} R={PAWN_B} />
      </svg>
    </div>
  );
}
