#!/usr/bin/env node
/** (v0.7.1) 유산 재생 기물 연출 계획 검사(src/lib/legacyMotion.js).
 *   · 기물별 잡기 연출 종류, 폰·나이트만 이동을 겸하고(이동 연출 0) 나머지는 잡기 → 이동 순서(전체 = 잡기 + 이동)
 *   · 이동 경로: 직선·대각선은 한 칸씩, 나이트는 L자, 마지막 칸은 항상 도착 칸
 *   · 앙파상은 도착 칸이 아닌 옆 폰을 잡는다, 캐슬링은 킹·룩 두 개가 함께 움직인다, 퀸 파동은 기물을 만나면 멈추고 잡힌 기물까지 닿는다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-legacy-motion.mjs
 */
import { boardFromSans } from "../src/lib/chessRules.js";
import { legacyMotionPlan, movePath, burstMs, MOVE_MIN_MS, MOVE_MAX_MS } from "../src/lib/legacyMotion.js";

const fails = [];
const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(label + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };
const ok = (label, cond) => { if (!cond) fails.push(label); };
const planAt = (sans, san) => legacyMotionPlan(boardFromSans(sans), san, sans.length % 2 === 0 ? "w" : "b");

// 이동만
const e4 = planAt([], "e4");
eq("e4 경로", e4.moves[0].path, [[5, 4], [4, 4]]);
eq("e4 잡기 없음", [e4.capture, e4.captureMs, e4.total === e4.moveMs], [null, 0, true]);
ok("이동 시간 하한", e4.moveMs >= MOVE_MIN_MS);
eq("나이트 L자(긴 쪽 먼저)", planAt([], "Nf3").moves[0].path, [[6, 6], [5, 6], [5, 5]]);
eq("나이트 L자(옆 두 칸)", movePath([7, 1], [6, 3], "N"), [[7, 2], [7, 3], [6, 3]]);
ok("긴 대각선 이동 시간 상한", movePath([7, 0], [0, 7], "B").length === 7 && planAt(["g3", "a6"], "Bg2").moveMs <= MOVE_MAX_MS);

// 잡기 — 이동을 겸하는 것
const pxp = planAt(["e4", "d5"], "exd5");
eq("폰 잡기 = 박치기, 이동 겸함", [pxp.capture.style, pxp.captureMoves, pxp.moveMs, pxp.total === pxp.captureMs], ["headbutt", true, 0, true]);
eq("폰이 잡는 칸", pxp.capture.sq, [3, 3]);
const nxe5 = planAt(["e4", "e5", "Nf3", "Nc6", "Nc3", "f6"], "Nxe5");
eq("나이트 잡기 = 점프 후 내려찍기, 이동 겸함", [nxe5.capture.style, nxe5.captureMoves, nxe5.moveMs], ["leap", true, 0]);
// 잡기 — 잡은 뒤 이동
const bx = planAt(["e4", "e5", "Bc4", "Nf6", "d3", "h6"], "Bxf7+");
eq("비숍 잡기 = 저격 → 이동", [bx.capture.style, bx.captureMoves, bx.moveMs > 0, bx.total === bx.captureMs + bx.moveMs], ["snipe", false, true, true]);
eq("비숍 경로는 대각선 한 칸씩", bx.moves[0].path, [[3, 3], [2, 4], [1, 5]]);
const rx = planAt(["a4", "b5", "axb5", "h6"], "Rxa7");
eq("룩 잡기 = 검기 → 이동", [rx.capture.style, rx.captureMoves, rx.moveMs > 0], ["slash", false, true]);
const qx = planAt(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"], "Qxf7#");
eq("퀸 잡기 = 파동 → 폭발 → 이동", [qx.capture.style, qx.captureMoves, qx.moveMs > 0], ["burst", false, true]);
eq("퀸 파동 시간은 거리에 비례", qx.captureMs, burstMs(2));
ok("퀸 파동이 잡히는 기물까지 닿음", qx.rays.some((x) => x.sq[0] === 1 && x.sq[1] === 5 && x.dist === 2));
ok("퀸 파동은 기물을 만나면 그 칸에서 멈춤(h5→h7 폰 뒤 h8까지 가지 않음)", !qx.rays.some((x) => x.sq[0] === 0 && x.sq[1] === 7));
const kx = legacyMotionPlan(boardFromSans(["e4", "d5", "Ke2", "dxe4", "Ke3", "Qd2+"]), "Kxd2", "w");
eq("킹 잡기 = 일격 → 이동", [kx.capture.style, kx.captureMoves, kx.moveMs > 0], ["strike", false, true]);

// 특수 수
const ep = planAt(["e4", "a6", "e5", "d5"], "exd6");
eq("앙파상: 잡히는 폰은 옆 칸", [ep.capture.sq, ep.moves[0].to], [[3, 3], [2, 3]]);
const oo = planAt(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], "O-O");
eq("캐슬링: 킹·룩 함께", oo.moves.map((m) => [m.piece.t, m.from, m.to]), [["K", [7, 4], [7, 6]], ["R", [7, 7], [7, 5]]]);
eq("캐슬링은 잡기 없음", oo.capture, null);
eq("승격 기물 기록", planAt(["a4", "b5", "axb5", "a6", "bxa6", "Bb7", "axb7", "Nc6"], "bxa8=Q").promo, "Q");
eq("읽을 수 없는 수", [legacyMotionPlan(boardFromSans([]), "Qh5", "w"), legacyMotionPlan(null, "e4", "w"), legacyMotionPlan(boardFromSans([]), "", "w")], [null, null, null]);

if (fails.length) { console.error("✗ 유산 기물 연출 계획 검사 실패(src/lib/legacyMotion.js):"); fails.forEach((x) => console.error("  · " + x)); process.exit(1); }
console.log("✓ legacy motion check: 기물별 잡기 연출·이동 겸함 여부·순서, L자·직선 경로, 앙파상·캐슬링·승격, 퀸 파동 정지");
