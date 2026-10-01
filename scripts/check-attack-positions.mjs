#!/usr/bin/env node
/** (v0.6.1) 무한 체크메이트 게임 포지션 풀 검사 — prebuild로 자동 실행된다.
 *  ① 번들 데이터(src/data/attackPositions.json)의 모든 포지션: 수순이 합법이고, 공격·수비 번갈아(길이 홀수), 마지막이 체크메이트이며,
 *     mateIn이 수순 길이와 같고, FEN(앞 네 칸)이 겹치지 않는다. 한 개라도 어긋나면 게임 중 "정답인데 오답" 같은 사고가 난다.
 *  ② 등급별 최소 개수 — 풀이 작아 같은 포지션이 자꾸 나오는 문제(v0.6.1 이전)가 다시 생기지 않게.
 *  ③ 테마가 다양하다(테마 종류 수·한 테마가 풀을 독점하지 않음).
 *  ④ 선택 로직(src/lib/attackPool.js): 한 번 나온 포지션은 풀을 한 바퀴 돌기 전엔 다시 나오지 않고, 같은 (pick, seen)이면 같은 포지션,
 *     한 바퀴 돌면 reset으로 다시 시작한다.
 *  실행: node scripts/check-attack-positions.mjs
 */
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { decodeAttackRow, attackGradeOfMate, pickAttackPosition, markAttackSeen, loadAttackSeen, dedupeAttackPositions } from "../src/lib/attackPool.js";

const MIN = { S: 1000, A: 1000, B: 500, C: 300 };       // 등급별 최소 개수
const MIN_THEMES = 12;                               // 서로 다른 대표 테마(th[0]) 최소 종류
const MAX_THEME_SHARE = 0.7;                         // 한 테마가 풀 전체에서 차지할 수 있는 최대 비율
const fails = [];
const rows = JSON.parse(readFileSync("src/data/attackPositions.json", "utf8"));
const all = rows.map(decodeAttackRow);

// ① 데이터 검증
const keys = new Set();
all.forEach((p, i) => {
  const where = "#" + i + " " + p.fen;
  const key = p.fen.split(" ").slice(0, 4).join(" ");
  if (keys.has(key)) fails.push(where + " — FEN 중복"); keys.add(key);
  if (p.moves.length % 2 !== 1) { fails.push(where + " — 수순 길이가 홀수가 아님"); return; }
  if (p.mateIn !== (p.moves.length + 1) / 2) fails.push(where + " — mateIn이 수순 길이와 다름");
  let c;
  try { c = new Chess(p.fen); } catch { fails.push(where + " — FEN 오류"); return; }
  for (const u of p.moves) {
    let mv = null;
    try { mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch { mv = null; }
    if (!mv) { fails.push(where + " — 불법 수 " + u); return; }
  }
  if (!c.isCheckmate()) fails.push(where + " — 수순이 체크메이트로 끝나지 않음");
});

// ② 등급별 개수
const byGrade = { S: [], A: [], B: [], C: [] };
all.forEach((p) => byGrade[attackGradeOfMate(p.mateIn)].push(p));
for (const g of Object.keys(MIN)) if (byGrade[g].length < MIN[g]) fails.push("등급 " + g + " 포지션 " + byGrade[g].length + "개 < 최소 " + MIN[g]);

// ③ 테마 다양성
const themeCount = {};
all.forEach((p) => { const k = (p.th && p.th[0]) || "mate"; themeCount[k] = (themeCount[k] || 0) + 1; });
const themeKinds = Object.keys(themeCount).length;
if (themeKinds < MIN_THEMES) fails.push("테마 종류 " + themeKinds + "개 < 최소 " + MIN_THEMES);
const top = Object.entries(themeCount).sort((a, b) => b[1] - a[1])[0];
if (top && top[1] / all.length > MAX_THEME_SHARE) fails.push("테마 " + top[0] + "가 풀의 " + Math.round(100 * top[1] / all.length) + "%를 차지(최대 " + MAX_THEME_SHARE * 100 + "%)");

// ④ 선택 로직
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
{
  const list = byGrade.S;
  const seen = new Set();
  let lcg = 12345; const rnd = () => { lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0; return lcg; };
  const got = new Set();
  for (let i = 0; i < list.length; i++) {
    const a = pickAttackPosition(list, rnd(), seen);
    if (!a.pos || a.reset) { fails.push("선택 로직: 풀을 한 바퀴 돌기 전에 포지션이 없거나 reset됨(i=" + i + ")"); break; }
    if (got.has(a.pos.id)) { fails.push("선택 로직: 포지션 " + a.pos.id + "가 한 바퀴 돌기 전에 다시 나옴(i=" + i + ")"); break; }
    got.add(a.pos.id); seen.add(a.pos.id);
  }
  if (got.size !== list.length) fails.push("선택 로직: " + list.length + "개 중 " + got.size + "개만 나옴");
  const wrap = pickAttackPosition(list, 7, seen);
  if (!wrap.reset || !wrap.pos) fails.push("선택 로직: 한 바퀴를 다 돌면 reset으로 다시 시작해야 함");
  const p1 = pickAttackPosition(list, 999, new Set()), p2 = pickAttackPosition(list, 999, new Set());
  if (p1.pos.id !== p2.pos.id) fails.push("선택 로직: 같은 (pick, seen)인데 다른 포지션이 나옴");
  // 테마 균등: 앞 200번 중 서로 다른 테마가 2개 이상(풀에 여러 테마가 있을 때)
  const themes = new Set(); const s2 = new Set();
  for (let i = 0; i < 200 && i < list.length; i++) { const r = pickAttackPosition(list, rnd(), s2); themes.add((r.pos.th && r.pos.th[0]) || "mate"); s2.add(r.pos.id); }
  if (new Set(list.map((p) => (p.th && p.th[0]) || "mate")).size >= 3 && themes.size < 3) fails.push("선택 로직: 테마가 고르게 뽑히지 않음(" + [...themes] + ")");
  // 저장 기록: markAttackSeen이 쌓이고, reset이면 그 등급만 비워진다
  markAttackSeen(list[0], list, false, storage);
  markAttackSeen(byGrade.A[0], byGrade.A, false, storage);
  if (loadAttackSeen(storage).size !== 2) fails.push("선택 로직: 나온 기록이 저장되지 않음");
  markAttackSeen(list[1], list, true, storage);
  const after = loadAttackSeen(storage);
  if (after.has(list[0].id) || !after.has(list[1].id) || !after.has(byGrade.A[0].id)) fails.push("선택 로직: reset은 그 등급 기록만 비우고 새 포지션을 기록해야 함");
}
if (dedupeAttackPositions([...all, ...all]).length !== all.length) fails.push("dedupeAttackPositions가 중복을 못 거름");

if (fails.length) { console.error("✖ check-attack-positions 실패:\n  " + fails.slice(0, 30).join("\n  ") + (fails.length > 30 ? "\n  … 외 " + (fails.length - 30) + "건" : "")); process.exit(1); }
console.log("✔ check-attack-positions: " + all.length + "개 포지션(S " + byGrade.S.length + " · A " + byGrade.A.length + " · B " + byGrade.B.length + " · C " + byGrade.C.length + "), 테마 " + themeKinds + "종, 중복·불법 수 없음, 한 번 나온 포지션은 한 바퀴 전엔 다시 나오지 않음");
