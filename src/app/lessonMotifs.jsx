// (v0.7.5, 사용자 요청) 오프닝 레파토리 구간의 레슨 경로 배경 — 레슨 줄마다 그 오프닝의 이름·역사·핵심 아이디어를 상징하는 문양 띠.
//  레슨 타일(블록)은 단계 색(갈색) 그대로 두고, 그 뒤 배경만 오프닝마다 달라진다.
//  문양 좌표는 100×100 한 장 기준이고, 띠의 높이에 맞춰 가로로 반복한다. acc: 그 오프닝의 고유 색(배경 물들임).
//  새 오프닝 레슨을 추가하면 여기에 문양을 넣어야 한다(check-lessons가 검사).
import { useId } from "react";

const W = "#FFFFFF";
const range = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-9; x += s) r.push(+x.toFixed(2)); return r; };

// 이탈리안 게임 — 르네상스 아케이드(2층 아치)와 f7을 겨누는 c4 비숍의 대각선
function Italian() {
  return <g fill="none" stroke={W} strokeLinecap="round">
    <g strokeWidth="1.6" opacity=".34">{range(8, 78, 14).map((x) => <path key={x} d={`M${x} 84V66a7 7 0 0 1 14 0V84`} />)}<path d="M4 84H96M4 60H96" /></g>
    <g strokeWidth="1.2" opacity=".24">{range(15, 75, 10).map((x) => <path key={x} d={`M${x} 58V47a5 5 0 0 1 10 0V58`} />)}<path d="M8 42H92" /></g>
    <path d="M24 78L72 30" strokeWidth="2.2" strokeDasharray="1 5" opacity=".55" /><circle cx="74" cy="28" r="3.2" fill={W} stroke="none" opacity=".5" />
  </g>;
}
// 루이 로페즈 — 스페인 아술레호 타일의 팔각별(1490년대 스페인 사제 루이 로페스의 책에서 이름)
function Ruy() {
  const star = (cx, cy, r) => { const p = []; for (let i = 0; i < 16; i++) { const a = (Math.PI / 8) * i - Math.PI / 2, rr = i % 2 ? r * 0.55 : r; p.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1)); } return p.join(" "); };
  return <g>
    <g stroke={W} strokeWidth=".8" opacity=".2" fill="none">{range(0, 100, 25).map((v) => <path key={v} d={`M${v} 0V100M0 ${v}H100`} />)}</g>
    {range(12.5, 87.5, 25).flatMap((x) => range(12.5, 87.5, 25).map((y) => <g key={x + "-" + y}>
      <polygon points={star(x, y, 9)} fill={W} opacity=".2" /><circle cx={x} cy={y} r="2.4" fill={W} opacity=".35" />
    </g>))}
    {range(0, 100, 25).flatMap((x) => range(0, 100, 25).map((y) => <rect key={"d" + x + y} x={x - 3} y={y - 3} width="6" height="6" transform={`rotate(45 ${x} ${y})`} fill={W} opacity=".22" />))}
  </g>;
}
// 스카치 게임 — 스코틀랜드 타탄 체크(엇갈린 굵고 가는 띠)
function Scotch() {
  const bands = [[14, 12, 0.13], [30, 2, 0.28], [36, 2, 0.28], [52, 16, 0.13], [76, 3, 0.3], [88, 10, 0.12]];
  return <g fill={W}>
    {bands.map(([p, w, o]) => <rect key={"h" + p} x="0" y={p} width="100" height={w} opacity={o} />)}
    {bands.map(([p, w, o]) => <rect key={"v" + p} x={p} y="0" width={w} height="100" opacity={o} />)}
    <g stroke={W} strokeWidth=".5" opacity=".18">{range(-100, 100, 3).map((v) => <path key={v} d={`M${v} 100L${v + 100} 0`} />)}</g>
  </g>;
}
// 퀸스 갬빗 디클라인드 — 갬빗을 받지 않고 지키는 성벽(총안이 있는 벽돌 요새)과 중앙의 퀸 왕관
function Qgd() {
  return <g fill={W}>
    {range(0, 90, 12).map((x) => <rect key={x} x={x + 1} y="50" width="7" height="8" opacity=".3" />)}
    <rect x="0" y="58" width="100" height="42" opacity=".1" />
    <g stroke={W} strokeWidth=".9" opacity=".3" fill="none">{range(64, 96, 8).map((y, i) => <g key={y}><path d={`M0 ${y}H100`} />{range(i % 2 ? 6 : 0, 100, 12).map((x) => <path key={x} d={`M${x} ${y}V${y + 8}`} />)}</g>)}</g>
    <path d="M40 100V82a10 10 0 0 1 20 0V100Z" opacity=".28" />
    <path d="M38 34l4-10 4 7 4-10 4 10 4-7 4 10z" opacity=".32" />
  </g>;
}
// 런던 시스템 — 런던의 벽돌 담과 시계탑의 문자판(언제나 같은 배치로 두는 "시스템")
function London() {
  return <g>
    <g stroke={W} strokeWidth=".8" opacity=".2" fill="none">{range(0, 100, 7).map((y, i) => <g key={y}><path d={`M0 ${y}H100`} />{range(i % 2 ? 7 : 0, 100, 14).map((x) => <path key={x} d={`M${x} ${y}V${y + 7}`} />)}</g>)}</g>
    <circle cx="50" cy="50" r="30" fill="#000" opacity=".12" />
    <circle cx="50" cy="50" r="30" fill="none" stroke={W} strokeWidth="1.6" opacity=".4" /><circle cx="50" cy="50" r="25" fill="none" stroke={W} strokeWidth=".8" opacity=".3" />
    <g stroke={W} strokeLinecap="round" opacity=".45">{range(0, 330, 30).map((a) => <path key={a} d="M50 22.5V26.5" strokeWidth={a % 90 ? 1 : 2.2} transform={`rotate(${a} 50 50)`} />)}</g>
  </g>;
}
// 나이도르프 변화 — 시실리안 중 가장 날카로운 변화: 깨진 수정 같은 날 선 조각들
function Najdorf() {
  const shards = [["0,0 38,0 20,34", .16], ["38,0 70,0 46,30", .26], ["70,0 100,0 100,26 78,22", .12], ["20,34 46,30 38,58", .3], ["46,30 78,22 64,52", .14], ["78,22 100,26 100,60 64,52", .24],
    ["0,0 20,34 0,50", .1], ["0,50 20,34 38,58 14,76", .2], ["38,58 64,52 56,82", .12], ["64,52 100,60 84,88", .3], ["0,76 14,76 34,100 0,100", .14], ["14,76 38,58 56,82 34,100", .26], ["56,82 84,88 72,100 34,100", .18], ["84,88 100,60 100,100 72,100", .1]];
  return <g>{shards.map(([p, o], i) => <polygon key={i} points={p} fill={W} opacity={o} stroke={W} strokeWidth=".6" strokeOpacity=".45" />)}</g>;
}
const FLEUR = "M0 -7C2.4 -3.6 2.4 -.6 0 2C-2.4 -.6 -2.4 -3.6 0 -7ZM.8 1.6C2.6 -2.6 7.4 -1.6 5.6 2C4.6 .4 2.8 1 1.6 2.6ZM-.8 1.6C-2.6 -2.6 -7.4 -1.6 -5.6 2C-4.6 .4 -2.8 1 -1.6 2.6ZM-3.6 2.4H3.6V3.8H-3.6ZM-1.2 3.8H1.2L1.8 7H-1.8Z";
// 프렌치 디펜스 — 백합 문장(플뢰르 드 리스)의 격자
function French() {
  return <g>
    <g stroke={W} strokeWidth=".8" opacity=".22">{range(-100, 100, 20).map((v) => <g key={v}><path d={`M${v} 0L${v + 100} 100`} /><path d={`M${v + 100} 0L${v} 100`} /></g>)}</g>
    {range(0, 100, 20).flatMap((x) => range(0, 100, 20).map((y) => <path key={x + "-" + y} d={FLEUR} transform={`translate(${x + 10} ${y + 10}) scale(.9)`} fill={W} opacity=".3" />))}
  </g>;
}
// 카로칸 디펜스 — 단단한 수비: 갑옷의 비늘
function Caro() {
  return <g fill="none" stroke={W} strokeWidth="1.1">
    {range(0, 104, 9).map((y, i) => <g key={y} opacity={0.16 + (i % 3) * 0.06}>{range(i % 2 ? -6 : 0, 104, 12).map((x) => <path key={x} d={`M${x - 6} ${y}A6 6 0 0 0 ${x + 6} ${y}`} />)}</g>)}
  </g>;
}
// 스칸디나비안 디펜스 — 북유럽 십자 깃발과 피오르의 물결
function Scandi() {
  return <g>
    <rect x="34" y="0" width="10" height="100" fill={W} opacity=".2" /><rect x="0" y="40" width="100" height="10" fill={W} opacity=".2" />
    <rect x="37" y="0" width="4" height="100" fill={W} opacity=".2" /><rect x="0" y="43" width="100" height="4" fill={W} opacity=".2" />
    <g fill="none" stroke={W} strokeWidth="1.3" strokeLinecap="round">{range(62, 96, 7).map((y, i) => <path key={y} opacity={0.18 + i * 0.05} d={`M0 ${y}q6 -4 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0`} />)}</g>
  </g>;
}
// 슬라브 디펜스 — 슬라브 민속 자수(십자수로 놓은 계단형 마름모)
function Slav() {
  const cell = 3.4, cells = [];
  const motif = (cx, cy, k) => { for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) { const d = Math.abs(dx) + Math.abs(dy); if (d === k || (d <= 1) || (dx === 0 && Math.abs(dy) <= k - 2) || (dy === 0 && Math.abs(dx) <= k - 2)) cells.push([cx + dx * cell, cy + dy * cell, d === k ? .34 : .24]); } };
  motif(50, 50, 5); motif(16, 50, 3); motif(84, 50, 3); motif(50, 16, 3); motif(50, 84, 3);
  return <g>
    {cells.map(([x, y, o], i) => <g key={i} opacity={o} stroke={W} strokeWidth=".9"><path d={`M${x - 1.2} ${y - 1.2}L${x + 1.2} ${y + 1.2}M${x + 1.2} ${y - 1.2}L${x - 1.2} ${y + 1.2}`} /></g>)}
    <g fill={W} opacity=".18">{range(0, 100, 6.8).map((x) => <rect key={x} x={x} y="30" width="3.4" height="3.4" transform={`rotate(45 ${x + 1.7} 31.7)`} />)}{range(0, 100, 6.8).map((x) => <rect key={"b" + x} x={x} y="67" width="3.4" height="3.4" transform={`rotate(45 ${x + 1.7} 68.7)`} />)}</g>
  </g>;
}
// 킹스 인디언 디펜스 — 인도의 만다라(꽃잎 고리)
function Kid() {
  return <g fill="none" stroke={W}>
    <circle cx="50" cy="50" r="38" strokeWidth=".8" opacity=".22" /><circle cx="50" cy="50" r="33" strokeWidth="1.4" opacity=".3" strokeDasharray="1 3.2" strokeLinecap="round" />
    <g strokeWidth="1.1" opacity=".32">{range(0, 345, 22.5).map((a) => <path key={a} d="M50 50C44 40 45 26 50 19C55 26 56 40 50 50Z" transform={`rotate(${a} 50 50)`} />)}</g>
    <g opacity=".2" fill={W} stroke="none">{range(11.25, 360, 22.5).map((a) => <circle key={a} cx="50" cy="20" r="1.6" transform={`rotate(${a} 50 50)`} />)}</g>
    <circle cx="50" cy="50" r="12" fill="#000" opacity=".14" stroke="none" />
  </g>;
}
// 님조 인디언 디펜스 — Bb4 핀: 나이트를 킹에 묶는 사슬(대각선)
function Nimzo() {
  const links = range(-2, 12, 1).map((i) => ({ x: 6 + i * 8, y: 94 - i * 8, alt: i % 2 }));
  return <g fill="none" stroke={W}>
    <g strokeWidth=".7" opacity=".14">{range(-60, 60, 12).map((v) => <path key={v} d={`M${v} 100L${v + 100} 0`} />)}</g>
    {links.map((l, i) => l.alt
      ? <rect key={i} x={l.x - 2} y={l.y - 6.5} width="4" height="13" rx="2" strokeWidth="1.8" opacity=".5" transform={`rotate(45 ${l.x} ${l.y})`} />
      : <rect key={i} x={l.x - 7} y={l.y - 4.2} width="14" height="8.4" rx="4.2" strokeWidth="2.2" opacity=".42" transform={`rotate(-45 ${l.x} ${l.y})`} />)}
  </g>;
}
// 그륀펠트 디펜스 — 중앙을 내주고 사방에서 압박: 중심에서 터져 나오는 햇살
function Grunfeld() {
  return <g>
    {range(0, 345, 15).map((a, i) => <path key={a} d="M50 50L47.4 -12H52.6Z" fill={W} opacity={i % 2 ? .1 : .24} transform={`rotate(${a} 50 50)`} />)}
    <g fill="none" stroke={W}><circle cx="50" cy="50" r="20" strokeWidth="1.2" opacity=".3" /><circle cx="50" cy="50" r="30" strokeWidth=".8" opacity=".22" strokeDasharray="2 3" /></g>
    <circle cx="50" cy="50" r="13" fill="#000" opacity=".16" />
  </g>;
}

