// (v0.8.0, 사용자 요청) 플레이 탭 모드 화면의 소개 박스(갈색 박스) — 설명 문구 대신 모드 이름을 크게 보이고, 모드마다 고유한 장면을 담는다.
//  · 일반 대국: 마주 선 두 킹 사이의 체스 시계(바늘이 돈다)
//  · 좌표 인지 게임: 좌표가 적힌 보드 위로 조준경이 칸을 옮겨 다니며 좌표 이름표가 뜬다
//  · 나이트 레이스: 점으로 이어진 L자 길을 따라 나이트가 별(목표 칸)까지 뛴다
//  · 무한 체크메이트 게임: ∞ 모양으로 늘어선 보석을 빛이 끝없이 돌고, 가운데에 쓰러진 킹과 3:00
//  · 백랭크 러시아워: 막힌 줄 사이로 주인공 룩이 파일을 타고 올라가 백랭크로
//  아이콘·장식은 모두 CLAUDE.md 파셋 규칙(채운 면, 왼쪽 위 광원, GOLD/IVORY/EBONY ramp, 하이라이트 하나) — scripts/check-facet-icons.mjs ZONES에 등록.
//  애니메이션은 transform·opacity만 쓰고, 가벼운 모드(html[data-perf="lite"])에서는 멈춘다.
import { GOLD, FacetDiamond, FacetRook, FacetArrow, facetRamp } from "./facetIcons.jsx";
import { FacetPieceShape, FacetPieceAt, IVORY, EBONY } from "./pieceIcons.jsx";
import { T } from "../lib/theme.js";

const P = (pts) => "M" + pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + "Z";

export const MODE_TAGS = { standard: "STANDARD", coord: "COORDINATES", knight: "KNIGHT RACE", attack: "ENDLESS MATE", rush: "BACK RANK RUSH" };

/* ───────────── 아이콘(24×24) ───────────── */
function ClockGlyph({ R }) {
  return <g>
    <path d={P([[6, 5.4], [9.4, 5.4], [9.4, 8.4], [6, 8.4]])} fill={R.l1} /><path d={P([[14.6, 6.6], [18, 6.6], [18, 8.4], [14.6, 8.4]])} fill={R.l3} />
    <path d={P([[2.6, 8.4], [12, 8.4], [12, 19.6], [3.4, 19.6]])} fill={R.l2} /><path d={P([[12, 8.4], [21.4, 8.4], [20.6, 19.6], [12, 19.6]])} fill={R.l4} />
    <path d={P([[3.4, 19.6], [20.6, 19.6], [21.2, 21.8], [2.8, 21.8]])} fill={R.base} />
    <FacetDiamond cx={7.6} cy={14} r={3.3} R={R} gem={false} /><FacetDiamond cx={16.4} cy={14} r={3.3} R={R} gem={true} />
  </g>;
}
function TargetGlyph({ R }) {
  const C = [12, 12];
  return <g>
    <path d={P([[3, 3], [21, 3], C])} fill={R.l1} /><path d={P([[3, 3], C, [3, 21]])} fill={R.l2} />
    <path d={P([[21, 3], [21, 21], C])} fill={R.l3} /><path d={P([[3, 21], C, [21, 21]])} fill={R.l4} />
    <path d={P([[3, 3], [7.5, 3], [3, 7.5]])} fill={R.base} /><path d={P([[21, 21], [16.5, 21], [21, 16.5]])} fill={R.base} />
    <FacetDiamond cx={12} cy={12} r={4.2} R={R} gem={true} />
  </g>;
}
function KnightGlyph({ R }) {
  return <g><FacetPieceShape type="N" R={R} /><FacetDiamond cx={19.6} cy={4.6} r={2.6} R={R} gem={false} /></g>;
}
function EndlessGlyph({ R }) {
  return <g><FacetDiamond cx={7.2} cy={12} r={5.6} R={R} gem={true} /><FacetDiamond cx={16.8} cy={12} r={5.6} R={R} gem={false} /><FacetDiamond cx={12} cy={12} r={1.6} R={R} gem={false} /></g>;
}
function RushGlyph({ R }) {
  return <g><FacetRook x={9.6} y={13.2} s={17} R={R} /><FacetArrow pts={[[19.4, 19.5], [19.4, 4.5]]} w={2.6} head={5} R={R} /></g>;
}
const GLYPHS = { standard: ClockGlyph, coord: TargetGlyph, knight: KnightGlyph, attack: EndlessGlyph, rush: RushGlyph };
/** 모드 아이콘(파셋). R 기본 GOLD. */
export function ModeIcon({ mode, size = 24, R = GOLD, style }) {
  const G = GLYPHS[mode] || ClockGlyph;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", overflow: "visible", ...style }}><G R={R} /></svg>;
}

