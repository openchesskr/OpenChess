// (v0.6.8) 칭호 엠블럼 — 오프닝 칭호는 그 오프닝을 상징하는 국기나 이니셜을 마름모 안에 그려 계열마다 한눈에 구분되게 한다.
//  · 이미지 파일·폰트 없이 SVG로 그린다(100×100 좌표, 마름모 안쪽 영역 12~88에 잘려 보임).
//  · 이니셜은 폰트 글자가 아니라 직선으로 꺾어 만든 각진 서체(끝에 작은 세리프 획)를 직접 그린 것이다(LETTERS).
//  새 오프닝 계열을 더하면 여기에도 한 줄 추가(check-titles가 확인).
import React from "react";

const stripesV = (cols) => cols.map((c, i) => <rect key={i} x={(100 / cols.length) * i} y="0" width={100 / cols.length + 0.5} height="100" fill={c} />);
const stripesH = (cols, ws) => { let y = 0; return cols.map((c, i) => { const h = ws[i]; const el = <rect key={i} x="0" y={y} width="100" height={h + 0.5} fill={c} />; y += h; return el; }); };

// ── 각진 서체: 0~1 상자 안의 꺾은선(획). 끝에 세리프(짧은 가로·세로 획)가 붙는다. ──
const LETTERS = {
  A: [[[.05, .95], [.5, .05], [.95, .95]], [[.25, .62], [.75, .62]]],
  B: [[[.14, .05], [.14, .95]], [[.14, .05], [.7, .05], [.92, .27], [.68, .5], [.14, .5]], [[.68, .5], [.86, .5], [.94, .74], [.7, .95], [.14, .95]]],
  C: [[[.92, .1], [.5, .1], [.1, .5], [.5, .9], [.92, .9]], [[.92, .1], [.92, .3]], [[.92, .9], [.92, .7]]],
  D: [[[.14, .05], [.14, .95]], [[.14, .05], [.62, .05], [.92, .32], [.92, .68], [.62, .95], [.14, .95]]],
  F: [[[.2, .05], [.2, .95]], [[.2, .05], [.92, .05], [.92, .25]], [[.2, .5], [.7, .5]], [[.04, .95], [.36, .95]]],
  G: [[[.92, .14], [.5, .08], [.1, .5], [.5, .92], [.9, .88], [.9, .55], [.55, .55]], [[.92, .14], [.92, .32]]],
  H: [[[.14, .05], [.14, .95]], [[.86, .05], [.86, .95]], [[.14, .5], [.86, .5]]],
  I: [[[.5, .05], [.5, .95]], [[.25, .05], [.75, .05]], [[.25, .95], [.75, .95]]],
  K: [[[.18, .05], [.18, .95]], [[.92, .05], [.18, .55], [.92, .95]], [[.02, .05], [.34, .05]], [[.02, .95], [.34, .95]]],
  N: [[[.1, .95], [.1, .05], [.9, .95], [.9, .05]], [[0, .95], [.22, .95]], [[.78, .05], [1, .05]]],
  P: [[[.16, .05], [.16, .95]], [[.16, .05], [.72, .05], [.92, .27], [.7, .52], [.16, .52]], [[0, .95], [.32, .95]]],
  Q: [[[.5, .06], [.92, .3], [.92, .7], [.5, .94], [.08, .7], [.08, .3], [.5, .06]], [[.6, .72], [.98, 1]]],
};
// 두 글자 이니셜을 마름모 가운데(50,50)에 놓는다. 글자는 살짝 기울여(이탤릭) 서체 느낌을 낸다.
function Monogram({ letters, fill }) {
  const W = 22, Hh = 27, GAP = 6, SLANT = 0.2, SW = 4.4;
  const x0 = 50 - (letters.length * W + (letters.length - 1) * GAP) / 2, y0 = 50 - Hh / 2;
  const path = (L, ox) => LETTERS[L].map((pl) => "M" + pl.map(([px, py]) => (ox + px * W + (0.5 - py) * SLANT * Hh).toFixed(2) + " " + (y0 + py * Hh).toFixed(2)).join(" L")).join(" ");
  const d = letters.split("").map((L, i) => path(L, x0 + i * (W + GAP))).join(" ");
  return (
    <g fill="none" strokeLinejoin="miter" strokeLinecap="square">
      <path d={d} stroke="rgba(0,0,0,.5)" strokeWidth={SW + 2.2} transform="translate(.8 1.1)" />
      <path d={d} stroke={fill} strokeWidth={SW} />
    </g>
  );
}
const mono = (letters, bgA, bgB) => ({
  bg: (gid) => <><defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bgA} /><stop offset="1" stopColor={bgB} /></linearGradient></defs><rect width="100" height="100" fill={`url(#${gid})`} /></>,
  letters,
});

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
  kingsindian: { flag: <>{stripesH(["#FF9933", "#F6F6F6", "#138808"], [33.4, 33.3, 33.3])}<circle cx="50" cy="50" r="10" fill="none" stroke="#000080" strokeWidth="2.2" />{Array.from({ length: 12 }, (_, i) => <line key={i} x1="50" y1="50" x2={50 + 10 * Math.cos((i * Math.PI) / 6)} y2={50 + 10 * Math.sin((i * Math.PI) / 6)} stroke="#000080" strokeWidth="1.2" />)}</> },
  petrov: { flag: <>{stripesH(["#F6F6F6", "#0039A6", "#D52B1E"], [33.4, 33.3, 33.3])}</> },
  // 이니셜(직접 그린 각진 서체)
  carokann: mono("CK", "#3A3A52", "#17171F"),
  kingsgambit: mono("KG", "#8A2A3A", "#2E0A12"),
  benoni: mono("BN", "#2A6A86", "#0E2A38"),
  grunfeld: mono("GF", "#2A7A52", "#0C2E1E"),
  queensgambit: mono("QG", "#7A3E8A", "#2A1030"),
  pirc: mono("PD", "#6A3A8A", "#22102E"),
  alekhine: mono("AD", "#2A4A7A", "#0E1A30"),
  nimzo: mono("NI", "#2A6A86", "#0C2230"),
  queensindian: mono("QI", "#2A6A6A", "#0C2828"),
  philidor: mono("PH", "#4A4A6A", "#181826"),
};

/** 마름모 안에 들어가는 엠블럼 본체(100×100 svg 안에서 쓴다). clipId는 호출부가 고유하게 준다. */
export function OpeningEmblem({ seriesKey, clipId, textFill }) {
  const e = OPENING_EMBLEMS[seriesKey]; if (!e) return null;
  return (
    <g>
      <defs><clipPath id={clipId}><path d="M50 12 L88 50 L50 88 L12 50 Z" /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {e.flag || e.bg(clipId + "m")}
        {e.letters && <Monogram letters={e.letters} fill={textFill} />}
      </g>
    </g>
  );
}
