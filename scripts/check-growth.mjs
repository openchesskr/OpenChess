#!/usr/bin/env node
/** (v0.7.4 개편) 성장 분석 안전장치. 약점 지도·복습 카드·오프닝 실수는 처음부터 다시 설계하려고 삭제했다 — 이 검사는 남은 것과 새 게이트를 지킨다.
 *  ① 리뷰 5판 게이트: 내가 리뷰한 대국 수 계산(내 chess.com 아이디가 한쪽인 대국·내 OpenChess 대국 id만, 남의 대국·PGN·옛 버전·빈 수 목록은 제외)과 5판 기준, 게이지 바·안내 문구 연결.
 *  ② 하이라이트: 최대 3개, 서로 떨어져 있고 시간순이며 점수 하한을 지킨다. 깨끗한 판은 비어 있다.
 *  ③ 마스터 스타일: 특징 계산이 손으로 센 값과 같고, 표본이 적으면 매칭하지 않으며, 같은 성향의 가짜 마스터가 가장 가깝게 나온다. 마스터 데이터 형식.
 *  ④ 연결: 삭제한 성장 분석 코드(실수 기록·복습 카드·오프닝 실수)가 다시 들어오지 않는다. */
import { readFileSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) fails.push(m); };
const R = await import("../src/lib/reviewedCount.js"), H = await import("../src/lib/highlights.js"), S = await import("../src/lib/masterStyle.js");
const { CRITERIA_GROUPS } = S;

// ── ① 리뷰 5판 게이트 ──
{
  const fake = (entries) => { const m = new Map(entries); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null) }; };
  const good = JSON.stringify({ v: 1, d: 20, result: { moves: [{ san: "e4" }] } });
  const P = "oc-review-result:";
  const st = fake([
    [P + "cc:Me|Foe|100", good], [P + "cc:foe|ME|200", good],            // 내 chess.com 대국 2판(흰·검 어느 쪽이든, 대소문자 무시)
    [P + "cc:Foe|Other|300", good],                                     // 남의 chess.com 대국 — 제외
    [P + "id:pvp-12", good], [P + "id:bot-3", good],                    // 내 OpenChess 대국 2판
    [P + "pgn:e4 e5", good], [P + "fen:x|y", good],                     // PGN·FEN 리뷰(내 대국인지 알 수 없음) — 제외
    [P + "cc:Me|Foe|400", JSON.stringify({ v: 0, result: { moves: [{}] } })],   // 옛 버전 — 제외
    [P + "cc:Me|Foe|500", JSON.stringify({ v: 1, result: { moves: [] } })],     // 수 목록 없음 — 제외
    [P + "cc:Me|Foe|600", "{깨진 JSON"],                                // 깨진 값 — 제외(throw 안 함)
    ["oc-review-pos:cc:Me|Foe|700", good],                              // 리뷰 결과가 아니라 위치 기록 — 제외
  ]);
  eq(R.countMyReviewedGames({ ccName: "me", version: 1, storage: st }), 4, "내 대국 4판(cc 2 + OpenChess 2)만 센다");
  eq(R.countMyReviewedGames({ ccName: "", version: 1, storage: st }), 2, "chess.com 아이디가 없으면 OpenChess 대국만 센다");
  eq(R.countMyReviewedGames({ ccName: "me", version: 1, storage: fake([]) }), 0, "빈 저장소는 0");
  eq(R.countMyReviewedGames({ ccName: "me", version: 1, storage: null }), 0, "저장소가 없어도 throw 없이 0(브라우저 밖)");
  eq(R.GROWTH_MIN_REVIEWS, 5, "성장 분석은 리뷰 5판부터");
}
// ── ② 하이라이트 ──
const mk = (san, white, kind, extra = {}) => ({ san, white, kind, lossWinPct: 20, best: null, ...extra });
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