/** 오프닝 계열 → { acc: 고유 색, Art: 배경 문양 }. */
export const OPENING_MOTIFS = {
  italian: { acc: "#2F7D4F", Art: Italian },
  ruy: { acc: "#A3322A", Art: Ruy },
  scotch: { acc: "#2D5B73", Art: Scotch },
  qgd: { acc: "#5E4A8C", Art: Qgd },
  london: { acc: "#56606E", Art: London },
  najdorf: { acc: "#C2552B", Art: Najdorf },
  french: { acc: "#2C478F", Art: French },
  caro: { acc: "#2D6B66", Art: Caro },
  scandi: { acc: "#3F7FAE", Art: Scandi },
  slav: { acc: "#8E2433", Art: Slav },
  kid: { acc: "#C7791C", Art: Kid },
  nimzo: { acc: "#6B3A6E", Art: Nimzo },
  grunfeld: { acc: "#B08A1E", Art: Grunfeld },
};

const rgba = (h, a) => "rgba(" + [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)).join(",") + "," + a + ")";
const FADE_X = "linear-gradient(90deg, transparent 0%, #000 14%, rgba(0,0,0,.5) 38%, rgba(0,0,0,.5) 62%, #000 86%, transparent 100%)";
const FADE_Y = "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)";

/** 레슨 경로의 한 줄(레슨 하나) 뒤에 까는 오프닝 문양 띠. 가운데(타일·연결선 자리)는 옅게, 양옆은 진하게, 위아래는 이웃 줄과 부드럽게 이어진다.
 *  name: 오프닝 이름(타일 반대쪽 가장자리에 작게). dim: 잠긴 레슨은 흐리게 미리 보여 준다. */
