#!/usr/bin/env node
/** (v0.7.7, 사용자 요청 "+ 새 게시물 — 퍼즐·유산·대국을 전체 화면 작성기 하나로") 회귀 검사.
 *   ① 입력 해석(src/lib/postInput.js): PGN·[FEN] 헤더·FEN 한 줄·FEN+수순, 불법 수 위치, 헤더의 대국자·결과, FEN에서의 +/# 보정
 *   ② 게시물 검증(src/lib/legacyEntry.js): FEN 시작 유산·대국 게시물(kind game, 마지막 수까지, meta 정리) 통과, 잘못된 FEN·대국 모양은 거절
 *   ③ 게시물 묶음(src/lib/legacyPosts.js): 대국 게시물 추가·종류 판별, 같은 수순이라도 시작 FEN·대국/유산이 다르면 다른 게시물
 *   ④ 재생기 위치 계산(src/lib/legacyFrames.js): FEN 배치·차례에서 시작
 *   ⑤ 화면 연결: 소셜 탭 머리줄 = 연속 출석(StreakCount) + 새 게시물(NewPostButton), "일일 퍼즐" 제목·옛 연속 기록 줄 제거,
 *      작성기의 퍼즐 탭은 기존 마법사(createNode), App이 onPublishPost(addPost)를 넘김, 피드·재생기가 대국 게시물을 그린다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-post-composer.mjs */