// ── ③ 마스터 스타일 ──
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
  eq([S.formatDiff("w_e4", 0.44), S.formatDiff("checkRate", 1.286), S.formatDiff("length", 1.6), S.formatDiff("w_e4", null)], ["±44%p", "1.3배", "1.6배", "-"], "차이 표기");
  ok(S.STYLE_KEYS.every((k) => S.CRITERION_KIND[k]), "모든 기준에 판정 방식(share·intensity·length)이 있다");
  const rowsSame = S.compareCriteria(twin[3], twin[3]);
  ok(rowsSame.length === 13 && rowsSame.every((r) => r.level === "same" || r.level === "na"), "같은 벡터는 모든 기준이 거의 같음");
  ok(S.STYLE_KEYS.every((k) => S.criterionLabel(k) && S.criterionLabel(k) !== k), "모든 기준에 이름이 있다");
  eq([S.formatCriterion("w_e4", 0.456), S.formatCriterion("length", 0.7), S.formatCriterion("drawRate", null)], ["46%", "약 42수", "-"], "값 표기(비율·평균 수·없음)");
}
// ── ④ 연결 ──
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const review = rd("src/app/review.jsx"), growth = rd("src/app/growth.jsx"), app = rd("src/App.jsx"), quest = rd("src/app/learn.jsx"), common = rd("src/app/common.jsx");
ok(/pickHighlights\(/.test(review) && /drawHighlightCard/.test(review), "리뷰 공유 시트가 하이라이트 카드를 쓰지 않음");
ok(/<GrowthPanel /.test(quest) && /growthUid/.test(quest) && /growthGames/.test(quest), "학습 탭(LearnTab)이 성장 분석(GrowthPanel)을 펼쳐 보이지 않음");
// renderProfile={(mid) => <UserProfilePage .../>}처럼 prop 안에 ">"가 있어 태그 끝을 정규식으로 못 찾으므로, <LearnTab 뒤 일정 구간 안에서 두 prop을 찾는다.
{ const i = app.indexOf("<LearnTab "); const seg = i >= 0 ? app.slice(i, i + 4000) : ""; ok(/growthUid=\{uid\}/.test(seg) && /growthGames=\{chesscom\.games\}/.test(seg), "App이 학습 탭에 uid·chess.com 대국을 넘기지 않음"); }
// 게이트: 5판 미만이면 마스터 스타일을 포함한 성장 분석 요소를 가리고 게이지 바 안내(ReviewGate)만 보인다.
ok(/countMyReviewedGames\(\{/.test(growth) && /reviewed >= GROWTH_MIN_REVIEWS/.test(growth), "성장 분석이 리뷰 판 수(5판)로 열리지 않음");
ok(/\{open \? <MasterStyle [^>]*\/> : <ReviewGate /.test(growth), "리뷰 5판 미만이면 ReviewGate(게이지 바)만 보여야 함");
{ const gate = (growth.match(/function ReviewGate[\s\S]*?\n}\n/) || [""])[0]; ok(/role="progressbar"/.test(gate) && /Array\.from\(\{ length: need \}/.test(gate) && /더 리뷰하면 열림/.test(gate) && /리뷰 버튼/.test(gate), "ReviewGate: 게이지 바(칸 수 = 필요한 판 수)·남은 판 수·리뷰 안내가 있어야 함"); }
// 마스터 스타일
ok(/matchMasters\(/.test(growth) && /compareCriteria\(/.test(growth), "성장 분석이 마스터 스타일 로직(기준별 비교 포함)을 쓰지 않음");
ok(/aria-label=\{t\("마스터 이름으로 검색"\)\}/.test(growth) && /const suggestions = useMemo/.test(growth), "마스터 비교 헤더의 마스터 자리가 이름 검색창이 아님");
ok(/const peakText = /.test(growth) && !/"Elo " \+/.test(growth), "마스터 레이팅 표기가 모든 언어 공통 \"Peak 2xxx\"가 아님");
ok(CRITERIA_GROUPS.flatMap((g) => g.keys).length === S.STYLE_KEYS.length && S.STYLE_KEYS.every((k) => CRITERIA_GROUPS.some((g) => g.keys.includes(k))), "기준 표(CRITERIA_GROUPS)가 스타일 특징 13개를 하나도 빠짐없이 한 번씩 담지 않음");
// 삭제한 성장 분석 코드(약점 지도·복습 카드·오프닝 실수·실수 기록)가 되살아나지 않게 — 새 설계가 확정되기 전에는 넣지 않는다.
{ const all = [review, growth, app, quest, common, rd("src/app/gameHistory.jsx")].join("\n");
  ok(!/lib\/weakness\.js|growthStore|openingMistakes|recordReviewMistakes|WeaknessMap|ReviewCards|OpeningMistakes|occ-growth/.test(all.replace(/occ_growth_v1/g, "")), "삭제한 성장 분석 코드(약점 지도·복습 카드·오프닝 실수·실수 기록) 참조가 다시 생김"); }
if (fails.length) { console.error("✖ check-growth 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-growth: 리뷰 5판 게이트(내 대국 집계·게이지 바), 하이라이트 선정, 마스터 스타일 매칭과 화면 연결이 유지된다");
