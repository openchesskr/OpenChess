// (v0.7.9, 사용자 요청) OpenChess 기물 아이콘 6종(폰·나이트·비숍·룩·퀸·킹) + 8×8 체스보드 아이콘 — 사이트 아이콘 규칙(CLAUDE.md 파셋)에 맞춰 새로 그렸다.
//  · 24×24 좌표. 윤곽선 없이 채운 면만, 빛은 왼쪽 위 — 가운데 세로선 왼쪽이 밝고(l1·l2) 오른쪽이 어둡다(l3·l4). 받침·밑단은 가장 어두운 톤(base).
//  · 하이라이트는 기물마다 한 점(hi). 12~16px에서도 뭉개지지 않게 면은 4~6개, 면끼리 틈 없이 맞닿는다.
//  · 레슨 아이콘(app/lessons.jsx LessonGlyph)·업적 아이콘(common.jsx SeriesGlyph 등)이 이 부품을 조합해 쓴다.
import { GOLD, facetRamp } from "./facetIcons.jsx";

export const IVORY = { hi: "#FFFFFF", l1: "#FFF9EC", l2: "#F2E6CC", l3: "#DCC7A0", l4: "#BEA477", base: "#8C7350", gem: "#FFFFFF" };
export const EBONY = { hi: "#E9C987", l1: "#6B5640", l2: "#54402C", l3: "#3E2E1F", l4: "#2C2016", base: "#1A120B", gem: "#E9C987" };
export { GOLD, facetRamp };

const P = (pts) => "M" + pts.map((p) => p[0] + " " + p[1]).join("L") + "Z";
const mirror = (pts) => pts.map(([x, y]) => [24 - x, y]);

// 공통 받침 — 칼라(목) 아래 두 단. 왼쪽 반 밝게, 오른쪽 반 어둡게.
function Base({ R, top = 17.2 }) {
  const L1 = [[12, top], [7.2, top], [6.8, top + 1.2], [12, top + 1.2]];
  const L2 = [[12, top + 1.2], [5.8, top + 1.2], [5.2, 21], [12, 21]];
  return <>
    <path d={P(L1)} fill={R.l2} /><path d={P(mirror(L1))} fill={R.l4} />
    <path d={P(L2)} fill={R.l3} /><path d={P(mirror(L2))} fill={R.base} />
  </>;
}
// 몸통(칼라 아래에서 받침까지 벌어지는 원뿔) — top: 시작 높이, w0: 위 반폭, w1: 아래 반폭
function Body({ R, top, w0, w1, bottom = 17.2 }) {
  const L = [[12, top], [12 - w0, top], [12 - w0 - (w1 - w0) * 0.35, (top + bottom) / 2 + 1], [12 - w1, bottom], [12, bottom]];
  return <><path d={P(L)} fill={R.l2} /><path d={P(mirror(L))} fill={R.l4} /></>;
}
// 칼라 띠
function Collar({ R, y, h = 1.2, w = 3.6 }) {
  const L = [[12, y], [12 - w, y], [12 - w + 0.3, y + h], [12, y + h]];
  return <><path d={P(L)} fill={R.l1} /><path d={P(mirror(L))} fill={R.l3} /></>;
}