export function OpeningBand({ motif, name, top, height, labelSide = "right", narrow = false, dim = false }) {
  const id = "ob" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const M = OPENING_MOTIFS[motif]; if (!M) return null;
  const k = height / 100;
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top, height, pointerEvents: "none", WebkitMaskImage: FADE_Y, maskImage: FADE_Y }}>
      <div style={{ position: "absolute", inset: 0, opacity: dim ? 0.4 : 1, WebkitMaskImage: FADE_X, maskImage: FADE_X,
        background: "linear-gradient(90deg, " + rgba(M.acc, 0.34) + ", " + rgba(M.acc, 0.12) + " 50%, " + rgba(M.acc, 0.34) + ")" }}>
        <svg width="100%" height={height} style={{ display: "block", opacity: 0.62 }}>
          <defs><pattern id={id} width="100" height="100" patternUnits="userSpaceOnUse" patternTransform={`scale(${k})`}><M.Art /></pattern></defs>
          <rect width="100%" height="100%" fill={`url(#${id})`} />
        </svg>
      </div>
      {name && <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [labelSide]: narrow ? 12 : 22, maxWidth: narrow ? "27%" : "30%", display: "flex", alignItems: "center", gap: 7,
        flexDirection: labelSide === "left" ? "row" : "row-reverse", textAlign: labelSide, opacity: dim ? 0.45 : 1 }}>
        <span style={{ width: 3, alignSelf: "stretch", minHeight: 16, borderRadius: 2, background: rgba(M.acc, 0.95), boxShadow: "0 0 8px " + rgba(M.acc, 0.8), flexShrink: 0 }} />
        <span style={{ fontFamily: "Georgia,'Noto Serif KR',serif", fontStyle: "italic", fontWeight: 700, fontSize: narrow ? 11.5 : 13.5, lineHeight: 1.25, color: "rgba(255,246,226,.82)", textShadow: "0 1px 4px rgba(0,0,0,.7)", wordBreak: "keep-all" }}>{name}</span>
      </span>}
    </div>
  );
}