import { readFileSync } from "node:fs";
import { parsePostInput } from "../src/lib/postInput.js";
import { normalizeLegacyEntry } from "../src/lib/legacyEntry.js";
import { addPost, kindOfPost, listPosts } from "../src/lib/legacyPosts.js";
import { buildFrames } from "../src/lib/legacyFrames.js";
import { parseFenFull } from "../src/lib/chessRules.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ① 입력 해석
{
  const a = parsePostInput("1. e4 e5 2. Nf3 Nc6 1-0");
  ok(a.ok && !a.root && a.sans.join(" ") === "e4 e5 Nf3 Nc6" && a.meta.result === "1-0", "PGN 해석");
  const b = parsePostInput('[White "Kim"]\n[Black "Lee"]\n[Result "0-1"]\n1. f3 e5 2. g4 Qh4');
  ok(b.ok && b.meta.white === "Kim" && b.meta.black === "Lee" && b.meta.result === "0-1" && b.sans[3] === "Qh4#", "PGN 헤더 대국자·결과·메이트 기호");
  const c = parsePostInput("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  ok(c.ok && c.root && c.sans.length === 0, "FEN 한 줄(수순 없음)");
  const d = parsePostInput("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1\nKd7 e4");
  ok(d.ok && d.root && d.root.turn === "b" && d.sans.join(" ") === "Kd7 e4", "FEN + 수순(흑 차례부터)");
  const e = parsePostInput('[FEN "k7/8/1K6/8/8/8/8/7Q w - - 0 1"]\n1. Qh8');
  ok(e.ok && e.root && e.sans[0] === "Qh8#", "[FEN] 헤더 + FEN 포지션 기준 메이트 기호(표준 시작 위치로 보정하지 않음)");
  const f = parsePostInput("1. e4 e4");
  ok(!f.ok && f.reason === "illegal" && f.at === 1, "불법 수 위치");
  ok(!parsePostInput("").ok && parsePostInput("hello world").reason === "format", "빈 입력·형식 오류");
}
// ② 게시물 검증
{
  const fenL = normalizeLegacyEntry({ fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 1", sans: ["Qh8#"], moveIndex: 0, kind: "best" });
  ok(fenL && fenL.fen === "k7/8/1K6/8/8/8/8/7Q w - - 0 1", "FEN 시작 유산 통과");
  ok(normalizeLegacyEntry({ fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 1", sans: ["e4"], moveIndex: 0 }) === null, "FEN 포지션에서 둘 수 없는 수는 거절");
  ok(normalizeLegacyEntry({ fen: "garbage", sans: ["e4"], moveIndex: 0 }) === null && normalizeLegacyEntry({ fen: 5, sans: ["e4"], moveIndex: 0 }) === null, "잘못된 FEN은 거절");
  const g = normalizeLegacyEntry({ sans: ["e4", "e5"], moveIndex: 1, kind: "game", meta: { white: "<b>Kim</b>\u0000", black: "x".repeat(99), result: "evil" } });
  ok(g && g.kind === "game" && g.meta.white === "bKim/b" && g.meta.black.length === 40 && g.meta.result === "*", "대국 게시물 meta 정리(꺾쇠·제어 문자 제거, 길이 제한, 결과 값 제한)");
  ok(normalizeLegacyEntry({ sans: ["e4", "e5"], moveIndex: 0, kind: "game" }) === null, "대국 게시물은 마지막 수까지가 한 몸");
  const plain = normalizeLegacyEntry({ sans: ["e4", "e5"], moveIndex: 0 });
  ok(plain && !("fen" in plain) && !("meta" in plain), "옛 유산 모양은 그대로(새 필드가 생기지 않음)");
}
// ③ 게시물 묶음
{
  const game = { sans: ["e4", "e5"], moveIndex: 1, playCount: 1, beforeCount: 1, kind: "game", meta: { white: "A", black: "B", result: "*" } };
  const r1 = addPost({}, game, 1000, () => 0.1);
  ok(r1.ok && kindOfPost(r1.id, r1.map[r1.id]) === "game" && listPosts(r1.map)[0].kind === "game", "대국 게시물 추가·종류 판별");
  const r2 = addPost(r1.map, { sans: ["e4", "e5"], moveIndex: 1, kind: "best" }, 2000, () => 0.2);
  ok(r2.ok, "같은 수순이라도 대국과 유산은 다른 게시물");
  ok(!addPost(r2.map, game, 3000, () => 0.3).ok, "같은 대국은 중복");
  const r3 = addPost({}, { fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", sans: ["e4"], moveIndex: 0, kind: "best" }, 1000, () => 0.1);
  const r4 = addPost(r3.map, { sans: ["e4"], moveIndex: 0, kind: "best" }, 2000, () => 0.2);
  ok(r3.ok && r4.ok, "같은 수라도 시작 FEN이 다르면 다른 게시물");
}
// ④ 재생기 위치 계산
{
  const root = parseFenFull("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1");
  const { frames, moves } = buildFrames(["Kd7", "e4"], root);
  ok(frames[0].length === 3 && moves[0] && moves[0].piece === "K" && moves[1] && moves[1].piece === "P", "FEN 배치·흑 차례에서 시작");
}
// ⑤ 화면 연결
{
  const pz = rd("src/app/puzzle.jsx"), app = rd("src/App.jsx"), pc = rd("src/app/postComposer.jsx"), sf = rd("src/app/socialFeed.jsx"), lp = rd("src/components/legacyPlayer.jsx");
  ok(/<StreakCount count=\{dailyPuzzleStreak \? dailyPuzzleStreak\.count : 0\} \/>/.test(pz) && /<NewPostButton onClick=/.test(pz), "소셜 탭 머리줄(연속 출석 + 새 게시물)이 없음");
  ok(!/function DailyStreakStrip/.test(pz) && !/t\("일일 퍼즐"\)/.test(pz), "옛 연속 기록 줄이나 \"일일 퍼즐\" 제목이 되살아남");
  ok(/<PostComposer [\s\S]{0,400}?>\s*\{createNode\}\s*<\/PostComposer>/.test(pz), "작성기의 퍼즐 탭이 기존 퍼즐 마법사(createNode)를 쓰지 않음");
  ok(/onPublishPost=\{saveLegacyFromReview\}/.test(app), "App이 작성기에 게시 함수(addPost)를 넘기지 않음");
  ok(/analyzeGame\(sans, engine, REVIEW_DEPTH, [\s\S]{0,80}?, REVIEW_MOVETIME_MS, undefined, root\)/.test(pc), "유산 채점이 FEN 시작 포지션을 넘기지 않음");
  ok(/kind === "game" && x\.post|isGame/.test(rd("src/lib/socialMix.js")) && /game: t\("대국"\)/.test(sf), "피드에 대국 필터가 없음");
  ok(/fenRoot=\{root\}/.test(sf) && /fenRoot=\{root\}/.test(rd("src/app/legacyFeed.jsx")), "피드·프로필 카드가 FEN 시작 게시물을 표준 시작 위치로 그림");
  ok(/k === "game" \? <GamePostPlayer/.test(lp), "대국 게시물 재생기 연결이 없음");
}
if (fails.length) { console.error("✖ check-post-composer 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-post-composer: 새 게시물 작성기(퍼즐 마법사 재사용·유산·대국), PGN/FEN 입력 해석, FEN 시작·대국 게시물 검증·중복·재생, 소셜 탭 머리줄이 유지된다");