const SHAPES = {
  P: (R) => <>
    <Base R={R} /><Body R={R} top={11.4} w0={2.3} w1={4.6} />
    <Collar R={R} y={10.2} w={3.3} />
    <path d="M12 3.8 A3.25 3.25 0 0 0 12 10.3 Z" fill={R.l1} /><path d="M12 3.8 A3.25 3.25 0 0 1 12 10.3 Z" fill={R.l3} />
    <path d={P([[9.7, 6.1], [10.5, 4.9], [11, 6.2]])} fill={R.hi} />
  </>,
  R: (R) => <>
    <Base R={R} /><Body R={R} top={9.4} w0={3.3} w1={4.4} />
    <path d={P([[6.8, 3.4], [8.9, 3.4], [8.9, 5.6], [6.8, 5.6]])} fill={R.l1} />
    <path d={P([[10.9, 3.4], [12, 3.4], [12, 5.6], [10.9, 5.6]])} fill={R.l2} /><path d={P([[12, 3.4], [13.1, 3.4], [13.1, 5.6], [12, 5.6]])} fill={R.l3} />
    <path d={P([[15.1, 3.4], [17.2, 3.4], [17.2, 5.6], [15.1, 5.6]])} fill={R.l4} />
    <path d={P([[12, 5.6], [6.8, 5.6], [6.8, 8.2], [8.7, 9.4], [12, 9.4]])} fill={R.l1} />
    <path d={P(mirror([[12, 5.6], [6.8, 5.6], [6.8, 8.2], [8.7, 9.4], [12, 9.4]]))} fill={R.l3} />
    <path d={P([[7.3, 3.9], [8.4, 3.9], [7.3, 5]])} fill={R.hi} />
  </>,
  B: (R) => <>
    <Base R={R} /><Body R={R} top={13.8} w0={2.4} w1={4.4} />
    <Collar R={R} y={12.6} w={3.4} />
    <path d="M12 4.6 C8.5 7 7.4 10.3 9.2 12.6 L12 12.6 Z" fill={R.l1} /><path d="M12 4.6 C15.5 7 16.6 10.3 14.8 12.6 L12 12.6 Z" fill={R.l3} />
    <path d={P([[10.6, 9.2], [13.9, 6.6], [14.4, 7.4], [11.2, 9.9]])} fill={R.base} />
    <path d={P([[12, 1.9], [13.1, 3.1], [12, 4.3], [10.9, 3.1]])} fill={R.l2} /><path d={P([[12, 1.9], [13.1, 3.1], [12, 4.3]])} fill={R.l4} />
    <path d={P([[9.6, 9.4], [10.2, 7.6], [10.9, 8.1]])} fill={R.hi} />
  </>,
  N: (R) => <>
    <Base R={R} />
    {/* 얼굴(밝음) · 주둥이 · 목 앞 · 갈기(어두움) · 가슴 */}
    <path d={P([[10.6, 5.2], [13.2, 2.6], [13.6, 7.6], [9.2, 9.4], [6.4, 8.4]])} fill={R.l1} />
    <path d={P([[6.4, 8.4], [9.2, 9.4], [8.6, 11.6], [6.2, 11.4], [5.3, 9.8]])} fill={R.l2} />
    <path d={P([[9.2, 9.4], [13.6, 7.6], [14.6, 12.4], [11.4, 11.2], [8.6, 11.6]])} fill={R.l2} />
    <path d={P([[13.2, 2.6], [14.8, 4.3], [17.7, 6.3], [18.7, 10.5], [18.5, 14.6], [14.6, 12.4], [13.6, 7.6]])} fill={R.l4} />
    <path d={P([[11.4, 11.2], [14.6, 12.4], [18.5, 14.6], [17.9, 17.2], [7.4, 17.2], [8.8, 14.2]])} fill={R.l3} />
    <path d={P([[10.3, 6.6], [11.2, 6.1], [11, 7.1]])} fill={R.base} />
    <path d={P([[11.3, 4.6], [12.6, 3.4], [12.2, 5.2]])} fill={R.hi} />
  </>,
  Q: (R) => <>
    <Base R={R} /><Body R={R} top={11.4} w0={2.6} w1={4.6} />
    <Collar R={R} y={10.2} w={3.6} />
    <path d={P([[6.4, 4.9], [9.3, 8.1], [12, 3.7], [12, 10.2], [8.4, 10.2]])} fill={R.l1} />
    <path d={P([[12, 3.7], [14.7, 8.1], [17.6, 4.9], [15.6, 10.2], [12, 10.2]])} fill={R.l3} />
    {[[6.4, 4.4, 0.95], [9.2, 3.4, 0.95], [12, 2.7, 1.05], [14.8, 3.4, 0.95], [17.6, 4.4, 0.95]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i < 2 ? R.l2 : i === 2 ? R.gem : R.l4} />)}
    <path d={P([[8.9, 8.6], [10.3, 6.6], [10.7, 8.4]])} fill={R.hi} />
  </>,
  K: (R) => <>
    <Base R={R} /><Body R={R} top={11.4} w0={2.6} w1={4.6} />
    <Collar R={R} y={10.2} w={3.8} />
    <path d="M12 5.4 Q8.6 5.4 7.2 6.4 L8.4 10.2 H12 Z" fill={R.l1} /><path d="M12 5.4 Q15.4 5.4 16.8 6.4 L15.6 10.2 H12 Z" fill={R.l3} />
    {/* 십자 — 세로대·가로대 모두 왼쪽 밝게 */}
    <path d={P([[11.2, 1.4], [12, 1.4], [12, 5.4], [11.2, 5.4]])} fill={R.l1} /><path d={P([[12, 1.4], [12.8, 1.4], [12.8, 5.4], [12, 5.4]])} fill={R.l3} />
    <path d={P([[9.8, 2.6], [11.2, 2.6], [11.2, 3.8], [9.8, 3.8]])} fill={R.l2} /><path d={P([[12.8, 2.6], [14.2, 2.6], [14.2, 3.8], [12.8, 3.8]])} fill={R.l4} />
    <path d={P([[8.6, 7.2], [10.2, 6.1], [10.4, 7.4]])} fill={R.hi} />
  </>,
};
export const PIECE_TYPES = ["P", "N", "B", "R", "Q", "K"];

