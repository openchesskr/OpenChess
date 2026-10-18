#!/usr/bin/env node
/** (v0.6.9) 오프닝 실수 분석(학습 탭) 안전장치 — lib/openingMistakes.js를 가짜 엔진으로 검사한다.
 *  ① 내 수에서 평가가 100cp 이상 떨어지는 반복 수순만 실수로 잡고(250cp 이상은 블런더), 상대의 나쁜 수·한 번뿐인 수는 잡지 않는다.
 *  ② 불릿 대국은 빼고, 색별 대국이 MIN_GAMES 미만이면 엔진을 부르지 않는다.
 *  ③ 엔진 호출은 MAX_EVALS를 넘지 않고, 취소하면 즉시 멈춘다. 많이 둔 수순이 먼저 나온다.
 *  ④ 연결: 학습 탭이 엔진·리뷰 열기를 성장 분석에 넘기고, 화면이 이 모듈을 쓰며, 집중 분석에는 되돌아가지 않았다. */
import { readFileSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) fails.push(m); };
const O = await import("../src/lib/openingMistakes.js");

const rep = (n, moves, color = "w", extra = {}) => Array.from({ length: n }, (_, i) => ({ moves, color, result: "win", endTime: 1000 + i, timeClass: "blitz", ...extra }));
// 가짜 엔진: 수순 키 → 둘 차례 기준 cp. 표에 없으면 0.
const engine = (table) => { const calls = []; const f = async (sans) => { calls.push(sans.join(" ")); const v = table[sans.join(" ")]; return { cp: v == null ? 0 : v }; }; f.calls = calls; return f; };