/* ───────────── 장면(200×120) ───────────── */
const SQ_L = "#E9D3A6", SQ_D = "#9C6B43";
function Squares({ x0, y0, cols, rows, s, light = SQ_L, dark = SQ_D, opacity = 1 }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={r * cols + c} x={x0 + c * s} y={y0 + r * s} width={s + 0.05} height={s + 0.05} fill={(r + c) % 2 ? dark : light} />);
  return <g opacity={opacity}>{out}</g>;
}
// 보드 테두리 — 네 면(위 밝음 → 아래 가장 어두움)
function BoardFrame({ x, y, w, h, k = 3, R = facetRamp("#7A5634") }) {
  return <g>
    <path d={P([[x - k, y - k], [x + w + k, y - k], [x + w, y], [x, y]])} fill={R.l1} />
    <path d={P([[x - k, y - k], [x, y], [x, y + h], [x - k, y + h + k]])} fill={R.l2} />
    <path d={P([[x + w + k, y - k], [x + w + k, y + h + k], [x + w, y + h], [x + w, y]])} fill={R.l4} />
    <path d={P([[x - k, y + h + k], [x, y + h], [x + w, y + h], [x + w + k, y + h + k]])} fill={R.base} />
  </g>;
}
function StandardScene() {
  return <g>
    <Squares x0={12} y0={92} cols={11} rows={1} s={16} opacity={0.55} />
    <g className="mh-float-a"><FacetPieceAt type="K" cx={40} cy={62} h={52} R={IVORY} /></g>
    <g className="mh-float-b"><FacetPieceAt type="K" cx={160} cy={62} h={52} R={EBONY} /></g>
    {/* 체스 시계 */}
    <g transform="translate(100 64)">
      <path d={P([[-30, -16], [0, -16], [0, 20], [-27, 20]])} fill={GOLD.l2} /><path d={P([[0, -16], [30, -16], [27, 20], [0, 20]])} fill={GOLD.l4} />
      <path d={P([[-27, 20], [27, 20], [29, 25], [-29, 25]])} fill={GOLD.base} />
      <path d={P([[-21, -23], [-11, -23], [-11, -16], [-21, -16]])} fill={GOLD.l1} /><path d={P([[11, -20], [21, -20], [21, -16], [11, -16]])} fill={GOLD.l3} />
      {[-14, 14].map((cx, i) => (
        <g key={i} transform={`translate(${cx} 2)`}>
          <circle r={10.5} fill={i ? "#2C2016" : "#FFF9EC"} /><path d="M-10.5 0 A10.5 10.5 0 0 1 10.5 0Z" fill={i ? "#3E2E1F" : "#FFFFFF"} />
          <g className={i ? "mh-hand-slow" : "mh-hand"}><path d={P([[-0.9, 0], [0, -9], [0.9, 0]])} fill={i ? GOLD.l2 : "#8C3B2A"} /></g>
          <circle r={1.6} fill={GOLD.base} />
        </g>
      ))}
      <path d={P([[-28, -15], [-24, -15], [-28, -11]])} fill={GOLD.hi} />
    </g>
  </g>;
}
function CoordScene() {
  const s = 18, x0 = 56, y0 = 14, files = "abcdefg", rows = 5;
  const hits = [[3, 1], [1, 3], [5, 2], [2, 0]];   // [col,row] — 차례로 조준
  return <g>
    <BoardFrame x={x0} y={y0} w={s * 7} h={s * rows} />
    <Squares x0={x0} y0={y0} cols={7} rows={rows} s={s} />
    {files.split("").map((f, i) => <text key={f} x={x0 + i * s + s / 2} y={y0 + rows * s + 13} textAnchor="middle" fontSize="9" fontWeight="800" fill="rgba(255,246,222,.65)">{f}</text>)}
    {Array.from({ length: rows }, (_, r) => <text key={r} x={x0 - 9} y={y0 + r * s + s / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="800" fill="rgba(255,246,222,.65)">{8 - r}</text>)}
    {hits.map(([c, r], i) => {
      const cx = x0 + c * s + s / 2, cy = y0 + r * s + s / 2, name = files[c] + (8 - r);
      return <g key={i} className="mh-hit" style={{ animationDelay: i * 1.1 + "s", transformOrigin: cx + "px " + cy + "px" }}>
        <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="rgba(46,170,140,.55)" />
        {[[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy], j) => <path key={j} d={P(dy ? [[cx - 2.6, cy + dy * 5], [cx + 2.6, cy + dy * 5], [cx, cy + dy * 11]] : [[cx + dx * 5, cy - 2.6], [cx + dx * 5, cy + 2.6], [cx + dx * 11, cy]])} fill={j < 2 ? "#FFFFFF" : "#CFEFE6"} />)}
        <FacetDiamond cx={cx} cy={cy} r={2.4} R={facetRamp("#2EAA8C")} gem={false} />
        <g transform={`translate(${cx + 8} ${cy - 22})`}>
          <path d={P([[0, 0], [24, 0], [24, 13], [0, 13]])} fill="#FFF6DE" /><path d={P([[0, 13], [24, 13], [24, 15], [0, 15]])} fill="#C9B58C" />
          <text x={12} y={10} textAnchor="middle" fontSize="10" fontWeight="900" fill="#241509">{name}</text>
        </g>
      </g>;
    })}
  </g>;
}
function KnightScene() {
  const s = 18, x0 = 46, y0 = 12, cols = 7, rows = 5;
  const c = (col, row) => [x0 + col * s + s / 2, y0 + row * s + s / 2];
  const a = c(0, 4), b = c(2, 3), d = c(3, 1), goal = c(5, 0);
  const dots = (p, q, n) => Array.from({ length: n }, (_, i) => [p[0] + (q[0] - p[0]) * (i + 1) / (n + 1), p[1] + (q[1] - p[1]) * (i + 1) / (n + 1)]);
  const trail = [...dots(a, b, 3), ...dots(b, d, 3), ...dots(d, goal, 3)];
  return <g>
    <BoardFrame x={x0} y={y0} w={s * cols} h={s * rows} />
    <Squares x0={x0} y0={y0} cols={cols} rows={rows} s={s} />
    {[b, d].map((p, i) => <rect key={i} x={p[0] - s / 2} y={p[1] - s / 2} width={s} height={s} fill="rgba(232,185,60,.35)" />)}
    {trail.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.7} fill="#FFF6DE" className="mh-trail" style={{ animationDelay: i * 0.12 + "s" }} />)}
    <g className="mh-goal" style={{ transformOrigin: goal[0] + "px " + goal[1] + "px" }}><FacetDiamond cx={goal[0]} cy={goal[1]} r={7.5} R={GOLD} gem={true} /></g>
    <g className="mh-knight" style={{ "--k1x": (b[0] - a[0]) + "px", "--k1y": (b[1] - a[1]) + "px", "--k2x": (d[0] - a[0]) + "px", "--k2y": (d[1] - a[1]) + "px", "--k3x": (goal[0] - a[0]) + "px", "--k3y": (goal[1] - a[1]) + "px" }}>
      <FacetPieceAt type="N" cx={a[0]} cy={a[1]} h={16} R={IVORY} />
    </g>
  </g>;
}
function AttackScene() {
  const n = 22, A = 70, cx = 100, cy = 58;
  const pts = Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2, d = 1 + Math.sin(t) ** 2; return [cx + A * Math.cos(t) / d, cy + A * Math.sin(t) * Math.cos(t) / d * 1.25]; });
  return <g>
    {pts.map(([x, y], i) => <g key={i} className="mh-bead" style={{ animationDelay: (i / n) * 2.4 + "s", transformOrigin: x + "px " + y + "px" }}><FacetDiamond cx={x} cy={y} r={3.6} R={GOLD} gem={false} /></g>)}
    <g className="mh-topple" style={{ transformOrigin: "100px 74px" }}><FacetPieceAt type="K" cx={100} cy={60} h={34} R={EBONY} /></g>
    <text x={100} y={112} textAnchor="middle" fontSize="13" fontWeight="900" fill={GOLD.l1} letterSpacing="1">3:00</text>
    <text x={128} y={42} textAnchor="middle" fontSize="16" fontWeight="900" fill="#F4B2A6" className="mh-mate">#</text>
  </g>;
}
function RushScene() {
  const s = 15, x0 = 40, y0 = 10, cols = 8, rows = 6;
  const sq = (c, r) => [x0 + c * s + s / 2, y0 + r * s + s / 2];
  const rook = sq(5, 5), top = sq(5, 0);
  const blockers = [[2, 4, "P", IVORY], [3, 5, "B", IVORY], [6, 4, "P", IVORY], [1, 1, "P", EBONY], [2, 0, "R", EBONY], [7, 1, "P", EBONY]];
  return <g>
    <BoardFrame x={x0} y={y0} w={s * cols} h={s * rows} />
    <Squares x0={x0} y0={y0} cols={cols} rows={rows} s={s} />
    <rect x={x0} y={y0} width={s * cols} height={s} fill="rgba(244,178,166,.28)" />
    {blockers.map(([c, r, tp, R], i) => { const [x, y] = sq(c, r); return <FacetPieceAt key={i} type={tp} cx={x} cy={y} h={12} R={R} />; })}
    {(() => { const [x, y] = sq(4, 0); return <FacetPieceAt type="K" cx={x} cy={y} h={13} R={EBONY} />; })()}
    {[0, 1, 2].map((i) => <g key={i} className="mh-chev" style={{ animationDelay: i * 0.25 + "s" }}><FacetArrow pts={[[x0 + cols * s + 14, y0 + rows * s - 8 - i * 26], [x0 + cols * s + 14, y0 + rows * s - 22 - i * 26]]} w={3} head={6} R={GOLD} /></g>)}
    <g className="mh-rook" style={{ "--ry": (top[1] - rook[1]) + "px" }}><FacetPieceAt type="R" cx={rook[0]} cy={rook[1]} h={13} R={GOLD} /></g>
  </g>;
}
const SCENES = { standard: StandardScene, coord: CoordScene, knight: KnightScene, attack: AttackScene, rush: RushScene };

