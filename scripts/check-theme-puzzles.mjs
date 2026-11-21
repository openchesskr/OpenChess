#!/usr/bin/env node
/** (v0.7.8, 사용자 요청) 학습 탭 "추가 학습"(최근 본 레슨의 테마 퍼즐) 검사.
 *   · 모든 레슨이 테마를 갖고, 그 Lichess 테마는 서버 허용 목록(api/_lib/themePuzzles.js LICHESS_ANGLES) 안에 있으며 화면 이름이 있다
 *     (허용 목록 밖이면 서버가 400으로 거절해 블록이 비어 버린다)
 *   · Lichess 응답 해석(parseLichessPuzzle): 기보를 다시 두어 시작 포지션을 만들고 정답 UCI → SAN, 이상한 응답은 버림
 *   · 메이트 패턴 분석(mateShape)·OpenChess 퍼즐 분석(ocPuzzleInfo)·풀이 판정(puzzleMoveOk)·최근 레슨 목록(pushRecent)
 *  실행: node scripts/check-theme-puzzles.mjs (prebuild로 자동 실행) */
import { Chess } from "chess.js";
import { allLessons, lessonById } from "../src/lib/lessons/curriculum.js";
import { lessonTheme, angleLabel, ANGLE_LABEL_KEYS, LESSON_THEME_IDS, mateShape, ocPuzzleInfo, matchOcPuzzles, recentThemeGroups, puzzleMoveOk, bankPuzzles, pushRecent, RECENT_MAX } from "../src/lib/lessonPuzzles.js";
import { LICHESS_ANGLES, parseAngles, parseLichessPuzzle, mergePuzzles } from "../api/_lib/themePuzzles.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const lessons = allLessons(), ids = new Set(lessons.map((l) => l.id));
for (const id of LESSON_THEME_IDS) ok(ids.has(id), "테마 표에 커리큘럼에 없는 레슨: " + id);
for (const l of lessons) {
  const th = lessonTheme(l);
  if (!th || !th.angles.length) { fails.push(l.id + ": 테마 없음"); continue; }
  for (const a of th.angles) { ok(LICHESS_ANGLES.has(a), l.id + ": Lichess 테마 " + a + "가 서버 허용 목록에 없음"); ok(ANGLE_LABEL_KEYS.includes(a) && angleLabel(a) !== a, l.id + ": 테마 " + a + "의 화면 이름 없음"); }
  for (const tag of th.oc) ok(/^(mate(:\w+)?|sacrifice|advantage|punish|checkmate|opening:\w+)$/.test(tag), l.id + ": 모르는 OpenChess 태그 " + tag);
}
for (const a of LICHESS_ANGLES) ok(ANGLE_LABEL_KEYS.includes(a), "허용 테마 " + a + "의 화면 이름 없음");
ok(parseAngles("fork,pin")?.join() === "fork,pin", "parseAngles: 정상 목록");
ok(parseAngles("fork,evil") === null && parseAngles("") === null && parseAngles("a,b,c,d,e") === null, "parseAngles: 모르는 테마·빈 값·5개 이상 거절");

