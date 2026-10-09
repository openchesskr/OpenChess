#!/usr/bin/env node
/** (v0.6.4) 성장 센터(약점 지도·실수 복습 카드·하이라이트·마스터 스타일) 안전장치.
 *  ① 실수 추출: 내 쪽만, 최선수가 있는 실수·블런더·놓친 수만, 수 두기 전 FEN과 id가 맞고 중복 합치기가 동작한다.
 *  ② 분류: 메이트 허용·기물 방치·메이트 놓침·기물 획득 놓침을 실제 포지션으로 가려낸다.
 *  ③ 간격 반복: 맞히면 칸이 오르고 일정이 밀리며, 틀리면 처음 칸으로 돌아가고, 오늘 풀 카드만 뽑힌다. 정답 판정은 체크 기호를 무시한다.
 *  ④ 하이라이트: 최대 3개, 서로 떨어져 있고 시간순이며 점수 하한을 지킨다. 깨끗한 판은 비어 있다.
 *  ⑤ 마스터 스타일: 특징 계산이 손으로 센 값과 같고, 표본이 적으면 매칭하지 않으며, 같은 성향의 가짜 마스터가 가장 가깝게 나온다. 마스터 데이터 형식.
 *  ⑥ 연결: 리뷰가 실수를 기록하고, 공유 시트가 하이라이트를 쓰며, 도감 화면이 성장 센터를 연다. */
import { readFileSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) fails.push(m); };
const W = await import("../src/lib/weakness.js"), H = await import("../src/lib/highlights.js"), S = await import("../src/lib/masterStyle.js");
const { CRITERIA_GROUPS } = S;

// ── ① 추출 ──  1.f3 e5 2.g4 Qh4# : 백(나)의 f3·g4가 실수. 최선수는 임의 값.
const mk = (san, white, kind, extra = {}) => ({ san, white, kind, lossWinPct: 20, best: null, ...extra });
const res1 = { moves: [mk("f3", true, "mistake", { best: "e4" }), mk("e5", false, "good"), mk("g4", true, "blunder", { best: "d4", lossWinPct: 90 }), mk("Qh4#", false, "best")], evalWin: [50, 30, 20, 5, 0] };
const ms = W.extractMistakes(res1, { color: "w", gameKey: "k1", now: 1000 });
eq(ms.map((m) => m.id), ["k1#0", "k1#2"], "내 쪽(백) 실수만, id = 게임키#ply");
eq(ms[0].fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "수 두기 전 FEN");
eq(ms[1].theme, "allowedMate", "2.g4는 Qh4#을 허용 → 메이트 허용");
eq(W.extractMistakes(res1, { color: "b", gameKey: "k1" }).length, 0, "흑은 실수가 없다(최선·good)");
eq(W.extractMistakes({ moves: [mk("e4", true, "mistake")] }, { color: "w", gameKey: "k" }).length, 0, "최선수가 없는 실수는 카드가 될 수 없다");
eq(W.extractMistakes(res1, { color: "w", gameKey: "k", fenRoot: {} }).length, 0, "사용자 지정 시작 위치는 다루지 않는다");
eq(W.mergeMistakes(ms, ms).length, 2, "같은 id는 합치지 않는다");
eq(W.mergeMistakes([], Array.from({ length: 450 }, (_, i) => ({ id: "x" + i }))).length, W.MAX_MISTAKES, "목록 상한");

// ── ② 분류 ──
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
eq(W.classifyMistake(START, "g4", "e4", "opening"), "opening", "그냥 약한 오프닝 수 → 오프닝 원칙");
// 백 퀸이 d1, 흑 퀸 d8이 열린 채 Qxd8 가능한 포지션에서 다른 수를 둠 → 기물 획득 놓침
eq(W.classifyMistake("3qk3/8/8/8/8/8/8/3QK3 w - - 0 1", "Ke2", "Qxd8+", "end"), "missedWin", "퀸 교환 대신 다른 수 → 기물 획득 놓침");
// 메이트 놓침: 백 Qh5 + Ra1 vs 흑 킹 h8: Ra8#
eq(W.classifyMistake("7k/6pp/8/8/8/8/8/R3K3 w - - 0 1", "Kd2", "Ra8#", "end"), "missedMate", "백 룩 메이트(Ra8#)를 놓침");
// 기물 방치: 백 퀸이 d1에서 d5로 가서 흑 폰 e6에 잡힘
eq(W.classifyMistake("4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1", "Qd5", "Qd4", "middle"), "hung", "폰에 잡히는 자리로 퀸을 보냄 → 기물 방치");

