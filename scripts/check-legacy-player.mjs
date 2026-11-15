#!/usr/bin/env node
/** (v0.7.4 재발 방지) 유산 재생기의 수순 → 기물 위치 계산(lib/legacyFrames.js buildFrames): 기물 id가 이어지고 잡기·캐슬링·앙파상·승급이 맞는지.
 *  실행: node scripts/check-legacy-player.mjs (prebuild로 자동 실행) */
import { buildFrames } from "../src/lib/legacyFrames.js";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const S = (x) => x.split(" ");
const at = (f, r, c) => f.find((p) => p.r === r && p.c === c);
// 기본 이동: 같은 기물 id가 이어지고 개수는 그대로
{ const { frames, moves } = buildFrames(S("e4 e5 Nf3"));
  ok(frames.length === 4 && moves.length === 3, "프레임은 수 + 1개, 수 정보는 수 개");
  const e2 = at(frames[0], 6, 4), e4 = at(frames[1], 4, 4);
  ok(e2 && e4 && e2.id === e4.id, "폰 이동 뒤에도 같은 기물 id");
  ok(frames[3].length === 32, "잡기가 없으면 32개 그대로"); }
// 잡기: 개수 감소, 잡힌 기물 사라짐
{ const { frames, moves } = buildFrames(S("e4 d5 exd5"));
  ok(frames[3].length === 31 && moves[2].capture === true, "잡기: 31개, capture 표시");
  ok(!frames[3].some((p) => p.r === 3 && p.c === 3 && p.col === "b"), "잡힌 흑 폰이 사라져야 함"); }
// 캐슬링: 킹·룩 둘 다 이동
{ const { frames, moves } = buildFrames(S("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O"));
  const f = frames[7];
  ok(at(f, 7, 6) && at(f, 7, 6).t === "K" && at(f, 7, 5) && at(f, 7, 5).t === "R", "단측 캐슬링: 킹 g1, 룩 f1");
  ok(moves[6] && moves[6].castle === "k", "캐슬링 표시"); }
// 앙파상: 지나간 폰이 사라짐
{ const { frames } = buildFrames(S("e4 a6 e5 d5 exd6"));
  const f = frames[5];
  ok(f.length === 31 && !f.some((p) => p.r === 3 && p.c === 3), "앙파상: 지나간 폰 제거(31개)"); }
// 승급: 기물 종류가 바뀌되 id는 유지
{ const { frames } = buildFrames(S("h4 g5 hxg5 h6 gxh6 Nf6 h7 Ng8 hxg8=Q"));
  const f = frames[9], q = at(f, 0, 6);
  ok(q && q.t === "Q" && q.col === "w", "승급: g8에 흰 퀸"); }
// 불법 수는 위치를 그대로(throw 금지)
{ let threw = false, out = null; try { out = buildFrames(["e4", "Qh8"]); } catch { threw = true; }
  ok(!threw && out.frames.length === 3 && out.frames[2].length === 32, "불법 수도 throw 없이 위치 유지"); }
// (v0.7.7 BUG-174·175) 가벼운 모드(렉 감지)에서도 재생 박자는 같고, 유산 수 연출(표적 고정·도착 섬광·파문·광선·배너·배지 튀어 오름)은 보인다
{ const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/legacyPlayer.jsx", import.meta.url), "utf8");
  ok(/const delay = step === moveIndex \? 1700 : step === moveIndex \+ 1 \? 2100 : 950;/.test(src), "유산 재생 박자가 가벼운 모드에서 달라짐(예전 한 수 250ms로 지나치게 빠름 — BUG-174)");
  ok(!/\{heroPiece && !lite &&/.test(src) && !/\{landed && move && !lite &&/.test(src) && !/\{landed && !lite &&/.test(src), "유산 수 연출이 가벼운 모드에서 꺼짐(BUG-175)");
  ok(!/transition=\{lite \? \{ duration: 0 \}/.test(src), "가벼운 모드에서 기물이 미끄러지지 않고 순간이동함"); }
if (fails.length) { console.error("✗ legacy-player check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ legacy-player check: 수순 → 기물 위치(이동·잡기·캐슬링·앙파상·승급·불법 수) 통과");