// Lichess 응답 해석
{
  const p = parseLichessPuzzle({ game: { pgn: "e4 e5 Qh5 Nc6 Bc4 Nf6" }, puzzle: { id: "Ab12C", solution: ["h5f7"], rating: 900, themes: ["mateIn1", "opening"] } });
  ok(p && p.sol.join() === "Qxf7#" && p.fen === new Chess("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4").fen() && p.rating === 900, "parseLichessPuzzle: 스콜라 메이트 해석");
  ok(parseLichessPuzzle({ game: { pgn: "e4 e5" }, puzzle: { id: "Zz99", solution: ["a1a8"] } }) === null, "parseLichessPuzzle: 불법 정답 버림");
  ok(parseLichessPuzzle({ game: { pgn: "e4 e5 Kxe8" }, puzzle: { id: "Zz99", solution: ["e1e2"] } }) === null, "parseLichessPuzzle: 불법 기보 버림");
  ok(parseLichessPuzzle({ game: { pgn: "e4" }, puzzle: { id: "bad id!", solution: ["e7e5"] } }) === null, "parseLichessPuzzle: 이상한 id 버림");
  const m = mergePuzzles({ puzzles: [{ id: "a", fen: "x", sol: ["e4"] }, { id: "b", fen: "y", sol: ["d4"] }] }, [{ id: "a", fen: "x", sol: ["e4"] }], 5);
  ok(m.length === 2 && m[0].id === "a", "mergePuzzles: id 중복 제거");
  const mt = mergePuzzles({ puzzles: [{ id: "c", fen: "x", sol: ["e4"], themes: ["fork"] }, { id: "d", fen: "y", sol: ["d4"], themes: ["smotheredMate", "mateIn2"] }] }, [{ id: "e", fen: "z", sol: ["c4"] }], 5, "smotheredMate");
  ok(mt.length === 1 && mt[0].id === "d", "mergePuzzles: 요청한 테마가 없는 Lichess 퍼즐은 버림(BUG-199)");
}
// 메이트 패턴
{ const c = new Chess("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"); c.move("Ra8"); ok(mateShape(c.fen()) === "backRank", "mateShape: 백랭크 메이트"); }
ok(mateShape("6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1") === "smothered", "mateShape: 스머더드 메이트");
ok(mateShape("7k/7R/5N2/8/8/8/8/6K1 b - - 0 1") === "arabian", "mateShape: 아라비안 메이트");
ok(mateShape("7k/8/8/8/8/8/8/6K1 b - - 0 1") === null, "mateShape: 메이트가 아니면 null");
// OpenChess 퍼즐 분석
{
  const info = ocPuzzleInfo({ setupSans: ["e4", "e5", "Bc4", "Nc6", "Qh5"], mistakeSan: "Nf6", solution: ["Qxf7#"], themes: ["checkmate"] });
  ok(info && info.sol.join() === "Qxf7#" && info.tags.has("mate") && info.tags.has("mate:mate"), "ocPuzzleInfo: 정답을 두어 메이트 태그");
  ok(ocPuzzleInfo({ setupSans: ["e4"], solution: ["Qxf7#"] }) === null, "ocPuzzleInfo: 불법 정답 버림");
  const br = ocPuzzleInfo({ fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", solution: ["Ra8#"], themes: ["checkmate"] });
  ok(br && br.tags.has("mate:backRank"), "ocPuzzleInfo: FEN 퍼즐의 백랭크 메이트 태그");
  const rows = [{ no: 1, data: { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", solution: ["Ra8#"], themes: ["checkmate"] } }, { no: 2, data: { setupSans: ["e4"], solution: ["e5"], themes: ["advantage"] } }];
  const got = matchOcPuzzles(rows, lessonTheme(lessonById("m_backrank")), 4);
  ok(got.length === 1 && got[0].no === 1, "matchOcPuzzles: 백랭크 레슨은 백랭크 퍼즐만");
}
// 최근 레슨 → 퍼즐 묶음, 풀이 판정, 최근 목록
{
  const g = recentThemeGroups(["t_fork", "z_forksq", "m_smothered"], lessonById, 3);
  ok(g.length === 3 && g[0].angle === "fork" && g[2].angle === "smotheredMate" && !g[2].own && g.every((x) => x.lessonId), "recentThemeGroups: 레슨마다 하나(v0.7.9)");
  const f = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
  ok(puzzleMoveOk(f, "Ra8#", ["Ra8#"], 0) && !puzzleMoveOk(f, "Ra7", ["Ra8#"], 0), "puzzleMoveOk: 정답·오답");
  ok(puzzleMoveOk("6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1", "Rb8#", ["Ra8#"], 0), "puzzleMoveOk: 마지막 수는 다른 메이트도 정답");
  let r = []; for (let i = 0; i < 12; i++) r = pushRecent(r, "l" + i); r = pushRecent(r, "l5");
  ok(r.length === RECENT_MAX && r[0] === "l5" && new Set(r).size === r.length && pushRecent(r, "bad id!").join() === r.join(), "pushRecent: 맨 앞·중복 없음·최대 개수·이상한 id 무시");
}
// (v0.7.9, BUG-199) OpenChess 테마 퍼즐 은행 — 최신이고, 모든 레슨이 퍼즐을 가지며, 모두 끝까지 합법이다.
{
  const { buildBank } = await import("./build-lesson-puzzles.mjs");
  const { readFileSync } = await import("node:fs");
  const { Chess } = await import("chess.js");
  const fresh = buildBank(), saved = JSON.parse(readFileSync(new URL("../src/data/lessonPuzzleBank.json", import.meta.url), "utf8"));
  ok(JSON.stringify(fresh) === JSON.stringify(saved), "src/data/lessonPuzzleBank.json이 최신이 아님 — node scripts/build-lesson-puzzles.mjs 실행");
  for (const l of allLessons()) {
    const rows = saved[l.id] || [];
    ok(rows.length >= (l.motif ? 1 : 3), l.id + ": 추가 학습 퍼즐이 " + rows.length + "개(최소 " + (l.motif ? 1 : 3) + ")");
    for (const r of rows) {
      let c; try { c = new Chess(r[0]); } catch { ok(false, l.id + ": FEN 오류 " + r[0]); continue; }
      const sans = String(r[1]).split(" ");
      ok(sans.every((x) => { try { return !!c.move(x); } catch { return false; } }), l.id + ": 정답 수순이 합법이 아님 " + r[0] + " " + r[1]);
    }
  }
  const g = bankPuzzles(saved, "m_smothered");
  ok(g.length >= 3 && g.some((p) => p.from.startsWith("g:")), "m_smothered: 은행에 마스터 대국 스모더드 메이트가 없음");
  ok(puzzleMoveOk("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "Ra8+", ["Re1+"], 0, [["Re1+", "Ra8+"]]), "puzzleMoveOk: 은행 퍼즐의 다른 정답(oks)");
}

if (fails.length) { console.error("✗ check-theme-puzzles 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-theme-puzzles: 레슨 " + lessons.length + "개의 테마가 서버 허용 목록 안에 있고, Lichess 해석·메이트 패턴·OpenChess 퍼즐 분석·풀이 판정이 맞다");
