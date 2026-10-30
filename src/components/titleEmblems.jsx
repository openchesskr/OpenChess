// (v0.6.8) 칭호 엠블럼 — 오프닝 칭호는 그 오프닝을 상징하는 국기나 이니셜을 마름모 안에 그려 계열마다 한눈에 구분되게 한다.
//  (v0.6.9) 인디언 디펜스 계열은 모두 인도 국기를 쓴다. (v0.7.1) 글자 이니셜 대신 오프닝 성격을 담은 픽토그램.
//  · 이미지 파일·폰트 없이 SVG로 그린다(100×100 좌표, 마름모 안쪽 영역 12~88에 잘려 보임).
////  새 오프닝 계열을 더하면 여기에도 한 줄 추가(check-titles가 확인).
import React from "react";

const stripesV = (cols) => cols.map((c, i) => <rect key={i} x={(100 / cols.length) * i} y="0" width={100 / cols.length + 0.5} height="100" fill={c} />);
const stripesH = (cols, ws) => { let y = 0; return cols.map((c, i) => { const h = ws[i]; const el = <rect key={i} x="0" y={y} width="100" height={h + 0.5} fill={c} />; y += h; return el; }); };

// (v0.7.1 디자인, 사용자 요청 "아이콘을 더 독창적으로") 글자 이니셜(CK·KG…) 대신 그 오프닝의 성격을 담은 픽토그램을 그린다 — 기물 실루엣(폰·룩·퀸 왕관·비숍)을 기본 부품으로 쓰고,
//  화살표·방패·대각선으로 오프닝 아이디어를 말한다. 각 그림은 (색) => JSX 함수라서 같은 그림을 어두운 그림자색과 밝은 본색으로 두 번 그려 도드라지게 한다(예전 글자 엠블럼과 같은 깊이감).
//  100×100 좌표, 마름모 안쪽(12~88)에서 잘리지 않게 가운데 ±28 안에 둔다.
const PAWN = "M-.15 -.33 Q0 -.2 .15 -.33 L.11 -.1 Q.3 .12 .33 .42 L-.33 .42 Q-.3 .12 -.11 -.1 Z";
const Pawn = ({ x, y, s, c, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} fill={c}>
    <circle cx="0" cy="-.56" r=".2" /><path d={PAWN} /><rect x="-.4" y=".42" width=".8" height=".14" rx=".05" />
  </g>
);
const Rook = ({ x, y, s, c, cut }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
    <path d="M-.34 -.52 H-.2 V-.4 H-.07 V-.52 H.07 V-.4 H.2 V-.52 H.34 V-.22 L.24 -.12 V.2 L.36 .34 V.54 H-.36 V.34 L-.24 .2 V-.12 L-.34 -.22 Z" />
    {cut && <path d="M-.2 .0 H.2 M-.2 .2 H.2" stroke={cut} strokeWidth=".06" strokeLinecap="round" fill="none" />}
  </g>
);
const Crown = ({ x, y, s, c, cut }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
    <path d="M-.44 .26 L-.5 -.3 L-.24 -.08 L0 -.46 L.24 -.08 L.5 -.3 L.44 .26 Z" /><rect x="-.44" y=".32" width=".88" height=".13" rx=".05" />
    {[[-.5, -.34], [0, -.5], [.5, -.34]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r=".08" />)}
    {cut && <path d="M-.2 .1 H.2" stroke={cut} strokeWidth=".06" strokeLinecap="round" />}
  </g>
);
const Bishop = ({ x, y, s, c, cut }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
    <circle cx="0" cy="-.6" r=".08" /><path d="M0 -.5 C.26 -.28 .34 -.05 .2 .14 L.32 .3 H-.32 L-.2 .14 C-.34 -.05 -.26 -.28 0 -.5 Z" /><rect x="-.4" y=".34" width=".8" height=".14" rx=".05" />
    {cut && <path d="M-.08 -.2 L.1 -.04" stroke={cut} strokeWidth=".075" strokeLinecap="round" />}
  </g>
);
const Arrow = ({ d, head, c, w = 5 }) => (
  <g stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none"><path d={d} /><path d={head} /></g>
);
const GLYPHS = {
  // 카로칸: 무너지지 않는 요새 — 벽돌 줄무늬가 든 룩.
  carokann: (c, k) => <Rook x={50} y={51} s={46} c={c} cut={k} />,
  // 킹스 갬빗: 왕관 아래 미끼로 내미는 폰.
  kingsgambit: (c, k) => <g><Crown x={50} y={33} s={30} c={c} cut={k} /><Pawn x={50} y={66} s={25} c={c} rot={-10} /></g>,
  // 베노니: 한쪽으로 치우쳐 솟아오르는 비대칭 폰 사슬.
  benoni: (c) => <g><Pawn x={34} y={65} s={16} c={c} /><Pawn x={50} y={54} s={20} c={c} /><Pawn x={66} y={43} s={24} c={c} /></g>,
  // 그륀펠트: 중앙을 내주고 양쪽 날개에서 화살을 겨눈다.
  grunfeld: (c) => <g><rect x="39" y="56" width="22" height="22" rx="3" fill={c} /><Arrow d="M23 28 L40 46" head="M31 44 L41 47 L38 37" c={c} /><Arrow d="M77 28 L60 46" head="M69 44 L59 47 L62 37" c={c} /></g>,
  // 퀸스 갬빗: 퀸 쪽 왕관과 내주는 c-폰.
  queensgambit: (c, k) => <g><Crown x={50} y={42} s={44} c={c} cut={k} /><Pawn x={50} y={76} s={15} c={c} /></g>,
  // 피르츠: 긴 대각선에 놓은 피앙케토 비숍.
  pirc: (c, k) => <g><path d="M21 76 L79 24" stroke={c} strokeWidth="3.4" strokeLinecap="round" strokeDasharray="1 7" fill="none" /><Bishop x={50} y={52} s={46} c={c} cut={k} /></g>,
  // 알레킨: 나이트의 L자 도약이 폰을 몰아낸다.
  alekhine: (c) => <g><circle cx="29" cy="74" r="5.5" fill={c} /><Arrow d="M29 66 V42 H52" head="M45 34 L54 42 L45 50" c={c} /><Pawn x={68} y={46} s={26} c={c} /></g>,
  // 필리도어: 폰이 지키는 방패.
  philidor: (c, k) => <g><path d="M50 22 L75 30 V51 C75 66 63 75 50 82 C37 75 25 66 25 51 V30 Z" fill={c} /><Pawn x={50} y={54} s={25} c={k} /></g>,
};
const glyph = (key, bgA, bgB) => ({
  bg: (gid) => <><defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bgA} /><stop offset="1" stopColor={bgB} /></linearGradient></defs><rect width="100" height="100" fill={`url(#${gid})`} /></>,
  glyph: key,
});
// 본색(fill)·그림자·파낸 선(cut: 배경색에 가깝게)으로 두 번 그린다.
function Pictogram({ glyphKey, fill, cut }) {
  const draw = GLYPHS[glyphKey];
  return (
    <g>
      <g transform="translate(1.2 1.9)" opacity=".55">{draw("#000", "#000")}</g>
      {draw(fill, cut)}
    </g>
  );
}

