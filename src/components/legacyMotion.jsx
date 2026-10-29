// (v0.7.1 기능, 사용자 요청) 유산 재생 보드(빛의 체스보드)의 기물 연출 — 타임라인은 src/lib/legacyMotion.js(legacyMotionPlan)가 정하고, 여기서는 그린다.
//  · LegacyMotionLayer: 보드 위에 겹치는 연출 층. 움직이는 기물·잡히는 기물은 정적 보드에서 숨기고(legacyMotionHidden) 이 층이 대신 그린다.
//    잡기 — 폰 박치기 / 나이트 점프 후 내려찍기(둘 다 이동 겸함) / 비숍 저격 조준 / 룩 에너지 검기 / 퀸 8방향 파동 → 폭발 / 킹 일격.
//    이동 — 밟고 지나가는 칸이 차례로 빛나고, 기물 뒤로 잔상 셋이 따라온다. 이동을 겸하지 않는 잡기는 잡기 연출이 다 끝난 뒤(captureMs)에 시작한다.
//  · LegacyStampBadge: 도착 칸 우상단 수 아이콘 — 흰 윤곽선이 한 바퀴 그려지고 그 안에 아이콘이 도장처럼 찍힌다.
// 모든 움직임은 transform·opacity(합성기 값)만 쓴다(common.jsx SquareFx 주석 참고). 시간 단위는 ms로 받아 초로 바꾼다.
import React from "react";
import { motion } from "framer-motion";
import { STAMP_RING_MS, STAMP_HIT_MS } from "../lib/legacyMotion.js";

const S = (ms) => ms / 1000;
const tr = (x, y, extra = "") => "translate(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px)" + (extra ? " " + extra : "");
const MOVE_GLOW = "radial-gradient(closest-side, rgba(150,255,230,.95), rgba(90,220,200,.55) 60%, rgba(90,220,200,0))";
const BURST_GLOW = "radial-gradient(closest-side, rgba(225,190,255,.95), rgba(170,110,255,.55) 60%, rgba(170,110,255,0))";

// 연출이 진행되는 동안 정적 보드에서 비워 둘 칸("r,c") — 움직이는 기물의 출발 칸과 잡히는 기물의 칸.
export function legacyMotionHidden(plan) {
  const s = new Set();
  if (!plan) return s;
  plan.moves.forEach((m) => s.add(m.from[0] + "," + m.from[1]));
  if (plan.capture) s.add(plan.capture.sq[0] + "," + plan.capture.sq[1]);
  return s;
}

