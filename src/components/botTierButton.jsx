// (v0.8.0, 사용자 요청) 일반 대국 "봇과 플레이하기"의 봇 수준 버튼 — 여러 색 대신 사이트 기본색(크림·갈색·금색)만 쓰고,
//  칭호 1~5단계처럼 위로 갈수록 더 화려하고 요소가 많다.
//   1단계(400·800)  크림 단색 + 얇은 갈색 테두리, 상아색 기물
//   2단계(1200·1600) 금빛 테두리, 연금색 기물, 작은 보석 하나
//   3단계(2000·2400) 연한 금빛 바탕, 금색 기물, 양쪽 모서리 보석
//   4단계(2700 그랜드마스터) 짙은 갈색 바탕, 금 왕관, 네 모서리 보석, 지나가는 빛줄기
//   5단계(KOKOA·MILKU 코치 봇) 짙은 갈색 + 이중 금테, 코치 사진에 금 고리, 빛 번짐, 빛줄기
//  아이콘·장식은 CLAUDE.md 파셋 규칙(채운 면) — scripts/check-facet-icons.mjs ZONES에 등록.
import { GOLD, FacetDiamond, FacetCrown, facetRamp } from "./facetIcons.jsx";
import { FacetPieceAt, IVORY } from "./pieceIcons.jsx";
import { T } from "../lib/theme.js";

const PIECE_OF = { 400: "P", 800: "N", 1200: "B", 1600: "R", 2000: "Q", 2400: "K" };
const PALE_GOLD = facetRamp("#D9BC7A");
export const botTierLevel = (b) => (b.coach ? 5 : b.elo >= 2700 ? 4 : b.elo >= 2000 ? 3 : b.elo >= 1200 ? 2 : 1);

const BTN_CSS = `
@keyframes btSweep{0%{transform:translateX(-120%) skewX(-18deg)}55%,100%{transform:translateX(320%) skewX(-18deg)}}
.bt-sweep{position:absolute;top:-10%;bottom:-10%;left:0;width:30%;pointer-events:none;background:linear-gradient(90deg,rgba(255,240,200,0),rgba(255,240,200,.32),rgba(255,240,200,0));animation:btSweep 3.6s ease-in-out infinite}
html[data-perf="lite"] .bt-sweep{animation:none;display:none}
`;

function TierEmblem({ b, lv, Mascot }) {
  if (lv === 5) {
    return <span style={{ position: "relative", width: 44, height: 44, flexShrink: 0, borderRadius: "50%", padding: 2, background: "conic-gradient(from 210deg," + GOLD.l1 + "," + GOLD.l3 + "," + GOLD.base + "," + GOLD.l2 + "," + GOLD.l1 + ")", boxShadow: "0 0 14px -2px rgba(232,196,106,.7)" }}>
      <span style={{ display: "flex", width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", alignItems: "flex-end", justifyContent: "center", background: "#F7EEDC" }}><Mascot name={b.coach} emotion="great" size={42} /></span>
    </span>;
  }
  const bg = lv === 4 ? "rgba(255,246,222,.06)" : lv === 3 ? "#5A3E22" : lv === 2 ? "#EFE2C4" : "#F6EEDD";
  const R = lv >= 3 ? GOLD : lv === 2 ? PALE_GOLD : IVORY;
  return <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, background: bg, border: "1px solid " + (lv >= 3 ? "rgba(232,196,106,.55)" : "rgba(150,112,58,.35)"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
    <svg viewBox="0 0 24 24" width={30} height={30} aria-hidden="true" style={{ overflow: "visible" }}>
      {lv === 4 ? <FacetCrown x={12} y={13} s={18} R={GOLD} /> : <FacetPieceAt type={PIECE_OF[b.elo] || "K"} cx={12} cy={12} h={19} R={R} />}
    </svg>
  </span>;
}
function Corners({ lv }) {
  if (lv < 2) return null;
  const pos = lv === 2 ? [[1, 0]] : lv === 3 ? [[1, 0], [1, 1]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
  return <>{pos.map(([x, y], i) => (
    <svg key={i} viewBox="0 0 10 10" width={lv >= 4 ? 11 : 9} height={lv >= 4 ? 11 : 9} aria-hidden="true" style={{ position: "absolute", [x ? "right" : "left"]: 4, [y ? "bottom" : "top"]: 4, pointerEvents: "none" }}>
      <FacetDiamond cx={5} cy={5} r={4.4} R={lv >= 3 ? GOLD : PALE_GOLD} gem={i === 0} />
    </svg>
  ))}</>;
}

export function BotTierButton({ b, selected, onClick, Mascot, Check }) {
  const lv = botTierLevel(b);
  const dark = lv >= 4;
  const bg = lv === 5 ? "linear-gradient(135deg," + T.ebony3 + "," + T.ebony2 + " 70%,#3A2614)"
    : lv === 4 ? "linear-gradient(135deg," + T.ebony3 + "," + T.ebony2 + ")"
    : lv === 3 ? "linear-gradient(180deg,#F8EDD0,#EBD8A8)"
    : lv === 2 ? "linear-gradient(180deg,#FBF4E4,#F1E4C6)" : "#FBF6EA";
  const border = lv === 5 ? "2px solid " + GOLD.l2 : lv === 4 ? "1.5px solid " + GOLD.l3 : lv === 3 ? "1.5px solid " + GOLD.l4 : lv === 2 ? "1px solid #C9A45C" : "1px solid #CDB98E";
  const nameColor = dark ? T.ivoryHi : T.ink, subColor = dark ? "rgba(255,246,222,.68)" : T.inkSoft;
  return (
    <button onClick={onClick} className="press" aria-pressed={selected}
      style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 11, padding: lv === 5 ? "10px 12px" : "9px 12px", borderRadius: 12, border, background: bg, cursor: "pointer", textAlign: "left",
        boxShadow: (selected ? "0 0 0 2.5px " + (dark ? GOLD.l1 : T.brass) + ", " : "") + (lv === 5 ? "inset 0 0 0 3px rgba(232,196,106,.16), 0 10px 22px -12px rgba(36,21,9,.8)" : lv === 4 ? "0 8px 18px -12px rgba(36,21,9,.75)" : lv === 3 ? "0 4px 12px -8px rgba(138,99,34,.6)" : "none") }}>
      <style>{BTN_CSS}</style>
      {lv === 5 && <span aria-hidden="true" style={{ position: "absolute", left: -30, top: -40, width: 140, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(232,196,106,.32),rgba(232,196,106,0) 70%)", pointerEvents: "none" }} />}
      {lv >= 4 && <span aria-hidden="true" className="bt-sweep" style={{ animationDelay: lv === 5 ? "0s" : "1.2s" }} />}
      <Corners lv={lv} />
      <TierEmblem b={b} lv={lv} Mascot={Mascot} />
      <span style={{ position: "relative", minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: lv >= 4 ? 16 : 15, color: nameColor, lineHeight: 1.2, letterSpacing: lv === 5 ? ".04em" : 0 }}>{b.label}</span>
          {b.coach && <span style={{ fontSize: 11, fontWeight: 800, color: GOLD.l1 }}>{b.elo}</span>}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: subColor, marginTop: 1, lineHeight: 1.35, wordBreak: "keep-all" }}>{b.desc}</span>
      </span>
      {selected && <Check size={16} color={dark ? GOLD.l1 : T.brass} />}
    </button>
  );
}