const HERO_CSS = `
@keyframes mhFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes mhSpin{to{transform:rotate(360deg)}}
@keyframes mhHit{0%,100%{opacity:0;transform:scale(.6)}6%,22%{opacity:1;transform:scale(1)}28%{opacity:0;transform:scale(1.15)}}
@keyframes mhTrail{0%,100%{opacity:.25}20%{opacity:1}}
@keyframes mhGoal{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
@keyframes mhKnight{0%,12%{transform:translate(0,0)}24%,36%{transform:translate(var(--k1x),var(--k1y))}48%,60%{transform:translate(var(--k2x),var(--k2y))}72%,92%{transform:translate(var(--k3x),var(--k3y))}100%{transform:translate(0,0)}}
@keyframes mhBead{0%,100%{opacity:.35;transform:scale(.8)}10%{opacity:1;transform:scale(1.25)}25%{opacity:.35;transform:scale(.8)}}
@keyframes mhTopple{0%,40%{transform:rotate(0)}55%,85%{transform:rotate(78deg)}100%{transform:rotate(0)}}
@keyframes mhMate{0%,45%{opacity:0}55%,85%{opacity:1}100%{opacity:0}}
@keyframes mhChev{0%,100%{opacity:.2;transform:translateY(4px)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes mhRook{0%,15%{transform:translateY(0)}55%,85%{transform:translateY(var(--ry))}100%{transform:translateY(0)}}
.mh-float-a{animation:mhFloat 3.2s ease-in-out infinite}.mh-float-b{animation:mhFloat 3.2s ease-in-out 1.6s infinite}
.mh-hand{transform-box:fill-box;transform-origin:50% 100%;animation:mhSpin 3s linear infinite}.mh-hand-slow{transform-box:fill-box;transform-origin:50% 100%;animation:mhSpin 12s linear infinite}
.mh-hit{opacity:0;animation:mhHit 4.4s ease-in-out infinite}
.mh-trail{animation:mhTrail 2.4s ease-in-out infinite}.mh-goal{animation:mhGoal 1.6s ease-in-out infinite}
.mh-knight{animation:mhKnight 3.6s cubic-bezier(.5,0,.3,1.2) infinite}
.mh-bead{animation:mhBead 2.4s linear infinite}
.mh-topple{animation:mhTopple 4.8s ease-in-out infinite}.mh-mate{animation:mhMate 4.8s ease-in-out infinite}
.mh-chev{animation:mhChev 1.2s ease-in-out infinite}.mh-rook{animation:mhRook 3.6s cubic-bezier(.6,0,.3,1) infinite}
html[data-perf="lite"] .mode-hero *{animation-iteration-count:1!important}
.mode-hero .mh-name{font-size:26px}
@media (min-width:900px){.mode-hero.big{min-height:250px;flex-direction:column;align-items:stretch}.mode-hero.big .mh-scene{width:100%!important;height:150px!important}.mode-hero.big .mh-name{font-size:34px}}
`;