function Cell({ x, y, cell, children, style, ...rest }) {
  return <motion.div {...rest} style={{ position: "absolute", left: 0, top: 0, width: cell, height: cell, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", ...style }}>{children}</motion.div>;
}
// 칸 하나가 잠깐 빛난다(이동 경로·퀸 파동).
function SquareGlow({ p, cell, delayMs, glow, dur = 0.5 }) {
  return <Cell x={p[0]} y={p[1]} cell={cell} initial={{ opacity: 0, transform: tr(p[0], p[1], "scale(0.6)") }}
    animate={{ opacity: [0, 0.95, 0], transform: [tr(p[0], p[1], "scale(0.6)"), tr(p[0], p[1], "scale(1)"), tr(p[0], p[1], "scale(1.05)")] }}
    transition={{ delay: S(delayMs), duration: dur, times: [0, 0.25, 1], ease: "easeOut" }}
    style={{ background: glow, borderRadius: cell * 0.12, zIndex: 1 }} />;
}
// 원형 충격파·섬광
function Ring({ c, cell, delayMs, color = "#FFF6DE", from = 0.35, to = 1.8, dur = 0.34, width = 3 }) {
  return <Cell x={c[0]} y={c[1]} cell={cell} initial={{ opacity: 0, transform: tr(c[0], c[1], "scale(" + from + ")") }}
    animate={{ opacity: [0, 0.95, 0], transform: [tr(c[0], c[1], "scale(" + from + ")"), tr(c[0], c[1], "scale(" + ((from + to) / 2) + ")"), tr(c[0], c[1], "scale(" + to + ")")] }}
    transition={{ delay: S(delayMs), duration: dur, times: [0, 0.2, 1], ease: "easeOut" }}
    style={{ borderRadius: "50%", border: width + "px solid " + color, boxShadow: "0 0 12px " + color, zIndex: 6 }} />;
}
function Flash({ c, cell, delayMs, color, to = 2.2, dur = 0.42 }) {
  return <Cell x={c[0]} y={c[1]} cell={cell} initial={{ opacity: 0, transform: tr(c[0], c[1], "scale(0.2)") }}
    animate={{ opacity: [0, 1, 0], transform: [tr(c[0], c[1], "scale(0.2)"), tr(c[0], c[1], "scale(" + to * 0.6 + ")"), tr(c[0], c[1], "scale(" + to + ")")] }}
    transition={{ delay: S(delayMs), duration: dur, times: [0, 0.25, 1], ease: "easeOut" }}
    style={{ borderRadius: "50%", background: "radial-gradient(closest-side, #FFFFFF, " + color + " 45%, rgba(0,0,0,0))", zIndex: 7 }} />;
}
// 사방으로 튀는 작은 파편
function Sparks({ c, cell, delayMs, color, n = 8, reach = 0.75, dur = 0.42 }) {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n + 0.3, dx = Math.cos(a) * cell * reach, dy = Math.sin(a) * cell * reach;
    return <Cell key={i} x={c[0]} y={c[1]} cell={cell} initial={{ opacity: 0, transform: tr(c[0], c[1], "scale(0.15)") }}
      animate={{ opacity: [0, 1, 0], transform: [tr(c[0], c[1], "scale(0.15)"), tr(c[0] + dx * 0.6, c[1] + dy * 0.6, "scale(0.12)"), tr(c[0] + dx, c[1] + dy, "scale(0.06)")] }}
      transition={{ delay: S(delayMs), duration: dur, times: [0, 0.3, 1], ease: "easeOut" }}
      style={{ borderRadius: "50%", background: color, boxShadow: "0 0 10px " + color, zIndex: 7 }} />;
  });
}

// ── 이동 연출: 칸 발광 + 잔상 ──
function MovePart({ m, delayMs, durMs, cell, pos, renderPiece }) {
  const pts = [m.from, ...m.path].map(pos);
  const n = pts.length;
  const times = pts.map((_, i) => i / (n - 1));
  const frames = pts.map((p) => tr(p[0], p[1]));
  const ease = Array.from({ length: n - 1 }, (_, i) => (n === 2 ? "easeInOut" : i === 0 ? "easeIn" : i === n - 2 ? "easeOut" : "linear"));
  const ghost = (k, op) => (
    <Cell key={"g" + k} cell={cell} initial={{ opacity: 0, transform: frames[0] }}
      animate={{ opacity: [0, op, op, 0], transform: frames.length > 1 ? frames : [frames[0], frames[0]] }}
      transition={{ delay: S(delayMs + k * 55), duration: S(durMs), times: undefined, ease: "linear", opacity: { delay: S(delayMs + k * 55), duration: S(durMs + 120), times: [0, 0.08, 0.8, 1] }, transform: { delay: S(delayMs + k * 55), duration: S(durMs), times, ease } }}
      style={{ zIndex: 3, filter: "blur(" + (k * 0.6).toFixed(1) + "px) sepia(1) saturate(3) hue-rotate(120deg)" }}>{renderPiece(m.piece, 1 - k * 0.06)}</Cell>
  );
  return (
    <>
      {m.path.map((sq, i) => <SquareGlow key={"p" + i} p={pos(sq)} cell={cell} glow={MOVE_GLOW} delayMs={delayMs + (durMs * (i + 1)) / n - 70} />)}
      {[3, 2, 1].map((k) => ghost(k, 0.5 - k * 0.12))}
      <Cell cell={cell} initial={{ transform: frames[0] }} animate={{ transform: frames }} transition={{ delay: S(delayMs), duration: S(durMs), times, ease }} style={{ zIndex: 4 }}>{renderPiece(m.piece)}</Cell>
    </>
  );
}
// 제자리에서 상대를 쓰러뜨리는 동안(비숍·룩·퀸·킹) 기물을 출발 칸에 그대로 세워 둔다 — 이동 연출이 시작되면 MovePart의 기물이 이어받는다.
function Victim({ c, cell, renderPiece, piece, animate, transition, children }) {
  return <Cell cell={cell} initial={{ opacity: 1, transform: tr(c[0], c[1]) }} animate={animate} transition={transition} style={{ zIndex: 2 }}>{children || renderPiece(piece)}</Cell>;
}

