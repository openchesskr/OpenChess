// (v0.7.8, 사용자 요청) 소셜 탭 퍼즐 게시물의 테마별 배경 — 유산 게시물(남색 바탕 + 금색 액자)처럼, 퍼즐도 보드를 조금 줄이고 뒤에 전용 배경과
// 배경 애니메이션을 깐다. 테마마다 그 테마를 상징하는 그림을 따로 그린다(첫 번째 테마 기준, sortedThemesOf 순서).
//   게임 끝내기(checkmate)  : 짙은 자주 바탕 · 천천히 도는 햇살 · 위쪽 가운데 왕관 · 네 귀퉁이 보석이 번갈아 반짝임
//   기물 희생하기(sacrifice) : 짙은 청록 바탕 · 깨진 보석 파편이 아래에서 위로 떠오르며 사라짐(내준 기물 = 빛나는 파편)
//   우위 점하기(advantage)  : 짙은 초록 바탕 · 오른쪽 위를 향한 꺾인 화살표들이 비스듬히 흘러감(형세가 기운다)
//   실수 응징하기(punish)    : 짙은 주황 바탕 · 귀퉁이 조준경이 맥동하고 훑는 띠가 위에서 아래로(실수를 겨눈다)
// 그림은 아이콘 규칙(윤곽선 없음·면 분할·왼쪽 위 광원·하이라이트 하나)을 따르는 facetIcons 부품으로만 그린다 — scripts/check-facet-icons.mjs ZONES 등록.
// 애니메이션은 transform·opacity만 쓴다(컴포지터 처리). 좌표계는 viewBox 100×112(게시물 미디어 칸 비율과 같음).
import { FacetCrown, FacetDiamond, FacetArrow, FacetCrosshair, facetRamp, GOLD } from "./facetIcons.jsx";
import { T } from "../lib/theme.js";

export const PUZZLE_MEDIA_RATIO = "100 / 112";   // 게시물 미디어 칸 — 예전 정사각형보다 위아래로 조금 길게
const ACCENT = { checkmate: T.only, sacrifice: T.brilliant, advantage: T.inaccuracy, punish: T.blunder };
const BG = {
  checkmate: "radial-gradient(120% 90% at 30% 15%, #4A1630 0%, #2A0C1C 55%, #14060E 100%)",
  sacrifice: "radial-gradient(120% 90% at 30% 15%, #11504C 0%, #0A2F2D 55%, #051A19 100%)",
  advantage: "radial-gradient(120% 90% at 30% 15%, #2E4A16 0%, #1A2D0C 55%, #0D1806 100%)",
  punish: "radial-gradient(120% 90% at 30% 15%, #5A2A0C 0%, #341706 55%, #1C0B03 100%)",
};
const CSS = "@keyframes pzbSpin{to{transform:rotate(360deg)}}"
  + "@keyframes pzbTwinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.08)}}"
  + "@keyframes pzbRise{0%{transform:translateY(0) rotate(0);opacity:0}15%{opacity:.95}100%{transform:translateY(-118px) rotate(70deg);opacity:0}}"
  + "@keyframes pzbDrift{0%{transform:translate(-22px,22px);opacity:0}20%{opacity:.9}80%{opacity:.9}100%{transform:translate(26px,-26px);opacity:0}}"
  + "@keyframes pzbPulse{0%,100%{transform:scale(.86);opacity:.45}50%{transform:scale(1.12);opacity:1}}"
  + "@keyframes pzbScan{0%{transform:translateY(-12%)}100%{transform:translateY(112%)}}";
const anim = (name, dur, delay = 0, extra = "") => ({ animation: name + " " + dur + "s " + (extra || "ease-in-out") + " " + delay + "s infinite", transformBox: "fill-box", transformOrigin: "center" });

export function puzzleBackdropTheme(themes) { const k = themes && themes[0]; return ACCENT[k] ? k : "punish"; }
export function puzzleBackdropBg(theme) { return BG[theme] || BG.punish; }

