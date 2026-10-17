// (v0.6.8) 칭호 엠블럼 — 오프닝 칭호는 그 오프닝을 상징하는 국기(이탈리아·스페인 등)나 이니셜(CK·KG 등)을 마름모 안에 그려 계열마다 한눈에 구분되게 한다.
//  이미지 파일 없이 SVG로 그린다(100×100 좌표, 마름모 안쪽 영역 12~88에 잘려 보임). 새 오프닝 계열을 더하면 여기에도 한 줄 추가(check-titles가 확인).
import React from "react";

const stripesV = (cols) => cols.map((c, i) => <rect key={i} x={(100 / cols.length) * i} y="0" width={100 / cols.length + 0.5} height="100" fill={c} />);
const stripesH = (cols, ws) => { let y = 0; return cols.map((c, i) => { const h = ws[i]; const el = <rect key={i} x="0" y={y} width="100" height={h + 0.5} fill={c} />; y += h; return el; }); };
const mono = (letters, bgA, bgB) => ({
  bg: <><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bgA} /><stop offset="1" stopColor={bgB} /></linearGradient></defs><rect width="100" height="100" fill="url(#mg)" /></>,
  text: letters,
});
const MONO_FILL = { fontFamily: "'Merriweather', serif", fontStyle: "italic", fontWeight: 700 };

// 국기: 이탈리아·스페인·스코틀랜드·시칠리아·프랑스·오스트리아·카탈루냐·잉글랜드
export const OPENING_EMBLEMS = {
  italian: { flag: <>{stripesV(["#009246", "#F1F2F1", "#CE2B37"])}</> },
  ruylopez: { flag: <>{stripesH(["#AA151B", "#F1BF00", "#AA151B"], [25, 50, 25])}</> },
  scotch: { flag: <><rect width="100" height="100" fill="#0065BD" /><path d="M0 0L100 100M100 0L0 100" stroke="#fff" strokeWidth="15" /></> },
  sicilian: { flag: <><rect width="100" height="100" fill="#F2C200" /><path d="M0 0H100L0 100Z" fill="#D8202A" /><circle cx="50" cy="50" r="9" fill="#F4E3C0" /><g stroke="#7A1A1A" strokeWidth="4.5" strokeLinecap="round" fill="none"><path d="M50 50 L50 30" /><path d="M50 50 L67 60" /><path d="M50 50 L33 60" /></g></> },
  french: { flag: <>{stripesV(["#0055A4", "#F4F4F4", "#EF4135"])}</> },
  vienna: { flag: <>{stripesH(["#ED2939", "#F6F6F6", "#ED2939"], [33.4, 33.3, 33.3])}</> },
  catalan: { flag: <><rect width="100" height="100" fill="#FCDD09" />{[1, 3, 5, 7].map((i) => <rect key={i} x="0" y={(100 / 9) * i} width="100" height={100 / 9 + 0.4} fill="#DA121A" />)}</> },
  london: { flag: <><rect width="100" height="100" fill="#F6F6F6" /><rect x="41" y="0" width="18" height="100" fill="#CE1124" /><rect x="0" y="41" width="100" height="18" fill="#CE1124" /></> },
  // 이니셜: 인물·이름에서 딴 글자
  carokann: mono("CK", "#3A3A52", "#17171F"),
  kingsgambit: mono("KG", "#8A2A3A", "#2E0A12"),
  benoni: mono("Bn", "#2A6A86", "#0E2A38"),
  grunfeld: mono("Gr", "#2A7A52", "#0C2E1E"),
  queensgambit: mono("QG", "#7A3E8A", "#2A1030"),
};

/** 마름모 안에 들어가는 엠블럼 본체(100×100 svg 안에서 쓴다). clipId는 호출부가 고유하게 준다. */
export function OpeningEmblem({ seriesKey, clipId, textFill }) {
  const e = OPENING_EMBLEMS[seriesKey]; if (!e) return null;
  return (
    <g>
      <defs><clipPath id={clipId}><path d="M50 12 L88 50 L50 88 L12 50 Z" /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {e.flag || e.bg}
      </g>
      {e.text && <text x="50" y="61" textAnchor="middle" fontSize={e.text.length > 1 ? 30 : 38} fill={textFill} style={MONO_FILL}>{e.text}</text>}
    </g>
  );
}