// ── 잡기 연출 ──
function Headbutt({ plan, cell, pos, renderPiece }) {
  const m = plan.moves[0], cap = plan.capture, D = plan.captureMs;
  const [fx, fy] = pos(m.from), [tx, ty] = pos(m.to), [vx, vy] = pos(cap.sq);
  const dx = tx - fx, dy = ty - fy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const hit = 0.55;
  return (
    <>
      <Cell cell={cell} initial={{ transform: tr(fx, fy) }}
        animate={{ transform: [tr(fx, fy), tr(fx - dx * 0.16, fy - dy * 0.16, "scale(0.92) rotate(-8deg)"), tr(tx + dx * 0.1, ty + dy * 0.1, "scale(1.1) rotate(6deg)"), tr(tx, ty)] }}
        transition={{ duration: S(D), times: [0, 0.3, hit, 1], ease: ["easeOut", [0.6, 0, 0.9, 0.4], "easeOut"] }} style={{ zIndex: 4 }}>{renderPiece(m.piece)}</Cell>
      <Victim c={[vx, vy]} cell={cell} renderPiece={renderPiece} piece={cap.piece}
        animate={{ opacity: [1, 1, 0.9, 0], transform: [tr(vx, vy), tr(vx, vy), tr(vx + ux * cell * 0.5, vy + uy * cell * 0.5 - cell * 0.15, "rotate(" + (ux >= 0 ? 35 : -35) + "deg)"), tr(vx + ux * cell * 0.95, vy + uy * cell * 0.95 + cell * 0.1, "rotate(" + (ux >= 0 ? 80 : -80) + "deg) scale(0.8)")] }}
        transition={{ duration: S(D), times: [0, hit, 0.72, 1], ease: "easeOut" }} />
      <Ring c={[vx, vy]} cell={cell} delayMs={D * hit} color="#FFE7A6" />
      <Sparks c={[vx, vy]} cell={cell} delayMs={D * hit} color="#FFD27A" n={6} reach={0.55} />
    </>
  );
}
function Leap({ plan, cell, pos, renderPiece }) {
  const m = plan.moves[0], cap = plan.capture, D = plan.captureMs;
  const [fx, fy] = pos(m.from), [tx, ty] = pos(m.to), [vx, vy] = pos(cap.sq);
  const mx = (fx + tx) / 2, my = (fy + ty) / 2, land = 0.8;
  return (
    <>
      {/* 땅 그림자 — 기물이 떠오를수록 작고 옅어진다 */}
      <Cell cell={cell} initial={{ opacity: 0.45, transform: tr(fx, fy + cell * 0.34, "scale(0.75, 0.22)") }}
        animate={{ opacity: [0.45, 0.25, 0.15, 0.5, 0], transform: [tr(fx, fy + cell * 0.34, "scale(0.75, 0.22)"), tr(fx + (mx - fx) * 0.5, fy + cell * 0.34, "scale(0.55, 0.16)"), tr(mx, my + cell * 0.34, "scale(0.45, 0.13)"), tr(tx, ty + cell * 0.34, "scale(0.8, 0.24)"), tr(tx, ty + cell * 0.34, "scale(0.8, 0.24)")] }}
        transition={{ duration: S(D), times: [0, 0.22, 0.5, land, 1] }} style={{ borderRadius: "50%", background: "rgba(0,0,0,.7)", zIndex: 1 }} />
      <Cell cell={cell} initial={{ transform: tr(fx, fy) }}
        animate={{ transform: [tr(fx, fy), tr(fx, fy - cell * 0.45, "scale(1.25)"), tr(mx, my - cell * 1.15, "scale(1.45) rotate(-10deg)"), tr(tx, ty, "scale(0.9, 1.08)"), tr(tx, ty)] }}
        transition={{ duration: S(D), times: [0, 0.22, 0.5, land, 1], ease: ["easeOut", "easeOut", [0.7, 0, 1, 0.5], "easeOut"] }} style={{ zIndex: 5 }}>{renderPiece(m.piece)}</Cell>
      <Victim c={[vx, vy]} cell={cell} renderPiece={renderPiece} piece={cap.piece}
        animate={{ opacity: [1, 1, 0.8, 0], transform: [tr(vx, vy), tr(vx, vy), tr(vx, vy + cell * 0.3, "scale(1.35, 0.25)"), tr(vx, vy + cell * 0.36, "scale(1.5, 0.08)")] }}
        transition={{ duration: S(D), times: [0, land, 0.88, 1], ease: "easeOut" }} />
      <Ring c={[vx, vy]} cell={cell} delayMs={D * land} color="#FFE7A6" from={0.4} to={2.1} dur={0.4} width={4} />
      <Ring c={[vx, vy]} cell={cell} delayMs={D * land + 70} color="#E9C98A" from={0.3} to={1.4} dur={0.32} width={2} />
      <Sparks c={[vx, vy + cell * 0.25]} cell={cell} delayMs={D * land} color="#CDB98E" n={7} reach={0.7} />
    </>
  );
}
function Snipe({ plan, cell, pos, renderPiece }) {
  const m = plan.moves[0], cap = plan.capture, D = plan.captureMs;
  const [fx, fy] = pos(m.from), [vx, vy] = pos(cap.sq);
  const h = cell / 2, x1 = fx + h, y1 = fy + h, x2 = vx + h, y2 = vy + h, shot = 0.72, R = cell * 0.36;
  const quads = ["inset(0 50% 50% 0)", "inset(0 0 50% 50%)", "inset(50% 50% 0 0)", "inset(50% 0 0 50%)"];
  const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <>
      <svg width={cell * 8} height={cell * 8} style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none", overflow: "visible" }}>
        {/* 조준 레이저 — 비숍에서 표적까지 그어지고, 쏘고 나면 사라진다 */}
        <motion.line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FF5A4E" strokeWidth={1.6} strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.9, 0.9, 0] }} transition={{ duration: S(D), times: [0, 0.38, 0.8, 1] }} style={{ filter: "drop-shadow(0 0 3px #FF5A4E)" }} />
        {/* 발사 순간의 굵은 탄도 섬광 */}
        <motion.line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFF1C2" strokeWidth={4} strokeLinecap="round" initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 0] }} transition={{ duration: S(D), times: [0, shot, shot + 0.05, shot + 0.16] }} style={{ filter: "drop-shadow(0 0 6px #FFD27A)" }} />
        {/* 조준경 — 크게 돌며 다가와 표적에 고정, 고정되면 맥박치듯 조인다 */}
        <motion.g initial={{ opacity: 0, transform: "translate(" + x2 + "px," + y2 + "px) rotate(90deg) scale(2.2)" }}
          animate={{ opacity: [0, 1, 1, 1, 0], transform: ["translate(" + x2 + "px," + y2 + "px) rotate(90deg) scale(2.2)", "translate(" + x2 + "px," + y2 + "px) rotate(20deg) scale(1.2)", "translate(" + x2 + "px," + y2 + "px) rotate(0deg) scale(1)", "translate(" + x2 + "px," + y2 + "px) rotate(0deg) scale(0.86)", "translate(" + x2 + "px," + y2 + "px) rotate(0deg) scale(1.3)"] }}
          transition={{ duration: S(D), times: [0, 0.3, 0.55, shot, 0.9] }}>
          <circle r={R} fill="none" stroke="#FF5A4E" strokeWidth={1.6} />
          <circle r={R * 0.18} fill="#FF5A4E" />
          {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b], i) => <line key={i} x1={a * R * 0.45} y1={b * R * 0.45} x2={a * R * 1.3} y2={b * R * 1.3} stroke="#FF5A4E" strokeWidth={1.6} strokeLinecap="round" />)}
        </motion.g>
      </svg>
      <Flash c={[fx, fy]} cell={cell} delayMs={D * shot} color="#FFD27A" to={1.3} dur={0.2} />
      {/* 표적이 네 조각으로 깨져 흩어진다 */}
      {quads.map((q, i) => (
        <Cell key={i} cell={cell} initial={{ opacity: 1, transform: tr(vx, vy) }}
          animate={{ opacity: [1, 1, 0], transform: [tr(vx, vy), tr(vx, vy), tr(vx + dirs[i][0] * cell * 0.5, vy + dirs[i][1] * cell * 0.5, "rotate(" + dirs[i][0] * 40 + "deg)")] }}
          transition={{ duration: S(D), times: [0, shot + 0.04, 1], ease: "easeOut" }} style={{ clipPath: q, zIndex: 2 }}>{renderPiece(cap.piece)}</Cell>
      ))}
      <Flash c={[vx, vy]} cell={cell} delayMs={D * (shot + 0.03)} color="#FF8A5C" to={1.6} dur={0.3} />
    </>
  );
}
function Slash({ plan, cell, pos, renderPiece }) {
  const m = plan.moves[0], cap = plan.capture, D = plan.captureMs;
  const [fx, fy] = pos(m.from), [vx, vy] = pos(cap.sq);
  const ang = (Math.atan2(vy - fy, vx - fx) * 180) / Math.PI;
  const launch = 0.3, hit = 0.7;
  const blade = (k) => (
    <Cell key={k} cell={cell} initial={{ opacity: 0, transform: tr(fx, fy, "rotate(" + ang + "deg) scale(0.6)") }}
      animate={{ opacity: [0, 0, 1 - k * 0.3, 1 - k * 0.3, 0], transform: [tr(fx, fy, "rotate(" + ang + "deg) scale(0.6)"), tr(fx, fy, "rotate(" + ang + "deg) scale(0.6)"), tr(fx, fy, "rotate(" + ang + "deg) scale(1)"), tr(vx, vy, "rotate(" + ang + "deg) scale(1.15)"), tr(vx, vy, "rotate(" + ang + "deg) scale(1.4)")] }}
      transition={{ duration: S(D), times: [0, launch + k * 0.04, launch + 0.04 + k * 0.04, hit + k * 0.03, hit + 0.1 + k * 0.03], ease: "easeIn" }} style={{ zIndex: 6 }}>
      <svg width={cell} height={cell} viewBox="0 0 100 100" style={{ overflow: "visible", filter: "drop-shadow(0 0 6px #8FE7FF) drop-shadow(0 0 14px #49B8FF)" }}>
        <path d="M58 8 C92 30 92 70 58 92 C76 70 76 30 58 8 Z" fill="#E8FBFF" />
        <path d="M50 14 C80 34 80 66 50 86 C64 66 64 34 50 14 Z" fill="#7FD8FF" opacity=".7" />
      </svg>
    </Cell>
  );
  return (
    <>
      {/* 룩이 기를 모은다 */}
      <Cell cell={cell} initial={{ opacity: 0, transform: tr(fx, fy, "scale(0.5)") }} animate={{ opacity: [0, 0.9, 0.9, 0], transform: [tr(fx, fy, "scale(0.5)"), tr(fx, fy, "scale(1.25)"), tr(fx, fy, "scale(1.1)"), tr(fx, fy, "scale(1.5)")] }}
        transition={{ duration: S(D), times: [0, 0.22, launch, launch + 0.12] }} style={{ borderRadius: "50%", background: "radial-gradient(closest-side, rgba(143,231,255,.8), rgba(73,184,255,0))", zIndex: 1 }} />
      {[2, 1, 0].map(blade)}
      {/* 맞은 기물이 위아래 두 쪽으로 갈라진다 */}
      {["inset(0 0 50% 0)", "inset(50% 0 0 0)"].map((q, i) => (
        <Cell key={q} cell={cell} initial={{ opacity: 1, transform: tr(vx, vy) }}
          animate={{ opacity: [1, 1, 0], transform: [tr(vx, vy), tr(vx, vy), tr(vx + (i ? 1 : -1) * cell * 0.22, vy + (i ? 1 : -1) * cell * 0.3, "rotate(" + (i ? 14 : -14) + "deg)")] }}
          transition={{ duration: S(D), times: [0, hit, 1], ease: "easeOut" }} style={{ clipPath: q, zIndex: 2 }}>{renderPiece(cap.piece)}</Cell>
      ))}
      <Cell cell={cell} initial={{ opacity: 0, transform: tr(vx, vy, "scaleX(0.2)") }} animate={{ opacity: [0, 0, 1, 0], transform: [tr(vx, vy, "scaleX(0.2)"), tr(vx, vy, "scaleX(0.2)"), tr(vx, vy, "scaleX(1.3)"), tr(vx, vy, "scaleX(1.5)")] }}
        transition={{ duration: S(D), times: [0, hit, hit + 0.06, hit + 0.2] }} style={{ zIndex: 7 }}>
        <span style={{ display: "block", width: "100%", height: 3, borderRadius: 2, background: "#F2FDFF", boxShadow: "0 0 10px #8FE7FF, 0 0 20px #49B8FF" }} />
      </Cell>
    </>
  );
}
function Burst({ plan, cell, pos, renderPiece }) {
  const cap = plan.capture, D = plan.captureMs;
  const [vx, vy] = pos(cap.sq), [qx, qy] = pos(plan.moves[0].from);
  const hitMs = cap.dist * 95;
  return (
    <>
      <Ring c={[qx, qy]} cell={cell} delayMs={0} color="#D9B8FF" from={0.6} to={1.3} dur={0.35} width={2} />
      {plan.rays.map((r, i) => <SquareGlow key={i} p={pos(r.sq)} cell={cell} glow={BURST_GLOW} delayMs={r.dist * 95} dur={0.42} />)}
      <Victim c={[vx, vy]} cell={cell} renderPiece={renderPiece} piece={cap.piece}
        animate={{ opacity: [1, 1, 1, 0], transform: [tr(vx, vy), tr(vx, vy), tr(vx, vy, "scale(1.3)"), tr(vx, vy, "scale(0.2)")] }}
        transition={{ duration: S(D), times: [0, hitMs / D, Math.min(0.98, (hitMs + 90) / D), 1], ease: "easeOut" }} />
      <Flash c={[vx, vy]} cell={cell} delayMs={hitMs + 40} color="#FF9A3C" to={2.6} dur={0.42} />
      <Ring c={[vx, vy]} cell={cell} delayMs={hitMs + 40} color="#FFD27A" from={0.4} to={2.4} dur={0.4} width={3} />
      <Sparks c={[vx, vy]} cell={cell} delayMs={hitMs + 40} color="#FFB86B" n={10} reach={1.05} dur={0.38} />
    </>
  );
}
function Strike({ plan, cell, pos, renderPiece }) {
  const cap = plan.capture, D = plan.captureMs;
  const [vx, vy] = pos(cap.sq);
  return (
    <>
      <Victim c={[vx, vy]} cell={cell} renderPiece={renderPiece} piece={cap.piece}
        animate={{ opacity: [1, 1, 1, 0], transform: [tr(vx, vy), tr(vx - cell * 0.06, vy), tr(vx + cell * 0.06, vy, "scale(1.08)"), tr(vx, vy, "scale(0.5)")] }}
        transition={{ duration: S(D), times: [0, 0.25, 0.4, 1], ease: "easeOut" }} />
      <Flash c={[vx, vy]} cell={cell} delayMs={D * 0.35} color="#FFE7A6" to={1.7} dur={0.3} />
    </>
  );
}
const CAPTURE_PART = { headbutt: Headbutt, leap: Leap, snipe: Snipe, slash: Slash, burst: Burst, strike: Strike };