// 인디언 디펜스 계열(King's·Nimzo-·Queen's Indian)이 함께 쓰는 인도 국기
const INDIA = { flag: <>{stripesH(["#FF9933", "#F6F6F6", "#138808"], [33.4, 33.3, 33.3])}<circle cx="50" cy="50" r="10" fill="none" stroke="#000080" strokeWidth="2.2" />{Array.from({ length: 12 }, (_, i) => <line key={i} x1="50" y1="50" x2={50 + 10 * Math.cos((i * Math.PI) / 6)} y2={50 + 10 * Math.sin((i * Math.PI) / 6)} stroke="#000080" strokeWidth="1.2" />)}</> };

export const OPENING_EMBLEMS = {
  // 국기
  italian: { flag: <>{stripesV(["#009246", "#F1F2F1", "#CE2B37"])}</> },
  ruylopez: { flag: <>{stripesH(["#AA151B", "#F1BF00", "#AA151B"], [36, 28, 36])}</> },
  scotch: { flag: <><rect width="100" height="100" fill="#0065BD" /><path d="M0 0L100 100M100 0L0 100" stroke="#fff" strokeWidth="15" /></> },
  sicilian: { flag: <><rect width="100" height="100" fill="#F2C200" /><path d="M0 0H100L0 100Z" fill="#D8202A" /><circle cx="50" cy="50" r="9" fill="#F4E3C0" /><g stroke="#7A1A1A" strokeWidth="4.5" strokeLinecap="round" fill="none"><path d="M50 50 L50 30" /><path d="M50 50 L67 60" /><path d="M50 50 L33 60" /></g></> },
  french: { flag: <>{stripesV(["#0055A4", "#F4F4F4", "#EF4135"])}</> },
  vienna: { flag: <>{stripesH(["#ED2939", "#F6F6F6", "#ED2939"], [33.4, 33.3, 33.3])}</> },
  catalan: { flag: <><rect width="100" height="100" fill="#FCDD09" />{[1, 3, 5, 7].map((i) => <rect key={i} x="0" y={(100 / 9) * i} width="100" height={100 / 9 + 0.4} fill="#DA121A" />)}</> },
  london: { flag: <><rect width="100" height="100" fill="#F6F6F6" /><rect x="41" y="0" width="18" height="100" fill="#CE1124" /><rect x="0" y="41" width="100" height="18" fill="#CE1124" /></> },
  english: { flag: <><rect width="100" height="100" fill="#1F3A8A" /><path d="M0 0L100 100M100 0L0 100" stroke="#fff" strokeWidth="18" /><path d="M0 0L100 100M100 0L0 100" stroke="#CE1124" strokeWidth="7" /><rect x="38" y="0" width="24" height="100" fill="#fff" /><rect x="0" y="38" width="100" height="24" fill="#fff" /><rect x="43" y="0" width="14" height="100" fill="#CE1124" /><rect x="0" y="43" width="100" height="14" fill="#CE1124" /></> },
  reti: { flag: <><rect width="100" height="50" fill="#F6F6F6" /><rect y="50" width="100" height="50" fill="#D7141A" /><path d="M0 0L55 50L0 100Z" fill="#11457E" /></> },
  evans: { flag: <><rect width="100" height="50" fill="#F6F6F6" /><rect y="50" width="100" height="50" fill="#00B140" /><circle cx="50" cy="50" r="17" fill="#D30731" /><path d="M40 56 L50 36 L60 56 L50 50Z" fill="#F6E3A6" /></> },
  danish: { flag: <><rect width="100" height="100" fill="#C8102E" /><rect x="30" y="0" width="14" height="100" fill="#fff" /><rect x="0" y="43" width="100" height="14" fill="#fff" /></> },
  scandinavian: { flag: <><rect width="100" height="100" fill="#006AA7" /><rect x="30" y="0" width="14" height="100" fill="#FECC02" /><rect x="0" y="43" width="100" height="14" fill="#FECC02" /></> },
  dutch: { flag: <>{stripesH(["#AE1C28", "#F6F6F6", "#21468B"], [33.4, 33.3, 33.3])}</> },
  slav: { flag: <>{stripesH(["#1E4FA3", "#F6F6F6", "#D52B1E"], [33.4, 33.3, 33.3])}</> },
  kingsindian: INDIA,
  petrov: { flag: <>{stripesH(["#F6F6F6", "#0039A6", "#D52B1E"], [33.4, 33.3, 33.3])}</> },
  // 픽토그램(v0.7.1 — 예전 이니셜을 대체)
  carokann: glyph("carokann", "#3A3A52", "#17171F"),
  kingsgambit: glyph("kingsgambit", "#8A2A3A", "#2E0A12"),
  benoni: glyph("benoni", "#2A6A86", "#0E2A38"),
  grunfeld: glyph("grunfeld", "#2A7A52", "#0C2E1E"),
  queensgambit: glyph("queensgambit", "#7A3E8A", "#2A1030"),
  pirc: glyph("pirc", "#6A3A8A", "#22102E"),
  alekhine: glyph("alekhine", "#2A4A7A", "#0E1A30"),
  nimzo: INDIA,
  queensindian: INDIA,
  philidor: glyph("philidor", "#4A4A6A", "#181826"),
};

/** 마름모 안에 들어가는 엠블럼 본체(100×100 svg 안에서 쓴다). clipId는 호출부가 고유하게 준다. */
export function OpeningEmblem({ seriesKey, clipId, textFill }) {
  const e = OPENING_EMBLEMS[seriesKey]; if (!e) return null;
  return (
    <g>
      <defs><clipPath id={clipId}><path d="M50 12 L88 50 L50 88 L12 50 Z" /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {e.flag || e.bg(clipId + "m")}
        {e.glyph && <Pictogram glyphKey={e.glyph} fill={textFill} cut={e.cutColor || "rgba(20,11,5,.75)"} />}
      </g>
    </g>
  );
}
