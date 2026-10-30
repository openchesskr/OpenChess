#!/usr/bin/env node
/** (v0.7.1) 채팅 퀴즈·오프닝 룰렛의 순수 계산 검사(src/lib/chatQuiz.js, src/lib/openingRoulette.js).
 *   · 퀴즈 선택지: 정답 하나·오지선다·정답과 평가 차이가 거의 없는 수는 오답으로 안 씀(모호하면 ambiguous), 백 기준 평가치 부호·메이트 표기,
 *     받은 payload 검증(모양이 틀리면 null), PGN/FEN 입력 해석(불법 수순·끝난 포지션 거름)
 *   · 룰렛: 도감 트리(src/data/openings.json)에서 고를 수 있는 모든 ply(1~19)에 후보가 있고, 뽑힌 수순 길이가 ply와 같고, 릴 마지막이 당첨 이름
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-chat-quiz-roulette.mjs
 */
import { readFileSync } from "node:fs";
import { buildQuizOptions, normalizeQuiz, parseQuizInput, quizEvalText, scoreForMover, QUIZ_MAX_OPTIONS } from "../src/lib/chatQuiz.js";
import { makeRoulette, normalizeRoulette, roulettePool, rouletteCounts, ROULETTE_MIN_PLY, ROULETTE_MAX_PLY, ROULETTE_REEL_LEN } from "../src/lib/openingRoulette.js";

const fails = [];
const eq = (label, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) fails.push(label + "\n    받은 값: " + g + "\n    기대 값: " + w); };
const ok = (label, cond) => { if (!cond) fails.push(label); };
let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ── 평가치 표기 ──
eq("평가치 +", quizEvalText({ cp: 43 }), "+0.43");
eq("평가치 -", quizEvalText({ cp: -120 }), "-1.20");
eq("평가치 0", quizEvalText({ cp: 0 }), "0.00");
eq("메이트(백)", quizEvalText({ mate: 3 }), "#3");
eq("메이트(흑)", quizEvalText({ mate: -2 }), "-#2");
ok("메이트 점수가 cp보다 큼", scoreForMover({ mate: 5 }) > scoreForMover({ cp: 9000 }));
ok("더 빠른 메이트가 더 큼", scoreForMover({ mate: 1 }) > scoreForMover({ mate: 4 }));
ok("더 빨리 당하는 쪽이 더 작음", scoreForMover({ mate: -1 }) < scoreForMover({ mate: -4 }));

// ── 선택지 만들기 ──
const wide = [{ san: "Nf3", cp: 80 }, { san: "e4", cp: 30 }, { san: "d4", cp: -20 }, { san: "c4", cp: -90 }, { san: "a3", cp: -200 }, { san: "h4", cp: -400 }];
const r1 = buildQuizOptions(wide, "w", rng);
ok("선택지 성공", r1.ok);
eq("선택지 수(오지선다)", r1.options.length, QUIZ_MAX_OPTIONS);
eq("정답", r1.best, "Nf3");
ok("정답이 선택지에 있음", r1.options.some((o) => o.san === "Nf3"));
ok("분명한 오답만(모호하지 않음)", r1.ambiguous === false);
ok("정답과 평가 차이 40 미만인 수 제외", !r1.options.some((o) => o.san !== "Nf3" && 80 - o.cp < 40));
eq("백 차례 평가는 그대로", r1.options.find((o) => o.san === "Nf3").cp, 80);
const close = [{ san: "Nf3", cp: 50 }, { san: "e4", cp: 48 }, { san: "d4", cp: 45 }, { san: "c4", cp: 40 }, { san: "g3", cp: 38 }];
ok("비슷한 평가뿐이면 ambiguous", buildQuizOptions(close, "w", rng).ambiguous === true);
const black = buildQuizOptions([{ san: "e5", cp: 30 }, { san: "c5", cp: 10 }, { san: "a6", cp: -100 }], "b", rng);
eq("흑 차례 평가는 백 기준으로 뒤집힘", black.options.find((o) => o.san === "e5").cp, -30);
eq("흑 차례 정답", black.best, "e5");
const withMate = buildQuizOptions([{ san: "Qxf7", mate: 2 }, { san: "Qh5", cp: 300 }, { san: "Nf3", cp: 50 }, { san: "a3", cp: -400 }], "w", rng);
eq("메이트가 정답", withMate.best, "Qxf7");
eq("메이트 평가 보존", withMate.options.find((o) => o.san === "Qxf7").mate, 2);
const mateBlack = buildQuizOptions([{ san: "Qxf2", mate: 1 }, { san: "Qd4", cp: 200 }, { san: "a6", cp: -300 }], "b", rng);
eq("흑 메이트는 백 기준 음수", mateBlack.options.find((o) => o.san === "Qxf2").mate, -1);
eq("둘 수 있는 수가 너무 적으면 거절", buildQuizOptions([{ san: "Kg1", cp: 0 }, { san: "Kh1", cp: -50 }], "w", rng), { ok: false, reason: "few" });
eq("같은 수 중복은 한 번만", buildQuizOptions([{ san: "e4", cp: 10 }, { san: "e4", cp: 5 }, { san: "d4", cp: -100 }], "w", rng), { ok: false, reason: "few" });
for (let i = 0; i < 50; i++) { const r = buildQuizOptions(wide, "w", rng); if (!r.options.some((o) => o.san === "Nf3") || new Set(r.options.map((o) => o.san)).size !== r.options.length) { fails.push("선택지에 정답이 없거나 중복"); break; } }