// plan: legacyMotionPlan 결과. cell: 칸 한 변(px). flip: 보드 뒤집기. renderPiece(piece, scale?): 정적 보드와 같은 모양의 기물을 그리는 함수.
export function LegacyMotionLayer({ plan, cell, flip, renderPiece }) {
  if (!plan) return null;
  const pos = (sq) => { const r = flip ? 7 - sq[0] : sq[0], c = flip ? 7 - sq[1] : sq[1]; return [c * cell, r * cell]; };
  const Cap = plan.capture ? CAPTURE_PART[plan.capture.style] : null;
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: cell * 8, height: cell * 8, pointerEvents: "none", zIndex: 5 }}>
      {Cap && <Cap plan={plan} cell={cell} pos={pos} renderPiece={renderPiece} />}
      {!plan.captureMoves && plan.moves.map((m, i) => <MovePart key={i} m={m} delayMs={plan.captureMs} durMs={plan.moveMs} cell={cell} pos={pos} renderPiece={renderPiece} />)}
    </div>
  );
}

// 수 아이콘 도장 — stage: "stamp"(윤곽선 그리기 → 도장) | "static"(그냥 배지). color: 등급 색, icon: 아이콘 요소, size: 지름(px).
export function LegacyStampBadge({ stage, color, icon, size }) {
  const r = size / 2 - 1.2;
  const ringT = S(STAMP_RING_MS), hitT = S(STAMP_HIT_MS);
  if (stage !== "stamp") {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: color, border: "2px solid #fff", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(0,0,0,.55)" }}>{icon}</div>
    );
  }
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* 흰 윤곽선이 12시에서 시작해 시계 방향으로 한 바퀴 그려진다 */}
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible", transform: "rotate(-90deg)", zIndex: 2, filter: "drop-shadow(0 0 4px " + color + ")" }}>
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: ringT, ease: [0.5, 0, 0.3, 1] }} />
      </svg>
      {/* 그 안으로 아이콘이 위에서 쿵 찍힌다 — 크게 떠 있다가 눌러 찍히고, 잉크가 번지듯 원이 퍼진다 */}
      <motion.div initial={{ opacity: 0, transform: "scale(2.3) rotate(-18deg)" }} animate={{ opacity: [0, 1, 1, 1], transform: ["scale(2.3) rotate(-18deg)", "scale(0.86) rotate(4deg)", "scale(1.06) rotate(-1deg)", "scale(1) rotate(0deg)"] }}
        transition={{ delay: ringT, duration: hitT, times: [0, 0.45, 0.75, 1], ease: [[0.7, 0, 1, 0.6], "easeOut", "easeOut"] }}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, border: "2px solid #fff", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(0,0,0,.55)", zIndex: 1 }}>{icon}</motion.div>
      <motion.div initial={{ opacity: 0, transform: "scale(1)" }} animate={{ opacity: [0, 0.75, 0], transform: ["scale(1)", "scale(1.4)", "scale(2)"] }}
        transition={{ delay: ringT + hitT * 0.45, duration: 0.42, ease: "easeOut" }}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid " + color, zIndex: 0 }} />
    </div>
  );
}