// ── ③ 간격 반복 ──
const DAY = 86400000, c0 = { id: "a", best: "Nf3+", box: 0, due: 0, loss: 10 };
const g1 = W.gradeCard(c0, true, 1000);
eq([g1.box, g1.due, g1.reps], [1, 1000 + DAY, 1], "정답: 1칸 위로, 다음은 1일 뒤");
eq(W.gradeCard({ ...g1, box: 5 }, true, 0).box, 5, "맨 위 칸은 넘지 않는다");
const gw = W.gradeCard({ ...g1, box: 3 }, false, 1000);
eq([gw.box, gw.lapses, gw.due], [0, 1, 1000 + 300000], "오답: 처음 칸, 5분 뒤 다시");
eq(W.dueCards([{ id: "x", due: 5, loss: 1 }, { id: "y", due: 99999, loss: 1 }, { id: "z", due: 1, loss: 9 }], 100).map((c) => c.id), ["z", "x"], "오늘 풀 카드만, 오래된 것부터");
eq(W.dueCards(Array.from({ length: 30 }, (_, i) => ({ id: i, due: 0, loss: i })), 1, 10).length, 10, "세션 한도");
ok(W.isCardAnswer(c0, "Nf3"), "정답 판정은 체크 기호를 무시"); ok(!W.isCardAnswer(c0, "Nc3"), "다른 수는 오답");
eq(W.srsStats([{ box: 5, due: 0 }, { box: 1, due: 9e15 }], 1), { total: 2, due: 1, mastered: 1, learning: 1 }, "복습 통계");
const rep = W.weaknessReport(ms);
eq([rep.total, rep.byPhase[0].n, rep.heat.flat().reduce((a, b) => a + b, 0)], [2, 2, 2], "리포트 합계 · 열지도 칸 수");
eq(W.weaknessReport([]).weakPhase, null, "빈 기록 리포트");
// 저장소: 기록은 계정별로 분리되고, 같은 리뷰를 다시 열어도 복습 진도가 초기화되지 않는다
{
  const ls = new Map(); globalThis.window = { localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) }, dispatchEvent() { } }; globalThis.Event = class { };
  const G = await import("../src/lib/growthStore.js");
  eq(G.recordReviewMistakes("u1", res1, { color: "w", gameKey: "g1" }), 2, "리뷰 끝 → 실수 2개 기록");
  const d = G.loadGrowth("u1"); d.mistakes[0] = W.gradeCard(d.mistakes[0], true, 5000); G.saveGrowth("u1", d);
  eq(G.recordReviewMistakes("u1", res1, { color: "w", gameKey: "g1" }), 0, "같은 대국을 다시 열면 중복 기록 없음");
  eq(G.loadGrowth("u1").mistakes[0].box, 1, "복습 진도가 유지됨");
  eq(G.loadGrowth("u2").mistakes.length, 0, "다른 계정은 분리");
}