/* 미디어 칸 전체를 덮는 배경 층(보드 뒤). theme: checkmate | sacrifice | advantage | punish */
export function PuzzleThemeBackdrop({ theme }) {
  const R = facetRamp(ACCENT[theme] || ACCENT.punish);
  return (
    <svg aria-hidden="true" viewBox="0 0 100 112" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <style>{CSS}</style>
      {theme === "checkmate" && <CheckmateArt R={R} />}
      {theme === "sacrifice" && <SacrificeArt R={R} />}
      {theme === "advantage" && <AdvantageArt R={R} />}
      {(theme === "punish" || !ACCENT[theme]) && <PunishArt R={R} />}
    </svg>
  );
}
function CheckmateArt({ R }) {
  // 햇살: 끝이 가는 면 12장(밝은 면·어두운 면 번갈아)이 보드 중심을 축으로 천천히 돈다
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2, b = a + 0.16, L = 90;
    return <path key={i} d={"M50 56 L" + (50 + Math.cos(a) * L).toFixed(1) + " " + (56 + Math.sin(a) * L).toFixed(1) + " L" + (50 + Math.cos(b) * L).toFixed(1) + " " + (56 + Math.sin(b) * L).toFixed(1) + "Z"} fill={i % 2 ? R.l3 : R.l1} fillOpacity=".09" />;
  });
  return (
    <>
      <g style={{ animation: "pzbSpin 60s linear infinite", transformOrigin: "50px 56px" }}>{rays}</g>
      <g style={anim("pzbTwinkle", 3.2)}><FacetCrown x={50} y={10} s={13} R={GOLD} /></g>
      {[[9, 12, 0], [91, 12, 0.8], [9, 100, 1.6], [91, 100, 2.4]].map(([x, y, d], i) => <g key={i} style={anim("pzbTwinkle", 3.2, d)}><FacetDiamond cx={x} cy={y} r={3.2} R={R} gem={i === 0} /></g>)}
    </>
  );
}
function SacrificeArt({ R }) {
  const shards = [[12, 108, 0, 3.2], [28, 112, 1.4, 2.4], [72, 110, 0.7, 2.8], [88, 108, 2.1, 3.4], [50, 114, 2.8, 2.2], [20, 114, 3.6, 2], [80, 114, 4.4, 2.6]];
  return (
    <>
      {shards.map(([x, y, d, r], i) => <g key={i} style={anim("pzbRise", 5.6, d, "linear")}><FacetDiamond cx={x} cy={y} r={r} R={R} gem={i === 0} /></g>)}
      {[[8, 10], [92, 10]].map(([x, y], i) => <g key={"c" + i} style={anim("pzbTwinkle", 2.8, i * 1.4)}><FacetDiamond cx={x} cy={y} r={2.6} R={GOLD} gem={false} /></g>)}
    </>
  );
}
function AdvantageArt({ R }) {
  const arrows = [[6, 98, 0], [30, 104, 1.2], [62, 100, 2.4], [80, 30, 0.6], [4, 40, 1.8], [84, 78, 3]];
  return (
    <>
      {arrows.map(([x, y, d], i) => (
        <g key={i} style={anim("pzbDrift", 4.8, d, "linear")}>
          <FacetArrow pts={[[x, y], [x + 6, y - 2], [x + 12, y - 9]]} w={2.6} head={5.2} R={i === 0 ? GOLD : R} />
        </g>
      ))}
    </>
  );
}
function PunishArt({ R }) {
  return (
    <>
      <rect x="0" y="0" width="100" height="6" fill={R.hi} fillOpacity=".08" style={{ animation: "pzbScan 3.6s linear infinite" }} />
      {[[10, 11, 0], [90, 11, 0.9], [10, 101, 1.8], [90, 101, 2.7]].map(([x, y, d], i) => (
        <g key={i} style={anim("pzbPulse", 3.6, d)}>
          <g transform={"translate(" + (x - 6) + " " + (y - 6) + ")"}><FacetCrosshair size={12} color={i === 0 ? GOLD.l1 : R.l1} /></g>
        </g>
      ))}
    </>
  );
}