// ── payload 검증 ──
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const good = { fen: START, opts: [{ san: "e4", cp: 30 }, { san: "d4", cp: 25 }, { san: "a3", cp: -20 }], best: "e4" };
ok("정상 payload 통과", normalizeQuiz(good) && normalizeQuiz(good).best === "e4");
eq("정답이 선택지에 없으면 거절", normalizeQuiz({ ...good, best: "Nf3" }), null);
eq("선택지가 6개면 거절", normalizeQuiz({ ...good, opts: [1, 2, 3, 4, 5, 6].map((n) => ({ san: "a" + n, cp: 0 })) }), null);
eq("SAN 모양이 이상하면 거절", normalizeQuiz({ ...good, opts: [{ san: "<script>", cp: 0 }, { san: "d4", cp: 0 }], best: "d4" }), null);
eq("FEN이 이상하면 거절", normalizeQuiz({ ...good, fen: "not a fen" }), null);
eq("중복 선택지 거절", normalizeQuiz({ ...good, opts: [{ san: "e4", cp: 1 }, { san: "e4", cp: 2 }], best: "e4" }), null);
eq("null 거절", normalizeQuiz(null), null);
eq("평가치 상한", normalizeQuiz({ ...good, opts: [{ san: "e4", cp: 9999999 }, { san: "d4", cp: -9999999 }], best: "e4" }).opts.map((o) => o.cp), [99999, -99999]);

// ── PGN/FEN 입력 ──
const p1 = parseQuizInput("1. e4 e5 2. Nf3 Nc6");
ok("PGN 읽기", p1.ok && p1.turn === "w" && p1.sans.length === 4 && p1.fen.startsWith("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w"));
ok("PGN 홀수 수순 → 흑 차례", parseQuizInput("1. e4 e5 2. Nf3").turn === "b");
ok("FEN 읽기", parseQuizInput(START).ok && parseQuizInput(START).fen === START);
ok("흑 차례 FEN", parseQuizInput("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").turn === "b");
eq("빈 입력", parseQuizInput("  ").error, "empty");
eq("불법 수순", parseQuizInput("1. e4 e4").error, "illegal");
eq("PGN 아님", parseQuizInput("hello world").error, "pgn");
eq("끝난 포지션(체크메이트)", parseQuizInput("1. f3 e5 2. g4 Qh4#").error, "over");
ok("헤더 FEN + 수순", (() => { const r = parseQuizInput('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n1. e4 Kd7'); return r.ok && r.turn === "w" && r.sans.length === 2; })());
eq("헤더 FEN이 이상함", parseQuizInput('[FEN "garbage"]\n1. e4').error, "fen");

// ── 룰렛 ──
const tree = JSON.parse(readFileSync(new URL("../src/data/openings.json", import.meta.url), "utf8")).tree;
const counts = rouletteCounts(tree);
for (let ply = ROULETTE_MIN_PLY; ply <= ROULETTE_MAX_PLY; ply++) {
  ok("ply " + ply + "에 도감 오프닝 후보가 있어야 함", (counts[ply] || 0) > 0 && roulettePool(tree, ply).length === counts[ply]);
  const r = makeRoulette(tree, ply, rng);
  if (!r) { fails.push("ply " + ply + " 룰렛이 null"); continue; }
  eq("ply " + ply + " 수순 길이", r.sans.length, ply);
  ok("ply " + ply + " 릴 마지막이 당첨", r.reel[r.reel.length - 1] === r.name && r.reel.length <= ROULETTE_REEL_LEN && new Set(r.reel).size === r.reel.length);
  ok("ply " + ply + " 당첨이 도감에 있음", !!(tree[r.sans.join(" ")] && tree[r.sans.join(" ")].opening.name === r.name));
  ok("ply " + ply + " payload 검증 통과", !!normalizeRoulette(r));
}
eq("범위 밖 ply", [makeRoulette(tree, 0, rng), makeRoulette(tree, 20, rng), makeRoulette(tree, 2.5, rng), makeRoulette(tree, "3", rng)], [null, null, null, null]);
eq("빈 트리", makeRoulette({}, 3, rng), null);
const rr = makeRoulette(tree, 4, rng);
eq("수순 길이가 ply와 다르면 거절", normalizeRoulette({ ...rr, sans: rr.sans.slice(1) }), null);
eq("이름 없으면 거절", normalizeRoulette({ ...rr, name: "" }), null);
eq("SAN 모양이 이상하면 거절", normalizeRoulette({ ...rr, sans: rr.sans.map(() => "<b>") }), null);
ok("릴 마지막이 어긋나면 고쳐서 통과", normalizeRoulette({ ...rr, reel: ["A", "B"] }).reel.at(-1) === rr.name);

if (fails.length) {
  console.error("✗ 채팅 퀴즈·오프닝 룰렛 계산 검사 실패:");
  fails.forEach((x) => console.error("  · " + x));
  process.exit(1);
}
console.log("✓ chat quiz/roulette check: 선택지(오지선다·정답 하나·평가치 부호·메이트), payload 검증, PGN/FEN 입력, 룰렛 ply 1~19 모두 정상");