// ── ④ 하이라이트 ──
const long = { moves: Array.from({ length: 30 }, (_, i) => mk(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Nb8", "d4", "Nbd7", "c4", "c6", "cxb5", "axb5", "Nc3", "Bb7", "Bg5", "b4", "Nb1", "h6"][i], i % 2 === 0, "good", { lossWinPct: 0 })), evalWin: new Array(31).fill(50) };
long.moves[6].kind = "blunder"; long.moves[6].lossWinPct = 40; long.moves[8].kind = "blunder"; long.moves[8].lossWinPct = 35;   // 가까운 둘(ply 6·8)은 하나만
long.moves[14].kind = "brilliant"; long.moves[22].kind = "mistake"; long.moves[22].lossWinPct = 25;
const hl = H.pickHighlights(long, 3);
ok(hl.length === 3, "하이라이트 3개(가까운 것은 하나만)"); eq(hl.map((h) => h.ply), [...hl.map((h) => h.ply)].sort((a, b) => a - b), "시간순");
ok(hl.every((h, i) => i === 0 || h.ply - hl[i - 1].ply >= H.HIGHLIGHT_MIN_GAP), "서로 4수 이상 떨어짐");
ok(hl.every((h) => h.score >= H.HIGHLIGHT_MIN_SCORE && /\//.test(h.fen) && h.from && h.to), "점수 하한 · 포지션·이동 칸 채움");
ok(hl.some((h) => h.ply === 14 && h.kind === "brilliant"), "탁월한 수 포함");
eq(H.pickHighlights({ moves: long.moves.map((m) => ({ ...m, kind: "good", lossWinPct: 0 })), evalWin: new Array(31).fill(50) }).length, 0, "깨끗한 판은 하이라이트 없음");
eq(H.pickHighlights({ moves: [] }).length, 0, "빈 결과");

// ── ⑤ 마스터 스타일 ──
const G = (moves, color, result = "win") => ({ moves, color, result });
const f = S.styleFeatures([G(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"], "w"), G(["d4", "d5", "c4", "e6", "Nc3", "Nf6"], "b"), G(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "O-O-O", "Nf6"], "w", "draw")]);
eq([f.vec[0], f.vec[1], f.vec[3], f.vec[5], f.vec[12], f.vec[7]], [1, 0, null, 1, 1 / 3, 1], "특징: 백 e4 비율·백 d4·흑 e5(분모 없으면 null)·흑 …d5·무승부·퀸사이드 캐슬링");
const data = JSON.parse(readFileSync(new URL("../src/data/masterStyles.json", import.meta.url), "utf8"));
eq(data.keys, S.STYLE_KEYS, "마스터 데이터의 특징 순서가 앱과 같음");
ok(data.masters.length >= 150 && data.masters.every((m) => m[3].length === 13), "마스터 데이터: 150명 이상, 특징 13개");
eq(S.matchMasters(f, data).ok, false, "표본(15판) 미만이면 매칭하지 않는다");
// 가짜 마스터("Twin")의 벡터를 그대로 내 특징으로 만들면 그 마스터가 1등이어야 한다
const twin = data.masters[7], fake = { vec: twin[3].slice(), den: new Array(13).fill(1e6), n: 40 };
const mm = S.matchMasters(fake, data, 3);
ok(mm.ok && mm.list[0].name === twin[0], "같은 성향이면 그 마스터가 가장 가깝다: " + (mm.list[0] && mm.list[0].name) + " vs " + twin[0]);
ok(mm.list[0].sim > mm.list[2].sim, "닮은 정도가 순서대로 줄어든다");
ok(S.sharedTraits(mm.z, twin, data).every((tr) => S.STYLE_KEYS.includes(tr.key)), "닮은 점은 정의된 특징");

// 기준별 비교(판정은 기준마다 사람이 보기에 큰 차이인가로 계산 — 표준편차 기준이 아님): 사용자 제보 사례를 그대로 고정한다
{
  const lv = (key, a, b) => S.criterionDiff(key, a, b).level;
  eq([lv("checkRate", 0.09, 0.07), lv("capRate", 0.26, 0.22), lv("queenTrade", 0.10, 0.09), lv("castleQ", 0.30, 0.26)], ["same", "same", "same", "same"], "9% 대 7%, 26% 대 22% 같은 작은 차이는 거의 같음");
  eq([lv("w_e4", 0.96, 0.52), lv("w_d4", 0.03, 0.48), lv("b_e5", 0.77, 1.0), lv("drawRate", 0.05, 0.26)], ["veryFar", "veryFar", "far", "far"], "큰 비율 차이(44%p·45%p)는 많이 다름, 23·21%p는 다름");
  eq([lv("w_flank", 0.01, 0), lv("b_c5", 0.12, 0), lv("b_nf6", 0.91, 0.92), lv("b_d5", 0.06, 0)], ["same", "close", "same", "same"], "0%에 가까운 값끼리·1%p 차이는 거의 같음, 12%p는 비슷함");
  eq([lv("length", 25 / 60, 40 / 60), lv("length", 40 / 60, 42 / 60), lv("checkRate", 0.05, 0.10), lv("checkRate", 0.005, 0.015)], ["far", "same", "far", "same"], "대국 25수 대 40수는 다름, 40수 대 42수는 거의 같음, 체크 5% 대 10%(2배)는 다름, 둘 다 2% 미만은 거의 같음");
  eq(S.criterionDiff("w_e4", null, 0.5), { diff: null, level: "na" }, "한쪽 값이 없으면 비교 불가");
  eq([S.formatDiff("w_e4", 0.44), S.formatDiff("checkRate", 1.286), S.formatDiff("length", 1.6), S.formatDiff("w_e4", null)], ["±44%p", "1.3배", "1.6배", "—"], "차이 표기");
  ok(S.STYLE_KEYS.every((k) => S.CRITERION_KIND[k]), "모든 기준에 판정 방식(share·intensity·length)이 있다");
  const rowsSame = S.compareCriteria(twin[3], twin[3]);
  ok(rowsSame.length === 13 && rowsSame.every((r) => r.level === "same" || r.level === "na"), "같은 벡터는 모든 기준이 거의 같음");
  ok(S.STYLE_KEYS.every((k) => S.criterionLabel(k) && S.criterionLabel(k) !== k), "모든 기준에 이름이 있다");
  eq([S.formatCriterion("w_e4", 0.456), S.formatCriterion("length", 0.7), S.formatCriterion("drawRate", null)], ["46%", "약 42수", "—"], "값 표기(비율·평균 수·없음)");
}
// ── ⑥ 연결 ──
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const review = rd("src/app/review.jsx"), growth = rd("src/app/growth.jsx"), app = rd("src/App.jsx"), quest = rd("src/app/quest.jsx"), pz = rd("src/app/puzzle.jsx");
ok(/recordReviewMistakes\(/.test(review), "ReviewPage가 리뷰가 끝나면 내 실수를 기록하지 않음");
ok(/pickHighlights\(/.test(review) && /drawHighlightCard/.test(review), "리뷰 공유 시트가 하이라이트 카드를 쓰지 않음");
ok(/<GrowthPanel /.test(quest) && /growthUid/.test(quest) && /growthGames/.test(quest), "학습 탭(QuestTab)이 성장 분석(GrowthPanel)을 펼쳐 보이지 않음");
ok(/<QuestTab growthUid=\{uid\} growthGames=\{chesscom\.games\}/.test(app), "App이 학습 탭에 uid·chess.com 대국을 넘기지 않음");
ok(!/GrowthCenter|GrowthEntryCard|onOpenGrowth/.test(app + pz + quest), "성장 분석이 다시 별도 버튼·화면으로 분리됨(학습 탭 안에 바로 펼쳐 보여야 함)");
ok(/gradeCard\(/.test(growth) && /dueCards\(/.test(growth) && /matchMasters\(/.test(growth) && /weaknessReport\(/.test(growth) && /compareCriteria\(/.test(growth), "성장 분석이 네 기능 로직(기준별 비교 포함)을 모두 쓰지 않음");
ok(CRITERIA_GROUPS.flatMap((g) => g.keys).length === S.STYLE_KEYS.length && S.STYLE_KEYS.every((k) => CRITERIA_GROUPS.some((g) => g.keys.includes(k))), "기준 표(CRITERIA_GROUPS)가 스타일 특징 13개를 하나도 빠짐없이 한 번씩 담지 않음");
if (fails.length) { console.error("✖ check-growth 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-growth: 실수 추출·분류, 간격 반복, 하이라이트 선정, 마스터 스타일 매칭과 화면 연결이 유지된다");