/** 24×24 좌표의 기물 그림(<g>). 다른 SVG 안에 넣을 때 — transform으로 옮기고 키운다. */
export function FacetPieceShape({ type, R = IVORY }) {
  const f = SHAPES[String(type || "").toUpperCase()];
  return f ? <g>{f(R)}</g> : null;
}
/** 단독 기물 아이콘. color: "w"(상아)·"b"(흑단)·"gold"·램프 객체 */
export function PieceIcon({ type, size = 24, color = "w", style, title }) {
  const R = typeof color === "object" ? color : color === "b" ? EBONY : color === "gold" ? GOLD : IVORY;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: "block", overflow: "visible", ...style }}>
      <FacetPieceShape type={type} R={R} />
    </svg>
  );
}

/** 8×8 체스보드 — 네 테두리 면(위 밝음·왼쪽·오른쪽·아래 가장 어두움) + 64칸 + 왼쪽 위 모서리 하이라이트. */
export function FacetBoardShape({ light = "#EED9AE", dark = "#8E5E36", R = facetRamp("#8A6440") }) {
  const cells = [];
  const s = 18 / 8;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) cells.push(<rect key={r * 8 + c} x={3 + c * s} y={3 + r * s} width={s + 0.02} height={s + 0.02} fill={dark} />);
  return <g>
    <path d={P([[2, 2], [22, 2], [21, 3], [3, 3]])} fill={R.l1} />
    <path d={P([[2, 2], [3, 3], [3, 21], [2, 22]])} fill={R.l2} />
    <path d={P([[22, 2], [22, 22], [21, 21], [21, 3]])} fill={R.l4} />
    <path d={P([[2, 22], [3, 21], [21, 21], [22, 22]])} fill={R.base} />
    <rect x={3} y={3} width={18} height={18} fill={light} />
    {cells}
    <path d={P([[2, 2], [4.2, 2], [2, 4.2]])} fill={R.hi} />
  </g>;
}
export function BoardIcon({ size = 24, style, title, light, dark }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: "block", ...style }}>
      <FacetBoardShape light={light} dark={dark} />
    </svg>
  );
}