/** 모드 소개 박스 — mode: standard | coord | knight | attack | rush, name: 화면에 보일 모드 이름, accent: 모드 강조색, big: 데스크톱 로비 왼쪽의 큰 카드 */
export function ModeHero({ mode, name, accent = T.brass, big = false }) {
  const Scene = SCENES[mode] || StandardScene;
  return (
    <div className={"mode-hero" + (big ? " big" : "")} style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 14px 16px", borderRadius: 16,
      background: "linear-gradient(135deg," + T.ebony3 + "," + T.ebony2 + ")", border: "1px solid rgba(236,203,134,.38)", boxShadow: "inset 0 1px 0 rgba(255,246,222,.08), 0 12px 26px -14px rgba(36,21,9,.75)" }}>
      <style>{HERO_CSS}</style>
      <span aria-hidden="true" style={{ position: "absolute", right: -40, top: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle," + accent + "55 0%," + accent + "00 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", minWidth: 0, flex: big ? "none" : 1, display: "flex", alignItems: "center", gap: 12, order: big ? 2 : 0 }}>
        <span style={{ width: 52, height: 52, borderRadius: 15, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,246,222,.06)", border: "1px solid rgba(236,203,134,.35)" }}>
          <ModeIcon mode={mode} size={32} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 10, fontWeight: 900, letterSpacing: ".22em", color: accent }}>{MODE_TAGS[mode] || ""}</span>
          <span className="mh-name" style={{ display: "block", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.12, color: T.ivoryHi, wordBreak: "keep-all" }}>{name}</span>
        </span>
      </div>
      <svg className="mh-scene" viewBox="0 0 200 120" aria-hidden="true" style={{ position: "relative", flexShrink: 0, width: 150, height: 90, overflow: "visible" }}>
        <Scene />
      </svg>
    </div>
  );
}
