// (v0.6.8) 칭호 엠블럼 — 오프닝 칭호는 그 오프닝을 상징하는 국기나 이니셜을 마름모 안에 그려 계열마다 한눈에 구분되게 한다.
//  (v0.6.9) 이니셜은 직접 그린 각진 서체 대신 굵은 세리프 글꼴 + 외곽선으로 바꿨고, 인디언 디펜스 계열은 모두 인도 국기를 쓴다.
//  · 이미지 파일·폰트 없이 SVG로 그린다(100×100 좌표, 마름모 안쪽 영역 12~88에 잘려 보임).
////  새 오프닝 계열을 더하면 여기에도 한 줄 추가(check-titles가 확인).
import React from "react";

const stripesV = (cols) => cols.map((c, i) => <rect key={i} x={(100 / cols.length) * i} y="0" width={100 / cols.length + 0.5} height="100" fill={c} />);
const stripesH = (cols, ws) => { let y = 0; return cols.map((c, i) => { const h = ws[i]; const el = <rect key={i} x="0" y={y} width="100" height={h + 0.5} fill={c} />; y += h; return el; }); };

// 두 글자 이니셜을 마름모 가운데(50,50)에 놓는다. 굵은 세리프 글꼴(Merriweather 900)을 그대로 쓰고, 어두운 외곽선과 그림자로 아이콘처럼 도드라지게 한다.
//  마름모 안쪽(12~88)에서 잘리지 않도록 글자 폭을 textLength로 맞춘다.
const MONO_FONT = "'Merriweather', 'Noto Serif KR', Georgia, serif";
function Monogram({ letters, fill }) {
  const common = { x: 50, y: 63, textAnchor: "middle", fontFamily: MONO_FONT, fontWeight: 900, fontSize: 36, textLength: letters.length > 1 ? 50 : 28, lengthAdjust: "spacingAndGlyphs" };
  return (
    <g>
      <text {...common} fill="rgba(0,0,0,.55)" stroke="rgba(0,0,0,.55)" strokeWidth="5" strokeLinejoin="round" transform="translate(1 1.6)">{letters}</text>
      <text {...common} fill={fill} stroke="rgba(20,11,5,.85)" strokeWidth="2.4" strokeLinejoin="round" paintOrder="stroke fill">{letters}</text>
    </g>
  );
}
const mono = (letters, bgA, bgB) => ({
  bg: (gid) => <><defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bgA} /><stop offset="1" stopColor={bgB} /></linearGradient></defs><rect width="100" height="100" fill={`url(#${gid})`} /></>,
  letters,
});

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
  // 이니셜(직접 그린 각진 서체)
  carokann: mono("CK", "#3A3A52", "#17171F"),
  kingsgambit: mono("KG", "#8A2A3A", "#2E0A12"),
  benoni: mono("BN", "#2A6A86", "#0E2A38"),
  grunfeld: mono("GF", "#2A7A52", "#0C2E1E"),
  queensgambit: mono("QG", "#7A3E8A", "#2A1030"),
  pirc: mono("PD", "#6A3A8A", "#22102E"),
  alekhine: mono("AD", "#2A4A7A", "#0E1A30"),
  nimzo: INDIA,
  queensindian: INDIA,
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