// ① 백: 1.e4 e5 2.Qh5(흑 차례 +150 → 백 손실 170) 6판, 1.e4 e5 2.Nf3 4판, 1.e4 c5 2.Qh5(손실 있음)지만 1판뿐
{
  const games = [...rep(6, ["e4", "e5", "Qh5", "Nc6"]), ...rep(4, ["e4", "e5", "Nf3", "Nc6"]), ...rep(1, ["e4", "c5", "Qh5"])];
  const ev = engine({ "": 20, "e4": -20, "e4 e5": 20, "e4 e5 Qh5": 150, "e4 e5 Nf3": -20, "e4 c5": 20, "e4 c5 Qh5": 400 });
  const out = await O.findOpeningMistakes({ games: O.eligibleGames(games), color: "w", evalPos: ev });
  eq(out.lines.map((l) => [l.seq.join(" "), l.kind, l.count]), [["e4 e5 Qh5", "inaccuracy", 6]], "170cp 하락 = 부정확, 한 번뿐인 수순(1...c5 2.Qh5)은 제외");
  ok(!ev.calls.some((c) => c.startsWith("e4 e5 Qh5 ")), "실수로 잡은 수순 뒤로는 더 파고들지 않음");
}
// ① 블런더 + 상대의 나쁜 수는 안 잡음 + 흑 색
{
  const games = [...rep(5, ["e4", "e5", "Qh5", "Nc6", "Qxf7"], "b"), ...rep(4, ["d4", "d5", "Bg5", "h6"], "b")];
  const ev = engine({ "": 20, "e4": -20, "e4 e5": 20, "e4 e5 Qh5": -10, "e4 e5 Qh5 Nc6": 10, "d4": -20, "d4 d5": 30, "d4 d5 Bg5": -60, "d4 d5 Bg5 h6": 300 });
  // 흑 5판: 1...e5(20 → 흑 POV: 전: -20, 후 백 POV 20 → 합 0), 3...Nc6 전 -10 후 10 → 0. 흑 4판: 4...h6 전 -60 후 300 → 240 = 부정확(250 미만)
  const out = await O.findOpeningMistakes({ games, color: "b", evalPos: ev });
  eq(out.lines.map((l) => [l.seq.join(" "), l.kind, l.count]), [["d4 d5 Bg5 h6", "inaccuracy", 4]], "흑 쪽 수순과 평가 부호");
  const ev2 = engine({ "": 0, "d4": 0, "d4 d5": 0, "d4 d5 Bg5": -60, "d4 d5 Bg5 h6": 400 });
  const out2 = await O.findOpeningMistakes({ games, color: "b", evalPos: ev2 });
  eq(out2.lines.map((l) => l.kind), ["blunder"], "340cp 하락 = 블런더");
  // 백이 흑 대국만 있는 데이터에서 백 분석: 대국 없음
  const out3 = await O.findOpeningMistakes({ games, color: "w", evalPos: engine({}) });
  eq(out3.lines, [], "그 색 대국이 없으면 실수 없음");
}
// ① 상대(백)의 나쁜 수는 내(흑) 실수가 아니다
{
  const games = rep(5, ["e4", "e5", "Qh5", "Nc6"], "b");
  const ev = engine({ "": 20, "e4": -20, "e4 e5": 20, "e4 e5 Qh5": -10, "e4 e5 Qh5 Nc6": 600 /* 백이 크게 좋음(흑이 둔 뒤 백 차례) */ });
  const out = await O.findOpeningMistakes({ games, color: "b", evalPos: ev });
  eq(out.lines.map((l) => l.seq.join(" ")), ["e4 e5 Qh5 Nc6"], "…Nc6로 평가가 뒤집히면 내 실수");
  const ev3 = engine({ "": 20, "e4": -20, "e4 e5": 20, "e4 e5 Qh5": -500 });
  const out3 = await O.findOpeningMistakes({ games, color: "b", evalPos: ev3 });
  eq(out3.lines, [], "상대(백)가 둔 수로 평가가 떨어져도 내 실수가 아님");
}
// ② 불릿 제외, 색별 최소 대국 수
{
  eq(O.eligibleGames([...rep(3, ["e4"], "w", { timeClass: "bullet" }), ...rep(2, ["e4"])]).length, 2, "불릿 대국은 분석 대상이 아님");
  const ev = engine({});
  const out = await O.findOpeningMistakes({ games: rep(O.OM.MIN_GAMES - 1, ["e4", "e5"]), color: "w", evalPos: ev });
  eq([out.lines, ev.calls.length], [[], 0], "대국이 MIN_GAMES 미만이면 엔진을 부르지 않음");
}
// ③ 호출 상한·취소·빈도순
{
  // 서로 다른 수순을 많이 만들어 상한을 넘기게 한다.
  const sans = ["a3", "a4", "b3", "b4", "c3", "c4", "d3", "d4", "e3", "e4", "f3", "f4", "g3", "g4", "h3", "h4", "Nf3", "Nc3"];
  const games = sans.flatMap((m, i) => rep(3 + i, [m, "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]));
  const ev = engine({});
  await O.findOpeningMistakes({ games, color: "w", evalPos: ev });
  ok(ev.calls.length <= O.OM.MAX_EVALS, "엔진 호출이 MAX_EVALS를 넘음: " + ev.calls.length);
  ok(ev.calls[1] === "Nc3", "가장 많이 둔 수순부터 평가해야 함(첫 수 " + ev.calls[1] + ")");
  let n = 0; const ev2 = engine({});
  const out2 = await O.findOpeningMistakes({ games, color: "w", evalPos: ev2, isCancelled: () => ++n > 3 });
  ok(out2.cancelled && ev2.calls.length <= 4, "취소하면 곧바로 멈춰야 함");
  // 줄 수 상한과 빈도순 — 모든 첫 수가 실수(전 0 → 후 상대 +200)
  const out3 = await O.findOpeningMistakes({ games, color: "w", evalPos: async (s) => (s.length === 1 ? { cp: 200 } : { cp: 0 }) });
  ok(out3.lines.length === O.OM.MAX_LINES, "보여줄 줄 수가 MAX_LINES여야 함: " + out3.lines.length);
  eq(out3.lines.map((l) => l.count), [...out3.lines.map((l) => l.count)].sort((a, b) => b - a), "빈도 내림차순");
  eq(out3.lines[0].seq, ["Nc3"], "가장 많이 둔 수순이 맨 위");
}
// ④ 연결
const growth = readFileSync(new URL("../src/app/growth.jsx", import.meta.url), "utf8");
const quest = readFileSync(new URL("../src/app/quest.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const learn = readFileSync(new URL("../src/app/learn.jsx", import.meta.url), "utf8");
ok(/findOpeningMistakes\(/.test(growth) && /<OpeningMistakes /.test(growth), "성장 분석이 오프닝 실수 카드를 쓰지 않음");
ok(/getAnalysisPool\(/.test(growth), "오프닝 실수가 분석 풀 워커를 쓰지 않음(실시간 분석 큐를 막을 수 있음)");
ok(/<GrowthPanel [^>]*engine=\{engine\}[^>]*onOpenReview=\{onOpenReview\}/.test(quest), "학습 탭이 성장 분석에 엔진·리뷰 열기를 넘기지 않음");
ok(/<QuestTab [^>]*engine=\{engine\} onOpenReview=\{openReview\}/.test(app), "App이 학습 탭에 엔진·리뷰 열기를 넘기지 않음");
ok(!/focus-mistakes/.test(learn), "집중 분석에 오프닝 실수 엔진 분석이 되돌아옴(학습 탭으로 옮김)");
if (fails.length) { console.error("✖ check-opening-mistakes 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-opening-mistakes: 반복 수순의 평가 하락 판정, 불릿 제외·최소 대국 수, 호출 상한·취소, 학습 탭 연결이 유지된다");
